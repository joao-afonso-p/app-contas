import { create } from 'zustand'
import type { DataAdapter } from '../data/adapter'
import { firebaseConfigured, FirebaseAdapter } from '../data/firebaseAdapter'
import { LocalAdapter } from '../data/localAdapter'
import { addMonths, currentMonthKey, monthOfDate, nowISO, todayISO, uid } from '../lib/format'
import { syncedProjectionPlans } from '../lib/calc/projections'
import type {
  AnyDoc,
  AppMeta,
  BucketKind,
  CollectionName,
  DataSet,
  ExpenseCategory,
  IncomeSource,
  InvestmentVehicle,
  MonthKey,
  MonthlyPlan,
  ProjectionPlan,
  SavingsBucket,
  SavingsMovement,
  Transaction,
  TransactionCategory,
} from '../types'
import { COLLECTIONS, emptyDataSet } from '../types'

export type Screen =
  | 'planeamento'
  | 'movimentos'
  | 'gastos'
  | 'budgets'
  | 'projecoes'
  | 'overview'
  | 'definicoes'
  | 'historico'

export type Mode = 'local' | 'space'
type Status = 'boot' | 'welcome' | 'ready' | 'error'

const LS_MODE = 'contas.mode'
const LS_SPACE = 'contas.space'
const LS_THEME = 'contas.theme'

interface Store {
  status: Status
  error: string | null
  mode: Mode
  spaceCode: string | null
  data: DataSet
  screen: Screen
  month: MonthKey // mês selecionado no planeamento
  theme: 'light' | 'dark'
  firebaseAvailable: boolean

  init(): Promise<void>
  chooseLocal(): Promise<void>
  resetAccount(): Promise<void>
  completeOnboarding(input: {
    incomeSources: { name: string; isRent: boolean }[]
    expenseCategories: { name: string }[]
    transactionCategories: { name: string }[]
    buckets: { name: string; kind: BucketKind; targetAmount?: number; targetDate?: MonthKey; initialValue: number }[]
    vehicles: { name: string; initialValue: number }[]
  }): Promise<void>
  joinSpace(code: string, migrateLocal: boolean): Promise<void>
  leaveSpace(): Promise<void>
  setScreen(s: Screen): void
  setMonth(m: MonthKey): void
  toggleTheme(): void

  put<C extends CollectionName>(c: C, doc: DataSet[C][number]): Promise<void>
  remove(c: CollectionName, id: string): Promise<void>

  // Planeamento
  setPlanValue(month: MonthKey, section: 'income' | 'expenses' | 'savings' | 'autoInvestments', id: string, value: number): Promise<void>
  setProjectionValue(month: MonthKey, section: 'income' | 'expenses' | 'savings' | 'autoInvestments', id: string, value: number): Promise<void>
  applyPlan(month: MonthKey): Promise<void>
  reopenPlan(month: MonthKey): Promise<void>

  // Movimentos e gastos
  addMovement(m: Omit<SavingsMovement, 'id'>): Promise<void>
  addTransfer(p: { date: string; fromBucketId: string; toBucketId: string; amount: number; description: string }): Promise<void>
  addTransactions(ts: Omit<Transaction, 'id'>[]): Promise<void>
  setTransactionReposto(transactionId: string, reposto: boolean): Promise<void>

  // Objetivos extraordinários
  goalPartialPayment(bucketId: string, amount: number, description: string): Promise<void>
  goalComplete(bucketId: string): Promise<void>

  // Projeções
  setMeta(patch: Partial<Omit<AppMeta, 'id'>>): Promise<void>
  syncProjectionToReality(): Promise<void>
}

let adapter: DataAdapter | null = null

async function startAdapter(next: DataAdapter, set: (p: Partial<Store>) => void): Promise<void> {
  adapter?.stop()
  adapter = next
  await next.start((data) => set({ data }))
}

// Um override de saldo é uma correção pontual — deixa de fazer sentido assim
// que a fonte (o plano) é editada diretamente, senão a edição fica "escondida"
// atrás do valor congelado (ver computeBalances em lib/calc/balances.ts).
async function clearStaleOverride(
  get: () => Store,
  month: MonthKey,
  section: 'income' | 'expenses' | 'savings' | 'autoInvestments',
  bucketId: string,
): Promise<void> {
  if (section !== 'savings') return
  const overrideId = `${month}_${bucketId}`
  if (get().data.balanceOverrides.some((o) => o.id === overrideId)) {
    await adapter!.remove('balanceOverrides', overrideId)
  }
}

export const useStore = create<Store>((set, get) => ({
  status: 'boot',
  error: null,
  mode: 'local',
  spaceCode: null,
  data: emptyDataSet(),
  screen: 'overview',
  month: currentMonthKey(),
  theme: (localStorage.getItem(LS_THEME) as 'light' | 'dark') ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  firebaseAvailable: firebaseConfigured(),

  async init() {
    const mode = localStorage.getItem(LS_MODE) as Mode | null
    const space = localStorage.getItem(LS_SPACE)
    try {
      if (mode === 'space' && space && firebaseConfigured()) {
        await startAdapter(new FirebaseAdapter(space), set)
        set({ status: 'ready', mode: 'space', spaceCode: space })
      } else if (mode === 'local') {
        await startAdapter(new LocalAdapter(), set)
        set({ status: 'ready', mode: 'local' })
      } else {
        set({ status: 'welcome' })
      }
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
  },

  async chooseLocal() {
    const local = new LocalAdapter()
    await startAdapter(local, set)
    localStorage.setItem(LS_MODE, 'local')
    set({ status: 'ready', mode: 'local' })
  },

  async resetAccount() {
    const local = new LocalAdapter()
    await startAdapter(local, set)
    await local.clear()
    localStorage.setItem(LS_MODE, 'local')
    set({ status: 'ready', mode: 'local' })
  },

  // Onboarding: cria toda a configuração inicial (fontes de rendimento,
  // despesas, categorias de gastos, baldes/objetivos, veículos) de uma vez.
  // Para cada balde, cria o "Saldo inicial" no mês anterior ao atual (para o
  // mês atual ficar vazio para preencher no Planeamento) — mantém-se mesmo a
  // 0€ para haver sempre um registo. Termina marcando `onboardingDone` na
  // meta, para a conta não voltar a cair em onboarding mesmo que o
  // utilizador não crie nenhum balde (ver needsOnboarding).
  async completeOnboarding({ incomeSources, expenseCategories, transactionCategories, buckets, vehicles }) {
    const month = addMonths(currentMonthKey(), -1)

    const incomeSourceDocs: IncomeSource[] = incomeSources.map((s, i) => ({
      id: uid(), name: s.name, isRent: s.isRent, archived: false, order: i,
    }))
    const expenseCategoryDocs: ExpenseCategory[] = expenseCategories.map((c, i) => ({
      id: uid(), name: c.name, archived: false, order: i,
    }))
    const transactionCategoryDocs: TransactionCategory[] = transactionCategories.map((c, i) => ({
      id: uid(), name: c.name, archived: false, order: i,
    }))
    const bucketDocs: SavingsBucket[] = buckets.map((b, i) => ({
      id: uid(),
      name: b.name,
      kind: b.kind,
      archived: false,
      order: i,
      ...(b.kind === 'goal' ? { targetAmount: b.targetAmount, status: 'active' as const } : {}),
      ...(b.targetDate ? { targetDate: b.targetDate } : {}),
    }))
    const vehicleDocs: InvestmentVehicle[] = vehicles.map((v, i) => ({
      id: uid(),
      name: v.name,
      archived: false,
      order: i,
      ...(v.initialValue ? { initialBalance: v.initialValue } : {}),
    }))

    if (incomeSourceDocs.length) await adapter!.putMany('incomeSources', incomeSourceDocs)
    if (expenseCategoryDocs.length) await adapter!.putMany('expenseCategories', expenseCategoryDocs)
    if (transactionCategoryDocs.length) await adapter!.putMany('transactionCategories', transactionCategoryDocs)
    if (bucketDocs.length) await adapter!.putMany('savingsBuckets', bucketDocs)
    if (vehicleDocs.length) await adapter!.putMany('investmentVehicles', vehicleDocs)

    const movements: SavingsMovement[] = bucketDocs.map((b, i) => ({
      id: uid(),
      date: `${month}-01`,
      bucketId: b.id,
      amount: buckets[i].initialValue || 0,
      description: 'Saldo inicial',
      createdAt: nowISO(),
    }))
    if (movements.length) await adapter!.putMany('savingsMovements', movements)

    const meta = get().data.meta[0] ?? { id: 'meta' as const }
    await adapter!.put('meta', { ...meta, onboardingDone: true })
  },

  async joinSpace(code, migrateLocal) {
    const trimmed = code.trim().toLowerCase()
    if (!trimmed) throw new Error('Código vazio')
    let localSnapshot: DataSet | null = null
    if (migrateLocal) {
      const local = new LocalAdapter()
      await local.start(() => {})
      localSnapshot = local.snapshot()
      local.stop()
    }
    const fb = new FirebaseAdapter(trimmed)
    await startAdapter(fb, set)
    if (migrateLocal && localSnapshot && fb.isEmpty()) {
      for (const c of COLLECTIONS) {
        if (localSnapshot[c].length) await fb.putMany(c, localSnapshot[c])
      }
    }
    localStorage.setItem(LS_MODE, 'space')
    localStorage.setItem(LS_SPACE, trimmed)
    set({ status: 'ready', mode: 'space', spaceCode: trimmed })
  },

  async leaveSpace() {
    await startAdapter(new LocalAdapter(), set)
    localStorage.setItem(LS_MODE, 'local')
    localStorage.removeItem(LS_SPACE)
    set({ mode: 'local', spaceCode: null })
  },

  setScreen: (screen) => set({ screen }),
  setMonth: (month) => set({ month }),
  toggleTheme: () => {
    const theme = get().theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem(LS_THEME, theme)
    set({ theme })
  },

  put: (c, doc) => adapter!.put(c, doc as AnyDoc),
  remove: (c, id) => adapter!.remove(c, id),

  // Editar um campo cria/atualiza sempre um rascunho (closed: false) — só passa
  // a contar para os saldos quando o utilizador aplicar o plano (`applyPlan`).
  async setPlanValue(month, section, id, value) {
    const existing = get().data.monthlyPlans.find((p) => p.id === month)
    const base = existing ?? effectivePlan(get().data, month)
    const plan: MonthlyPlan = {
      ...base,
      id: month,
      [section]: { ...base[section], [id]: value },
      closed: false,
    }
    await adapter!.put('monthlyPlans', plan)
    await clearStaleOverride(get, month, section, id)
  },

  async setProjectionValue(month, section, id, value) {
    const existing = get().data.projectionPlans.find((p) => p.id === month)
    const plan: ProjectionPlan = existing
      ? { ...existing, [section]: { ...existing[section], [id]: value } }
      : { id: month, income: {}, expenses: {}, savings: {}, [section]: { [id]: value } }
    await adapter!.put('projectionPlans', plan)
    await clearStaleOverride(get, month, section, id)
    // Editar uma célula manualmente já conta como "projeções preenchidas" —
    // protege o resto do horizonte de ser reescrito numa sincronização futura.
    if (!get().data.meta[0]?.projectionsInitialized) {
      await get().setMeta({ projectionsInitialized: true })
    }
  },

  // Confirma o plano do mês (rascunho ou não) — a partir daqui conta para os saldos.
  async applyPlan(month) {
    const base = effectivePlan(get().data, month)
    await adapter!.put('monthlyPlans', { ...base, id: month, closed: true })
  },

  // Reabre um plano aplicado para edição — deixa de contar para os saldos até
  // ser aplicado de novo.
  async reopenPlan(month) {
    const existing = get().data.monthlyPlans.find((p) => p.id === month)
    if (!existing) return
    await adapter!.put('monthlyPlans', { ...existing, closed: false })
  },

  addMovement: (m) => adapter!.put('savingsMovements', { ...m, id: uid(), createdAt: nowISO() }),

  async addTransfer({ date, fromBucketId, toBucketId, amount, description }) {
    const buckets = get().data.savingsBuckets
    const fromName = buckets.find((b) => b.id === fromBucketId)?.name ?? '?'
    const toName = buckets.find((b) => b.id === toBucketId)?.name ?? '?'
    const desc = description || `Transferência: ${fromName} → ${toName}`
    const transferGroupId = uid()
    const value = Math.abs(amount)
    const createdAt = nowISO()
    await adapter!.putMany('savingsMovements', [
      { id: uid(), date, bucketId: fromBucketId, amount: -value, description: desc, transferGroupId, createdAt },
      { id: uid(), date, bucketId: toBucketId, amount: value, description: desc, transferGroupId, createdAt },
    ])
  },

  async addTransactions(ts) {
    await adapter!.putMany('transactions', ts.map((t) => ({ ...t, id: uid(), createdAt: nowISO() })))
  },

  // Confirmar reposição cria automaticamente a saída do balde de origem;
  // desmarcar remove esse movimento. Sentido único: gastos -> movimentos.
  async setTransactionReposto(transactionId, reposto) {
    const transaction = get().data.transactions.find((t) => t.id === transactionId)
    if (!transaction) return
    await adapter!.put('transactions', { ...transaction, reposto })
    if (reposto && transaction.fonteBucketId) {
      await adapter!.put('savingsMovements', {
        id: uid(),
        date: todayISO(),
        bucketId: transaction.fonteBucketId,
        amount: -Math.abs(transaction.amount),
        description: `Reposição: ${transaction.description || 'gasto'}`,
        transactionId: transaction.id,
        createdAt: nowISO(),
      })
    } else if (!reposto) {
      const linked = get().data.savingsMovements.filter((m) => m.transactionId === transactionId)
      for (const m of linked) await adapter!.remove('savingsMovements', m.id)
    }
  },

  // Pagamento parcial: liberta X do balde (movimento de saída) e reduz o objetivo.
  async goalPartialPayment(bucketId, amount, description) {
    const bucket = get().data.savingsBuckets.find((b) => b.id === bucketId)
    if (!bucket) return
    await get().addMovement({
      date: todayISO(),
      bucketId,
      amount: -Math.abs(amount),
      description: description || `Pagamento parcial — ${bucket.name}`,
    })
    if (bucket.targetAmount) {
      const updated: SavingsBucket = {
        ...bucket,
        targetAmount: Math.max(0, bucket.targetAmount - Math.abs(amount)),
      }
      await adapter!.put('savingsBuckets', updated)
    }
  },

  async goalComplete(bucketId) {
    const bucket = get().data.savingsBuckets.find((b) => b.id === bucketId)
    if (!bucket) return
    await adapter!.put('savingsBuckets', { ...bucket, status: 'done', archived: true })
  },

  async setMeta(patch) {
    const meta = get().data.meta[0] ?? { id: 'meta' as const }
    await adapter!.put('meta', { ...meta, ...patch })
  },

  // Alinha as projeções com a realidade. Os saldos NUNCA são escritos aqui —
  // são sempre calculados (ver computeBalances/Projecoes.tsx), pelo que já
  // encadeiam sozinhos a partir do saldo real do mês atual. Se ainda não há
  // projeções (primeira sincronização, ver `projectionsInitialized`), cria a
  // grelha toda do horizonte igual ao plano real do mês atual. Se já há
  // projeções (o utilizador já as editou ou já sincronizou antes), só realinha
  // o mês atual — o resto do futuro (as alocações já editadas) fica
  // exatamente como estava; os saldos futuros mudam por si só porque o ponto
  // de partida (o saldo real do mês atual) mudou.
  async syncProjectionToReality() {
    const { data } = get()
    const month = currentMonthKey()
    const currentPlan = data.monthlyPlans.find((p) => p.id === month)
    if (!currentPlan) return
    const projectionsInitialized = data.meta[0]?.projectionsInitialized ?? false
    const horizon = data.meta[0]?.projectionHorizon ?? 18
    const plans = syncedProjectionPlans({ currentMonth: month, currentPlan, projectionsInitialized, horizon })
    await adapter!.putMany('projectionPlans', plans)
    if (!projectionsInitialized) await get().setMeta({ projectionsInitialized: true })
  },
}))

// ---------- Selectors auxiliares ----------

export const activeIncomeSources = (d: DataSet) =>
  d.incomeSources.filter((s) => !s.archived).sort((a, b) => a.order - b.order)

export const activeExpenseCategories = (d: DataSet) =>
  d.expenseCategories.filter((c) => !c.archived).sort((a, b) => a.order - b.order)

export const activeBuckets = (d: DataSet) =>
  d.savingsBuckets.filter((b) => !b.archived).sort((a, b) => a.order - b.order)

export const firstPlanMonth = (d: DataSet): MonthKey => {
  const months = [
    ...d.monthlyPlans.map((p) => p.id),
    ...d.savingsMovements.map((m) => monthOfDate(m.date)),
  ].sort()
  return months[0] ?? currentMonthKey()
}

// Plano "efetivo" a mostrar para um mês: o registo gravado, ou — se ainda não
// existir — uma cópia (não persistida) do último mês anterior gravado, para o
// planeamento vir sempre pré-preenchido com o mês respetivo anterior.
export function effectivePlan(d: DataSet, month: MonthKey): MonthlyPlan {
  const existing = d.monthlyPlans.find((p) => p.id === month)
  if (existing) return existing
  const prior = [...d.monthlyPlans].filter((p) => p.id < month).sort((a, b) => (a.id < b.id ? 1 : -1))[0]
  return prior
    ? {
        id: month,
        income: { ...prior.income },
        expenses: { ...prior.expenses },
        savings: { ...prior.savings },
        autoInvestments: { ...prior.autoInvestments },
      }
    : { id: month, income: {}, expenses: {}, savings: {}, autoInvestments: {} }
}

// Só true numa conta genuinamente virgem (sem histórico e sem ter passado
// pelo onboarding) — dispara o ecrã de onboarding em App.tsx, local ou
// espaço. Contas já em uso (com histórico) nunca disparam, mesmo sem a flag
// `onboardingDone`, para não afetar contas antigas que nunca a tiveram.
export const needsOnboarding = (d: DataSet): boolean =>
  !d.meta[0]?.onboardingDone
  && d.monthlyPlans.length === 0
  && d.savingsMovements.length === 0
  && d.transactions.length === 0

export const activeVehicles = (d: DataSet) =>
  d.investmentVehicles.filter((v) => !v.archived).sort((a, b) => a.order - b.order)

// Agrega quanto foi enviado de cada balde para cada veículo (soma das saídas com vehicleId).
export interface VehicleAllocation {
  bucketId: string
  vehicleId: string
  invested: number
}

export const vehicleAllocations = (d: DataSet): VehicleAllocation[] => {
  const map = new Map<string, VehicleAllocation>()
  for (const m of d.savingsMovements) {
    if (!m.vehicleId) continue
    const key = `${m.bucketId}_${m.vehicleId}`
    const entry = map.get(key) ?? { bucketId: m.bucketId, vehicleId: m.vehicleId, invested: 0 }
    entry.invested += -m.amount
    map.set(key, entry)
  }
  return [...map.values()].filter((a) => a.invested > 0.005)
}

// Total acumulado (até ao mês atual, inclusive) de débitos automáticos por veículo.
export const autoInvestmentTotals = (d: DataSet): Map<string, number> => {
  const totals = new Map<string, number>()
  const month = currentMonthKey()
  for (const plan of d.monthlyPlans) {
    if (plan.id > month) continue
    for (const [vehicleId, value] of Object.entries(plan.autoInvestments ?? {})) {
      totals.set(vehicleId, (totals.get(vehicleId) ?? 0) + value)
    }
  }
  return totals
}

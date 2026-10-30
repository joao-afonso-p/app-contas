import { create } from 'zustand'
import type { DataAdapter } from '../data/adapter'
import { firebaseConfigured, FirebaseAdapter, redeemPremiumCode } from '../data/firebaseAdapter'
import { LocalAdapter } from '../data/localAdapter'
import { addMonths, currentMonthKey, generateSpaceCode, monthOfDate, nowISO, todayISO, uid } from '../lib/format'
import { plannedMovementGroup, syncedProjectionPlans } from '../lib/calc/projections'
import { activeAccountingMonth, bucketBalance, computeBalances } from '../lib/calc/balances'
import { allocationSummary, cumulativeAutoInvestmentTotals, round2 } from '../lib/calc/allocation'
import { activeOnly, allocatedMonths, SECTION_OF } from '../lib/calc/archive'
import { txCategoryFields } from '../lib/calc/categories'
import { planMerge } from '../lib/calc/mergeExpenses'
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
  PlannedMovement,
  ProjectionPlan,
  SavingsBucket,
  SavingsMovement,
  Subcategory,
  Transaction,
} from '../types'
import { COLLECTIONS, emptyDataSet } from '../types'
import { initialScreen, pushScreen } from '../lib/route'
import { setMonthStartConfig, type MonthStartConfig } from '../lib/financialMonth'

export type Screen =
  | 'planeamento'
  | 'movimentos'
  | 'gastos'
  | 'budgets'
  | 'investimentos'
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
  importBackup(data: DataSet): Promise<void>
  completeOnboarding(input: {
    incomeSources: { name: string; isRent: boolean; expectedDay?: number }[]
    expenseCategories: { name: string; subcategories?: string[] }[]
    buckets: { name: string; kind: BucketKind; targetAmount?: number; targetDate?: MonthKey; initialValue: number }[]
    vehicles: { name: string; initialValue: number }[]
  }): Promise<void>
  joinSpace(code: string, migrateLocal: boolean): Promise<void>
  createPremiumSpace(premiumCode: string): Promise<void>
  leaveSpace(): Promise<void>
  setScreen(s: Screen): void
  setMonth(m: MonthKey): void
  setMonthStartDefault(day: number, fromMonth: MonthKey): Promise<void>
  setMonthStartOverride(month: MonthKey, day: number | null): Promise<void>
  toggleTheme(): void

  put<C extends CollectionName>(c: C, doc: DataSet[C][number]): Promise<void>
  remove(c: CollectionName, id: string): Promise<void>

  // Planeamento
  setLateTransferred(month: MonthKey, incomeId: string, done: boolean): Promise<void>
  setPlanValue(month: MonthKey, section: 'income' | 'expenses' | 'savings' | 'autoInvestments', id: string, value: number): Promise<void>
  setProjectionValue(month: MonthKey, section: 'income' | 'expenses' | 'savings' | 'autoInvestments', id: string, value: number): Promise<void>
  setProjectionRange(section: 'income' | 'expenses' | 'savings' | 'autoInvestments', id: string, months: MonthKey[], value: number): Promise<void>
  // Edição em lote de células soltas (grelha das Projeções: colar, preencher,
  // desfazer…). Uma só escrita; só toca em `projectionPlans`.
  setProjectionCells(changes: { month: MonthKey; section: 'income' | 'expenses' | 'savings' | 'autoInvestments'; id: string; value: number }[]): Promise<void>
  applyPlan(month: MonthKey): Promise<void>
  reopenPlan(month: MonthKey): Promise<void>

  // Movimentos e gastos
  addMovement(m: Omit<SavingsMovement, 'id'>): Promise<void>
  addTransfer(p: { date: string; fromBucketId: string; toBucketId: string; amount: number; description: string }): Promise<void>
  addPlannedTransfer(p: { month: MonthKey; fromBucketId: string; toBucketId: string; amount: number; description: string }): Promise<void>
  // Atuam nas duas pernas quando é uma transferência prevista.
  setPlannedMovementDone(m: PlannedMovement, done: boolean): Promise<void>
  removePlannedMovement(m: PlannedMovement): Promise<void>
  addTransactions(ts: Omit<Transaction, 'id'>[]): Promise<void>
  // Grava um gasto (novo ou existente) com categoria principal (despesa do plano
  // ou balde de poupança) + subcategoria opcional. Se a categoria for um balde,
  // cria/atualiza a saída correspondente na poupança; se deixar de ser, remove-a.
  saveTransaction(
    fields: { date: string; amount: number; nome?: string; description: string; groupId: string; subcategoryId?: string },
    existingId?: string,
  ): Promise<void>
  setTransactionCategory(transactionId: string, groupId: string, subcategoryId?: string): Promise<void>
  deleteTransaction(transactionId: string): Promise<void>
  // Edição em massa: muda a data e/ou a categoria (+subcategoria) de vários gastos.
  // Campos omitidos ficam como estão. Mantém as saídas da poupança em sincronia.
  bulkUpdateTransactions(ids: string[], changes: { date?: string; groupId?: string; subcategoryId?: string }): Promise<void>
  // Junta o valor planeado de despesas apagadas/arquivadas (planos reais e
  // projeções, todos os meses) numa despesa ativa. Opcionalmente reclassifica
  // também os gastos que estavam nessas despesas.
  mergeExpensesInto(fromIds: string[], targetId: string, moveTransactions: boolean): Promise<void>
  setTransactionReposto(transactionId: string, reposto: boolean): Promise<void>
  revertAutoBucketMovements(): Promise<number>
  createMovementFromTransaction(transactionId: string, bucketId: string, description: string): Promise<boolean>

  // Objetivos extraordinários
  goalPartialPayment(bucketId: string, amount: number, description: string): Promise<void>
  goalComplete(bucketId: string): Promise<void>

  // Projeções
  setMeta(patch: Partial<Omit<AppMeta, 'id'>>): Promise<void>
  syncProjectionToReality(): Promise<void>
}

let adapter: DataAdapter | null = null
// Enquanto o utilizador não escolher um mês no Planeamento, segue o mês financeiro atual.
let monthTouched = false

export const monthStartConfigOf = (meta: AppMeta | undefined): MonthStartConfig => ({
  rules: meta?.monthStartRules ?? [],
  overrides: meta?.monthStartOverrides ?? {},
})

async function startAdapter(next: DataAdapter, set: (p: Partial<Store>) => void): Promise<void> {
  adapter?.stop()
  adapter = next
  await next.start((data) => {
    // O mês financeiro depende dos metadados: atualiza-se antes de os ecrãs recalcularem.
    setMonthStartConfig(monthStartConfigOf(data.meta[0]))
    set({ data, ...(monthTouched ? {} : { month: currentMonthKey() }) })
  })
}

export const useStore = create<Store>((set, get) => ({
  status: 'boot',
  error: null,
  mode: 'local',
  spaceCode: null,
  data: emptyDataSet(),
  screen: initialScreen(),
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
        await migrateBalanceOverrides(get)
        set({ status: 'ready', mode: 'space', spaceCode: space })
      } else if (mode === 'local') {
        await startAdapter(new LocalAdapter(), set)
        await migrateBalanceOverrides(get)
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

  // Importa uma cópia de segurança (só modo local): substitui TODOS os dados
  // deste dispositivo. Nunca toca no Firebase/espaço.
  async importBackup(data) {
    if (get().mode !== 'local') throw new Error('Importar só está disponível no modo local.')
    const local = new LocalAdapter()
    await startAdapter(local, set)
    await local.clear()
    const toWrite: DataSet = { ...data, meta: [...data.meta] }
    // Garante que não cai em onboarding se o ficheiro não tiver histórico.
    if (needsOnboarding(toWrite)) {
      toWrite.meta = [{ ...(toWrite.meta[0] ?? { id: 'meta' as const }), id: 'meta', onboardingDone: true }]
    }
    for (const name of COLLECTIONS) {
      const docs = toWrite[name]
      if (docs.length > 0) await local.putMany(name, docs)
    }
    await migrateBalanceOverrides(get)
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
  async completeOnboarding({ incomeSources, expenseCategories, buckets, vehicles }) {
    const month = addMonths(currentMonthKey(), -1)

    const incomeSourceDocs: IncomeSource[] = incomeSources.map((s, i) => ({
      id: uid(), name: s.name, isRent: s.isRent, ...(s.expectedDay ? { expectedDay: s.expectedDay } : {}), archived: false, order: i,
    }))
    const expenseCategoryDocs: ExpenseCategory[] = expenseCategories.map((c, i) => ({
      id: uid(), name: c.name, archived: false, order: i,
    }))
    const subcategoryDocs: Subcategory[] = expenseCategories.flatMap((c, i) =>
      (c.subcategories ?? []).map((name, j) => ({
        id: uid(), parentId: expenseCategoryDocs[i].id, name, archived: false, order: j,
      })),
    )
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
    if (subcategoryDocs.length) await adapter!.putMany('subcategories', subcategoryDocs)
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

  // Cria um espaço sincronizado novo, mas só depois de confirmar que o
  // código de acesso premium é válido e ainda não foi usado (ver
  // redeemPremiumCode). Reutiliza joinSpace tal e qual: migra os dados
  // locais existentes (se houver) para o espaço novo, exatamente como o
  // botão "Criar espaço novo" já fazia antes de existirem códigos premium.
  async createPremiumSpace(premiumCode) {
    const newCode = generateSpaceCode()
    await redeemPremiumCode(premiumCode, newCode)
    await get().joinSpace(newCode, true)
  },

  async leaveSpace() {
    await startAdapter(new LocalAdapter(), set)
    localStorage.setItem(LS_MODE, 'local')
    localStorage.removeItem(LS_SPACE)
    set({ mode: 'local', spaceCode: null })
  },

  setScreen: (screen) => {
    pushScreen(screen)
    set({ screen })
  },
  setMonth: (month) => {
    monthTouched = true
    set({ month })
  },

  // Novo dia de início por defeito, a partir de `fromMonth` (inclusive). Os meses
  // anteriores nunca mudam: o histórico de defaults guarda cada regra.
  async setMonthStartDefault(day, fromMonth) {
    const d = Math.min(31, Math.max(1, Math.round(day)))
    const rules = (get().data.meta[0]?.monthStartRules ?? []).filter((r) => r.from !== fromMonth)
    rules.push({ from: fromMonth, day: d })
    rules.sort((a, b) => a.from.localeCompare(b.from))
    await get().setMeta({ monthStartRules: rules })
  },

  // Dia de início só para um mês (null = voltar ao default).
  async setMonthStartOverride(month, day) {
    const next = { ...(get().data.meta[0]?.monthStartOverrides ?? {}) }
    if (day === null) delete next[month]
    else next[month] = Math.min(31, Math.max(1, Math.round(day)))
    await get().setMeta({ monthStartOverrides: next })
  },
  toggleTheme: () => {
    const theme = get().theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem(LS_THEME, theme)
    set({ theme })
  },

  put: (c, doc) => adapter!.put(c, doc as AnyDoc),
  remove: (c, id) => adapter!.remove(c, id),

  // Editar um campo cria/atualiza sempre um rascunho (closed: false) — só passa
  // a contar para os saldos quando o utilizador aplicar o plano (`applyPlan`).
  // Marca/desmarca o lembrete "já transferi" de um income que chega depois.
  // Só grava no plano já existente e não mexe no estado aplicado (closed).
  async setLateTransferred(month, incomeId, done) {
    const existing = get().data.monthlyPlans.find((p) => p.id === month)
    if (!existing) return
    await adapter!.put('monthlyPlans', {
      ...existing,
      lateTransferred: { ...existing.lateTransferred, [incomeId]: done },
    })
  },

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
  },

  async setProjectionValue(month, section, id, value) {
    const existing = get().data.projectionPlans.find((p) => p.id === month)
    const plan: ProjectionPlan = existing
      ? { ...existing, [section]: { ...existing[section], [id]: value } }
      : { id: month, income: {}, expenses: {}, savings: {}, [section]: { [id]: value } }
    await adapter!.put('projectionPlans', plan)
    // Editar uma célula manualmente já conta como "projeções preenchidas" —
    // protege o resto do horizonte de ser reescrito numa sincronização futura.
    if (!get().data.meta[0]?.projectionsInitialized) {
      await get().setMeta({ projectionsInitialized: true })
    }
  },

  // Edição em bloco (linha toda ou um intervalo de meses) — um único putMany
  // em vez de N chamadas sequenciais a setProjectionValue.
  async setProjectionRange(section, id, months, value) {
    const { data } = get()
    const byMonth = new Map(data.projectionPlans.map((p) => [p.id, p]))
    const plans: ProjectionPlan[] = months.map((month) => {
      const existing = byMonth.get(month)
      return existing
        ? { ...existing, [section]: { ...existing[section], [id]: value } }
        : { id: month, income: {}, expenses: {}, savings: {}, [section]: { [id]: value } }
    })
    await adapter!.putMany('projectionPlans', plans)
    if (!data.meta[0]?.projectionsInitialized) {
      await get().setMeta({ projectionsInitialized: true })
    }
  },

  async setProjectionCells(changes) {
    const valid = changes.filter((c) => Number.isFinite(c.value))
    if (valid.length === 0) return
    const { data } = get()
    const existing = new Map(data.projectionPlans.map((p) => [p.id, p]))
    const touched = new Map<MonthKey, ProjectionPlan>()
    for (const ch of valid) {
      const base: ProjectionPlan = touched.get(ch.month) ?? existing.get(ch.month) ?? { id: ch.month, income: {}, expenses: {}, savings: {} }
      touched.set(ch.month, { ...base, [ch.section]: { ...(base[ch.section] ?? {}), [ch.id]: ch.value } })
    }
    await adapter!.putMany('projectionPlans', [...touched.values()])
    if (!data.meta[0]?.projectionsInitialized) {
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

  async addPlannedTransfer({ month, fromBucketId, toBucketId, amount, description }) {
    const buckets = get().data.savingsBuckets
    const fromName = buckets.find((b) => b.id === fromBucketId)?.name ?? '?'
    const toName = buckets.find((b) => b.id === toBucketId)?.name ?? '?'
    const desc = description || `Transferência: ${fromName} → ${toName}`
    const transferGroupId = uid()
    const value = Math.abs(amount)
    await adapter!.putMany('plannedMovements', [
      { id: uid(), month, bucketId: fromBucketId, amount: -value, description: desc, transferGroupId },
      { id: uid(), month, bucketId: toBucketId, amount: value, description: desc, transferGroupId },
    ])
  },

  async setPlannedMovementDone(m, done) {
    const legs = plannedMovementGroup(get().data.plannedMovements, m)
    await adapter!.putMany('plannedMovements', legs.map((l) => ({ ...l, done })))
  },

  async removePlannedMovement(m) {
    const legs = plannedMovementGroup(get().data.plannedMovements, m)
    await Promise.all(legs.map((l) => adapter!.remove('plannedMovements', l.id)))
  },

  async addTransactions(ts) {
    const docs: Transaction[] = ts.map((t) => ({ ...t, id: uid(), createdAt: nowISO() }))
    await adapter!.putMany('transactions', docs)
  },

  async saveTransaction(fields, existingId) {
    const { data } = get()
    const existing = existingId ? data.transactions.find((t) => t.id === existingId) : undefined
    if (existingId && !existing) return
    const base = { date: fields.date, amount: fields.amount, nome: fields.nome, description: fields.description }
    await writeTransaction(data, existing, base, fields.groupId, fields.subcategoryId)
  },

  async setTransactionCategory(transactionId, groupId, subcategoryId) {
    const { data } = get()
    const existing = data.transactions.find((t) => t.id === transactionId)
    if (!existing) return
    await writeTransaction(data, existing, {}, groupId, subcategoryId)
  },

  async bulkUpdateTransactions(ids, changes) {
    const { date, groupId, subcategoryId } = changes
    if (!date && !groupId) return
    for (const id of ids) {
      const data = get().data
      const existing = data.transactions.find((t) => t.id === id)
      if (!existing) continue
      if (groupId) {
        await writeTransaction(data, existing, date ? { date } : {}, groupId, subcategoryId)
      } else if (date) {
        await adapter!.put('transactions', { ...existing, date })
        for (const m of data.savingsMovements.filter((x) => x.transactionId === id)) {
          await adapter!.put('savingsMovements', { ...m, date })
        }
      }
    }
  },

  async mergeExpensesInto(fromIds, targetId, moveTransactions) {
    const { data } = get()
    if (!data.expenseCategories.some((c) => c.id === targetId && !c.archived)) return
    const res = planMerge(data, fromIds, targetId, moveTransactions)
    if (res.monthlyPlans.length) await adapter!.putMany('monthlyPlans', res.monthlyPlans)
    if (res.projectionPlans.length) await adapter!.putMany('projectionPlans', res.projectionPlans)
    if (res.transactions.length) await adapter!.putMany('transactions', res.transactions)
  },

  // Cria, a pedido do utilizador, a saída de poupança correspondente a um gasto.
  // A descrição nunca começa por "Gasto: " (reservado às saídas automáticas antigas,
  // que a limpeza em Definições remove). Só uma vez por gasto.
  async createMovementFromTransaction(transactionId, bucketId, description) {
    const { data } = get()
    const t = data.transactions.find((x) => x.id === transactionId)
    if (!t || !data.savingsBuckets.some((b) => b.id === bucketId)) return false
    if (data.savingsMovements.some((m) => m.transactionId === transactionId)) return false
    const text = description.trim() || t.description
    await get().addMovement({
      date: t.date,
      bucketId,
      amount: -Math.abs(t.amount),
      description: text.startsWith('Gasto: ') ? text.slice(7) : text,
      transactionId,
    })
    return true
  },

  async deleteTransaction(transactionId) {
    const linked = get().data.savingsMovements.filter((m) => m.transactionId === transactionId)
    await adapter!.remove('transactions', transactionId)
    for (const m of linked) await adapter!.remove('savingsMovements', m.id)
  },

  // Confirmar reposição cria automaticamente a saída do balde de origem;
  // desmarcar remove esse movimento. Sentido único: gastos -> movimentos.
  // Limpeza única: remove as saídas "Gasto: …" criadas automaticamente e volta a
  // marcar esses gastos como não repostos. Os gastos em si ficam intactos.
  async revertAutoBucketMovements() {
    const { data } = get()
    const auto = data.savingsMovements.filter(isAutoBucketMovement)
    for (const m of auto) {
      const t = data.transactions.find((x) => x.id === m.transactionId)
      if (t?.reposto) await adapter!.put('transactions', { ...t, reposto: false })
      await adapter!.remove('savingsMovements', m.id)
    }
    return auto.length
  },

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
  // são sempre calculados (ver computeProjectedBalances/Projecoes.tsx), pelo
  // que encadeiam a partir do último mês contabilístico aplicado. Se ainda não há
  // projeções (primeira sincronização, ver `projectionsInitialized`), cria a
  // grelha toda do horizonte igual ao plano real desse mês. Se já há
  // projeções (o utilizador já as editou ou já sincronizou antes), só realinha
  // o mês-base — o resto do futuro (as alocações já editadas) fica
  // exatamente como estava; os saldos futuros mudam por si só porque o ponto
  // de partida mudou.
  async syncProjectionToReality() {
    const { data } = get()
    const baseMonth = activeAccountingMonth(data.monthlyPlans, currentMonthKey())
    const savedBase = data.monthlyPlans.find((p) => p.id === baseMonth)
    if (!savedBase) return
    // Sem valores de itens arquivados/apagados na cópia para o horizonte.
    const basePlan = { ...savedBase, ...activeOnly(savedBase, data) }
    const projectionsInitialized = data.meta[0]?.projectionsInitialized ?? false
    const horizon = data.meta[0]?.projectionHorizon ?? 18
    const plans = syncedProjectionPlans({ baseMonth, basePlan, projectionsInitialized, horizon })
    await adapter!.putMany('projectionPlans', plans)
    if (!projectionsInitialized) await get().setMeta({ projectionsInitialized: true })
  },
}))

// ---------- Gastos com balde como categoria ----------
// Categorizar um gasto com um balde NUNCA cria nem apaga movimentos de poupança
// por si. Só se mantém em sincronia (data/valor/balde) uma saída já existente e
// ligada a esse gasto (reposição confirmada à mão, no fluxo antigo).

// Saídas criadas automaticamente ao categorizar (descrição "Gasto: …"). As
// "Reposição: …" do fluxo antigo (confirmadas à mão) nunca são tocadas.
export const isAutoBucketMovement = (m: SavingsMovement): boolean =>
  Boolean(m.transactionId) && m.description.startsWith('Gasto: ')

async function writeTransaction(
  data: DataSet,
  existing: Transaction | undefined,
  base: Partial<Pick<Transaction, 'date' | 'amount' | 'nome' | 'description'>>,
  groupId: string,
  subcategoryId: string | undefined,
): Promise<void> {
  const linked = existing ? data.savingsMovements.filter((m) => m.transactionId === existing.id) : []
  let cat = txCategoryFields(data, groupId, subcategoryId)
  // Reposição já confirmada e ligada a uma saída, sem mudar de balde: mantém-na.
  const keepLinked =
    Boolean(existing?.reposto) && linked.length > 0 && cat.fonteBucketId !== undefined && existing?.fonteBucketId === cat.fonteBucketId
  if (keepLinked) cat = { ...cat, reposto: true }
  // Gasto antigo "repor da poupança" pendente, sem mudar de balde: mantém o estado.
  else if (existing && !existing.planCategoryId && existing.repoePoupanca && existing.fonteBucketId === groupId) {
    cat = { ...cat, reposto: existing.reposto }
  }
  const tx: Transaction = existing
    ? { ...existing, ...base, ...cat }
    : { id: uid(), createdAt: nowISO(), categoryId: '', date: '', amount: 0, description: '', ...base, ...cat }
  await adapter!.put('transactions', tx)

  // Saída ligada: só acompanha data/valor se o balde se mantém. Se o gasto deixou
  // de ser do balde, a saída (que a app criou) é removida para não distorcer o saldo.
  if (keepLinked) {
    const m = linked[0]
    await adapter!.put('savingsMovements', { ...m, date: tx.date, amount: -Math.abs(tx.amount) })
    for (const extra of linked.slice(1)) await adapter!.remove('savingsMovements', extra.id)
  } else if (existing?.reposto && linked.length > 0 && !tx.reposto) {
    for (const m of linked.filter(isAutoBucketMovement)) await adapter!.remove('savingsMovements', m.id)
  }
}

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

// O conceito de "override de saldo" foi descontinuado (ver Overview.tsx e
// Projecoes.tsx — nenhuma UI cria overrides novos). Esta migração, executada
// uma vez no arranque, converte overrides antigos no movimento equivalente
// (a diferença necessária para atingir o saldo fixado) e remove o override,
// para nenhum dado antigo ficar "escondido" atrás de um valor congelado.
async function migrateBalanceOverrides(get: () => Store): Promise<void> {
  const { data } = get()
  if (data.balanceOverrides.length === 0) return
  const overrides = [...data.balanceOverrides].sort((a, b) => a.month.localeCompare(b.month))
  let movements = [...data.savingsMovements]
  const newMovements: SavingsMovement[] = []
  for (const ov of overrides) {
    const table = computeBalances({
      buckets: data.savingsBuckets,
      plans: data.monthlyPlans,
      movements,
      overrides: [],
      from: firstPlanMonth(data),
      to: ov.month,
    })
    const delta = round2(ov.balance - bucketBalance(table, ov.bucketId, ov.month))
    if (Math.abs(delta) > 0.005) {
      const mv: SavingsMovement = {
        id: uid(),
        date: `${ov.month}-15`,
        bucketId: ov.bucketId,
        amount: delta,
        description: 'Ajuste de saldo (migrado)',
        createdAt: nowISO(),
      }
      newMovements.push(mv)
      movements = [...movements, mv]
    }
  }
  if (newMovements.length) await adapter!.putMany('savingsMovements', newMovements)
  await Promise.all(overrides.map((ov) => adapter!.remove('balanceOverrides', ov.id)))
}

// Plano "efetivo" a mostrar para um mês: o registo gravado; senão, se houver
// projeções já preenchidas para esse mês, essas alocações (mesmo que não
// somem 100% — a validação de aplicar o plano em Planeamento.tsx já bloqueia
// esse caso); senão — uma cópia (não persistida) do último mês anterior
// gravado, para o planeamento vir sempre pré-preenchido com algo.
export function effectivePlan(d: DataSet, month: MonthKey): MonthlyPlan {
  const existing = d.monthlyPlans.find((p) => p.id === month)
  if (existing) return existing

  // Ao copiar de outro mês só vêm itens ativos: valores de itens arquivados ou
  // apagados não passam para o mês novo (ficariam alocados sem ninguém os ver).
  const projection = d.projectionPlans.find((p) => p.id === month)
  if (projection) {
    const s = allocationSummary(projection, [])
    if (s.totalIncome > 0 || s.totalAllocated > 0) {
      return activeOnly({
        id: month,
        income: { ...projection.income },
        expenses: { ...projection.expenses },
        savings: { ...projection.savings },
        autoInvestments: { ...projection.autoInvestments },
      }, d)
    }
  }

  const prior = [...d.monthlyPlans].filter((p) => p.id < month).sort((a, b) => (a.id < b.id ? 1 : -1))[0]
  return prior
    ? activeOnly({
        id: month,
        income: { ...prior.income },
        expenses: { ...prior.expenses },
        savings: { ...prior.savings },
        autoInvestments: { ...prior.autoInvestments },
      }, d)
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

// Total acumulado de débitos automáticos por veículo até ao mês contabilístico
// pedido. O default mantém o comportamento dos restantes consumidores.
export const autoInvestmentTotals = (
  d: DataSet,
  throughMonth: MonthKey = currentMonthKey(),
): Map<string, number> => cumulativeAutoInvestmentTotals(d.monthlyPlans, throughMonth)

// Se um item do planeamento (income, despesa, balde, veículo) ainda tem valor
// alocado no mês atual ou em meses futuros, devolve esses meses — nesse caso
// não pode ser arquivado nem apagado. `null` = pode.
export function allocationBlock(
  d: DataSet,
  collection: CollectionName,
  id: string,
): { planeamento: MonthKey[]; projecoes: MonthKey[] } | null {
  const section = SECTION_OF[collection]
  if (!section) return null
  const from = currentMonthKey()
  const r = allocatedMonths(d, section, id, from)
  // Mês atual ainda sem registo gravado: o plano mostrado é o herdado.
  if (!d.monthlyPlans.some((p) => p.id === from)) {
    const eff = effectivePlan(d, from)
    if (Math.abs(eff[section]?.[id] ?? 0) > 0.004) r.planeamento = [from, ...r.planeamento]
  }
  return r.planeamento.length + r.projecoes.length > 0 ? r : null
}

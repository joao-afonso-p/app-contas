// Modelo de dados central da app "Contas".
// Meses são sempre identificados por chave "YYYY-MM".

export type MonthKey = string // "2026-07"

// ---------- Configuração dinâmica ----------

export interface IncomeSource {
  id: string
  name: string
  // "Chega depois": income que só entra depois de fazeres a transferência do
  // mês (ex.: a renda de uma casa). Não conta para "transferir agora" — transfere-se
  // quando chegar. (O nome do campo mantém-se por compatibilidade com dados antigos.)
  isRent: boolean
  // Dia do mês previsto para a entrada (só informativo, usado no lembrete).
  expectedDay?: number
  archived: boolean
  order: number
}

export interface ExpenseCategory {
  id: string
  name: string
  archived: boolean
  order: number
  // Despesa fixa (renda, colégio…): sem alertas de "quase no limite" nem
  // projeção ao ritmo atual. `undefined` = automático (deteta-se pelo histórico).
  fixed?: boolean
}

export type BucketKind = 'fixed' | 'goal'
export type GoalStatus = 'active' | 'done'

export interface SavingsBucket {
  id: string
  name: string
  kind: BucketKind
  color?: string
  archived: boolean
  order: number
  // Só para kind === 'goal':
  targetAmount?: number
  targetDate?: MonthKey
  status?: GoalStatus
}

// ---------- Planeamento mensal ----------

export interface MonthlyPlan {
  id: MonthKey
  income: Record<string, number> // incomeSourceId -> €
  expenses: Record<string, number> // expenseCategoryId -> €
  savings: Record<string, number> // bucketId -> €
  // Débitos automáticos diretos para um veículo de investimento (ex. PPR) —
  // o dinheiro nunca passa pela poupança partilhada, por isso fica fora do
  // "transferir para a poupança", mas conta para a alocação de 100%.
  autoInvestments?: Record<string, number> // investmentVehicleId -> €
  // Plano aplicado/confirmado pelo utilizador — só nesse estado conta para os
  // saldos (ver computeBalances). `undefined` (registos anteriores a este
  // campo existir) é tratado como aplicado, para não quebrar saldos antigos.
  closed?: boolean
  // Incomes "chega depois" deste mês já transferidos para a poupança (incomeSourceId -> true).
  lateTransferred?: Record<string, boolean>
}

// ---------- Movimentos de poupança ----------

export interface SavingsMovement {
  id: string
  date: string // "YYYY-MM-DD"
  bucketId: string
  amount: number // positivo = entrada, negativo = saída
  description: string
  // Saída que se destina a um veículo de investimento externo (dinheiro sai
  // do balde mas continua "nosso" — mostrado na distribuição por veículos).
  vehicleId?: string
  // Presente nas duas pernas de uma transferência entre baldes (mesmo id nas duas).
  transferGroupId?: string
  // Gerado automaticamente ao confirmar a reposição de um gasto (Transaction.id).
  transactionId?: string
  // Entrada criada ao resgatar dinheiro de um veículo/ativo para este balde (AssetEntry.id).
  assetEntryId?: string
  // Timestamp de criação (ISO datetime) — não mostrado na UI, só para desempate de sort.
  createdAt?: string
}

// ---------- Gastos reais ----------

export interface Transaction {
  id: string
  date: string // "YYYY-MM-DD"
  categoryId: string
  amount: number // gasto em € (positivo)
  description: string
  nome?: string // rótulo curto indicativo (opcional)
  repoePoupanca: boolean
  fonteBucketId?: string // de que balde se repõe (ex. Geral)
  reposto: boolean
  // Timestamp de criação (ISO datetime) — não mostrado na UI, só para desempate de sort.
  createdAt?: string
  // ---- Categorização "nova" (liga os gastos ao planeamento) ----
  // Categoria principal = uma despesa do planeamento (ExpenseCategory) OU um
  // balde de poupança (gasto pago pela poupança, fora do orçamento mensal).
  // `categoryId` (categoria antiga) nunca é alterado nem apagado: gastos que
  // ainda não têm `planCategoryId` são resolvidos pela associação feita na
  // categoria antiga (ver lib/calc/categories.ts).
  planCategoryId?: string
  subcategoryId?: string
}

// Categoria "antiga" de gastos. Mantém-se guardada (nada é apagado), mas deixou
// de ser editável como lista principal: serve só para ler gastos históricos e,
// opcionalmente, ser associada a uma categoria do plano (+ subcategoria).
export interface TransactionCategory {
  id: string
  name: string
  archived: boolean
  order: number
  planCategoryId?: string
  subcategoryId?: string
}

// Subcategoria opcional, filha de uma despesa do planeamento ou de um balde.
export interface Subcategory {
  id: string
  parentId: string // ExpenseCategory.id ou SavingsBucket.id
  name: string
  archived: boolean
  order: number
}

// Regra aprendida: descrição do banco -> categoria
export interface CategoryRule {
  id: string
  keyword: string // texto normalizado contido na descrição
  categoryId: string // categoria antiga (legado)
  planCategoryId?: string
  subcategoryId?: string
}

export interface Budget {
  id: string // = categoryId
  cap: number // teto máximo mensal €
}

// ---------- Projeções ----------

export interface ProjectionPlan {
  id: MonthKey
  income: Record<string, number>
  expenses: Record<string, number>
  savings: Record<string, number>
  autoInvestments?: Record<string, number> // investmentVehicleId -> €
}

// Override de saldo: "a partir deste mês o saldo do balde passa a ser X"
export interface BalanceOverride {
  id: string // `${month}_${bucketId}`
  month: MonthKey
  bucketId: string
  balance: number
}

// Movimento futuro previsto (entradas/saídas esperadas)
export interface PlannedMovement {
  id: string
  month: MonthKey
  bucketId: string
  amount: number
  description: string
  // Presente nas duas pernas de uma transferência prevista entre baldes (mesmo id nas duas).
  transferGroupId?: string
  // Marcado como feito pelo utilizador: já aconteceu (e está registado nos
  // movimentos reais), por isso deixa de contar nas projeções. `undefined`
  // (registos anteriores a este campo existir) = por fazer.
  done?: boolean
}

// ---------- Distribuição por veículos ----------

// Catálogo de veículos de investimento (ex. "XTB", "Certificados de Aforro").
// A distribuição em si deriva dos SavingsMovements com vehicleId definido.
export interface InvestmentVehicle {
  id: string
  name: string
  archived: boolean
  order: number
  // Saldo que já lá estava antes de começar a ser seguido nesta app.
  initialBalance?: number
  // Rendimento anual esperado (%), só para projeções (ex.: 3 = 3%/ano).
  expectedRate?: number
  // Entrada mensal assumida na projeção (€); sem valor = mediana dos últimos 6 meses.
  monthlyContribution?: number
  contributionGrowth?: number // aumento anual da entrada mensal (%), só na projeção
}

// Ativo dentro de um veículo (ex.: um ETF na Degiro, a conta poupança da Amélia).
// Veículos sem ativos funcionam como um único "ativo" implícito.
export interface InvestmentAsset {
  id: string
  vehicleId: string
  name: string
  kind?: string // ETF, Ação, Conta poupança, Certificado de Aforro, …
  archived: boolean
  order: number
  expectedRate?: number // % anual esperada (projeções)
  monthlyContribution?: number
  contributionGrowth?: number // aumento anual da entrada mensal (%), só na projeção
}

// Movimento de dinheiro ao nível dos ativos:
// - 'distribute': parte do dinheiro que entrou no veículo (plano/movimentos) atribuída a este ativo;
// - 'external': dinheiro que entra (+) ou sai (−) fora do que a app já acompanha (ex.: depósito direto na corretora);
// - 'transfer': perna de uma transferência entre ativos (mesmo transferGroupId nas duas pernas).
// `assetId` vazio = "saldo livre" do veículo.
export interface AssetEntry {
  id: string
  date: string // YYYY-MM-DD
  vehicleId: string
  assetId?: string
  amount: number
  source: 'distribute' | 'external' | 'transfer'
  transferGroupId?: string
  note?: string
  createdAt?: string
}

// Valor real de um ativo (ou do "saldo livre" de um veículo) numa data,
// registado à mão quando o utilizador quiser.
export interface ValueCheckpoint {
  id: string
  date: string // YYYY-MM-DD
  vehicleId: string
  assetId?: string
  value: number
  note?: string
}

// ---------- Notas / meta ----------

export interface AppMeta {
  id: 'meta'
  projectionStart?: MonthKey
  projectionHorizon?: number // nº de meses a projetar
  notes?: string
  onboardingDone?: boolean
  // Registo explícito de que as projeções já foram inicializadas (primeira
  // sincronização, ou edição manual de alguma célula) — a partir daqui uma
  // sincronização só atualiza o mês atual, nunca o resto do horizonte.
  projectionsInitialized?: boolean
  // Início do mês financeiro (ver lib/financialMonth.ts): histórico de defaults
  // (vale a partir de cada mês) e dias próprios de meses específicos.
  monthStartRules?: { from: MonthKey; day: number }[]
  monthStartOverrides?: Record<MonthKey, number>
}

// ---------- Coleções ----------

export interface DataSet {
  incomeSources: IncomeSource[]
  expenseCategories: ExpenseCategory[]
  savingsBuckets: SavingsBucket[]
  monthlyPlans: MonthlyPlan[]
  savingsMovements: SavingsMovement[]
  transactions: Transaction[]
  transactionCategories: TransactionCategory[]
  subcategories: Subcategory[]
  categoryRules: CategoryRule[]
  budgets: Budget[]
  projectionPlans: ProjectionPlan[]
  balanceOverrides: BalanceOverride[]
  plannedMovements: PlannedMovement[]
  investmentVehicles: InvestmentVehicle[]
  investmentAssets: InvestmentAsset[]
  assetEntries: AssetEntry[]
  valueCheckpoints: ValueCheckpoint[]
  meta: AppMeta[]
}

export type CollectionName = keyof DataSet
export type AnyDoc = DataSet[CollectionName][number]

export const COLLECTIONS: CollectionName[] = [
  'incomeSources',
  'expenseCategories',
  'savingsBuckets',
  'monthlyPlans',
  'savingsMovements',
  'transactions',
  'transactionCategories',
  'subcategories',
  'categoryRules',
  'budgets',
  'projectionPlans',
  'balanceOverrides',
  'plannedMovements',
  'investmentVehicles',
  'investmentAssets',
  'assetEntries',
  'valueCheckpoints',
  'meta',
]

export function emptyDataSet(): DataSet {
  return {
    incomeSources: [],
    expenseCategories: [],
    savingsBuckets: [],
    monthlyPlans: [],
    savingsMovements: [],
    transactions: [],
    transactionCategories: [],
    subcategories: [],
    categoryRules: [],
    budgets: [],
    projectionPlans: [],
    balanceOverrides: [],
    plannedMovements: [],
    investmentVehicles: [],
    investmentAssets: [],
    assetEntries: [],
    valueCheckpoints: [],
    meta: [],
  }
}

// Modelo de dados central da app "Contas".
// Meses são sempre identificados por chave "YYYY-MM".

export type MonthKey = string // "2026-07"

// ---------- Configuração dinâmica ----------

export interface IncomeSource {
  id: string
  name: string
  // Rendas (ou outros incomes que chegam a meio do mês): são descontadas no
  // valor "transferir para a poupança" porque a transferência faz-se logo com
  // o salário e a renda vai direta para a poupança quando chegar.
  isRent: boolean
  archived: boolean
  order: number
}

export interface ExpenseCategory {
  id: string
  name: string
  archived: boolean
  order: number
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
}

export interface TransactionCategory {
  id: string
  name: string
  archived: boolean
  order: number
}

// Regra aprendida: descrição do banco -> categoria
export interface CategoryRule {
  id: string
  keyword: string // texto normalizado contido na descrição
  categoryId: string
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
  categoryRules: CategoryRule[]
  budgets: Budget[]
  projectionPlans: ProjectionPlan[]
  balanceOverrides: BalanceOverride[]
  plannedMovements: PlannedMovement[]
  investmentVehicles: InvestmentVehicle[]
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
  'categoryRules',
  'budgets',
  'projectionPlans',
  'balanceOverrides',
  'plannedMovements',
  'investmentVehicles',
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
    categoryRules: [],
    budgets: [],
    projectionPlans: [],
    balanceOverrides: [],
    plannedMovements: [],
    investmentVehicles: [],
    meta: [],
  }
}

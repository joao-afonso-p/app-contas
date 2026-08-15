import type {
  BalanceOverride,
  MonthKey,
  MonthlyPlan,
  PlannedMovement,
  ProjectionPlan,
  SavingsBucket,
  SavingsMovement,
} from '../../types'
import { addMonths, monthDiff, monthOfDate, monthRange } from '../format'
import { round2 } from './allocation'
import { computeBalances, type BalanceTable } from './balances'

// As projeções reutilizam o mesmo motor de saldos, separando a realidade
// confirmada do futuro projetado no último mês contabilístico aplicado.

export interface ProjectionInputs {
  buckets: SavingsBucket[]
  realPlans: Pick<MonthlyPlan, 'id' | 'savings' | 'closed'>[]
  realMovements: SavingsMovement[]
  projectionPlans: ProjectionPlan[]
  plannedMovements: PlannedMovement[]
  overrides: BalanceOverride[]
  baseMonth: MonthKey
  from: MonthKey
  to: MonthKey
}

export function computeProjectedBalances(inp: ProjectionInputs): BalanceTable {
  const plans = [
    ...inp.projectionPlans.filter((p) => p.id > inp.baseMonth && p.id <= inp.to),
    ...inp.realPlans.filter((p) => p.id <= inp.baseMonth),
  ]
  const realMovements = inp.realMovements.filter((m) => monthOfDate(m.date) <= inp.baseMonth)
  const futureMovements = inp.plannedMovements
    .filter((m) => m.month > inp.baseMonth && m.month <= inp.to)
    .map((m) => ({
      id: m.id,
      date: `${m.month}-15`,
      bucketId: m.bucketId,
      amount: m.amount,
      description: m.description,
    }))

  return computeBalances({
    buckets: inp.buckets,
    plans,
    movements: [...realMovements, ...futureMovements],
    overrides: inp.overrides,
    from: inp.from,
    to: inp.to,
  })
}

// Poupança mensal necessária para atingir `target` até `targetDate`,
// partindo de `current` no mês `from`.
export function requiredMonthlySaving(
  current: number,
  target: number,
  from: MonthKey,
  targetDate: MonthKey,
): number | null {
  const months = monthDiff(from, targetDate)
  if (months <= 0) return null
  const missing = target - current
  if (missing <= 0) return 0
  return round2(missing / months)
}

// Taxa de poupança de um mês: total poupado / income
export function savingsRate(totalIncome: number, totalSavings: number): number {
  return totalIncome > 0 ? (totalSavings / totalIncome) * 100 : 0
}

// Decide o que "Sincronizar com a realidade" grava em projectionPlans:
// - ainda não há projeções (nunca sincronizado nem editado manualmente):
//   gera o horizonte todo, todos os meses iguais ao plano real do mês-base.
// - já há projeções: só o mês-base é realinhado com o plano real; os meses
//   futuros (já editados/definidos) ficam intocados.
export interface SyncedProjectionPlansInput {
  baseMonth: MonthKey
  basePlan: Pick<MonthlyPlan, 'income' | 'expenses' | 'savings' | 'autoInvestments'>
  projectionsInitialized: boolean
  horizon: number
}

export function syncedProjectionPlans({
  baseMonth,
  basePlan,
  projectionsInitialized,
  horizon,
}: SyncedProjectionPlansInput): ProjectionPlan[] {
  const copyPlan = (id: MonthKey): ProjectionPlan => ({
    id,
    income: { ...basePlan.income },
    expenses: { ...basePlan.expenses },
    savings: { ...basePlan.savings },
    autoInvestments: { ...basePlan.autoInvestments },
  })
  if (!projectionsInitialized) {
    return monthRange(baseMonth, addMonths(baseMonth, horizon - 1)).map(copyPlan)
  }
  return [copyPlan(baseMonth)]
}

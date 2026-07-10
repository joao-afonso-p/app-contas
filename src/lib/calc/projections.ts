import type {
  BalanceOverride,
  MonthKey,
  MonthlyPlan,
  PlannedMovement,
  ProjectionPlan,
  SavingsBucket,
} from '../../types'
import { addMonths, monthDiff, monthRange } from '../format'
import { round2 } from './allocation'
import { computeBalances, type BalanceTable } from './balances'

// As projeções reutilizam o mesmo motor de saldos do planeamento real:
// grelha de planos futuros + movimentos previstos + overrides.

export interface ProjectionInputs {
  buckets: SavingsBucket[]
  plans: ProjectionPlan[]
  plannedMovements: PlannedMovement[]
  overrides: BalanceOverride[]
  from: MonthKey
  to: MonthKey
}

export function computeProjectedBalances(inp: ProjectionInputs): BalanceTable {
  return computeBalances({
    buckets: inp.buckets,
    plans: inp.plans,
    movements: inp.plannedMovements.map((m) => ({
      id: m.id,
      date: `${m.month}-15`,
      bucketId: m.bucketId,
      amount: m.amount,
      description: m.description,
    })),
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
//   gera o horizonte todo, todos os meses iguais ao plano real do mês atual.
// - já há projeções: só o mês atual é realinhado com o plano real; os meses
//   futuros (já editados/definidos) ficam intocados.
export interface SyncedProjectionPlansInput {
  currentMonth: MonthKey
  currentPlan: Pick<MonthlyPlan, 'income' | 'expenses' | 'savings' | 'autoInvestments'>
  projectionsInitialized: boolean
  horizon: number
}

export function syncedProjectionPlans({
  currentMonth,
  currentPlan,
  projectionsInitialized,
  horizon,
}: SyncedProjectionPlansInput): ProjectionPlan[] {
  const copyPlan = (id: MonthKey): ProjectionPlan => ({
    id,
    income: { ...currentPlan.income },
    expenses: { ...currentPlan.expenses },
    savings: { ...currentPlan.savings },
    autoInvestments: { ...currentPlan.autoInvestments },
  })
  if (!projectionsInitialized) {
    return monthRange(currentMonth, addMonths(currentMonth, horizon - 1)).map(copyPlan)
  }
  return [copyPlan(currentMonth)]
}

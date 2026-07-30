import type { IncomeSource, MonthKey, MonthlyPlan, ProjectionPlan } from '../../types'

export interface AllocationSummary {
  totalIncome: number
  totalExpenses: number
  totalSavings: number
  totalAutoInvestments: number // débitos automáticos para veículos (ex. PPR)
  totalAllocated: number
  unallocated: number // >0 falta alocar; <0 excesso
  allocationPct: number // 0..100 (pode passar de 100)
  leaveInCurrent: number // deixar na conta corrente = despesas do mês
  transferToSavings: number // poupanças - rendas (a renda vai direta quando chegar)
  rentIncome: number
}

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + (b || 0), 0)

export function allocationSummary(
  plan: MonthlyPlan | ProjectionPlan | undefined,
  incomeSources: IncomeSource[],
): AllocationSummary {
  const income = plan?.income ?? {}
  const totalIncome = sum(income)
  const totalExpenses = sum(plan?.expenses ?? {})
  const totalSavings = sum(plan?.savings ?? {})
  // Débitos automáticos (ex. PPR): saem diretamente do income para um veículo,
  // nunca passam pela poupança partilhada — contam para a alocação de 100%
  // mas não entram no valor a transferir manualmente para a poupança.
  const totalAutoInvestments = sum(plan?.autoInvestments ?? {})
  const totalAllocated = totalExpenses + totalSavings + totalAutoInvestments
  const rentIncome = incomeSources
    .filter((s) => s.isRent)
    .reduce((acc, s) => acc + (income[s.id] || 0), 0)
  return {
    totalIncome,
    totalExpenses,
    totalSavings,
    totalAutoInvestments,
    totalAllocated,
    unallocated: round2(totalIncome - totalAllocated),
    allocationPct: totalIncome > 0 ? (totalAllocated / totalIncome) * 100 : 0,
    leaveInCurrent: round2(totalExpenses),
    transferToSavings: round2(totalSavings - rentIncome),
    rentIncome,
  }
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Débitos automáticos acumulados até ao mês contabilístico indicado. Tal como
// nos saldos, rascunhos não contam; registos antigos sem `closed` continuam a
// ser tratados como aplicados.
export function cumulativeAutoInvestmentTotals(
  plans: Pick<MonthlyPlan, 'id' | 'autoInvestments' | 'closed'>[],
  throughMonth: MonthKey,
): Map<string, number> {
  const totals = new Map<string, number>()
  for (const plan of plans) {
    if (plan.id > throughMonth || plan.closed === false) continue
    for (const [vehicleId, value] of Object.entries(plan.autoInvestments ?? {})) {
      totals.set(vehicleId, (totals.get(vehicleId) ?? 0) + value)
    }
  }
  return totals
}

import type { DataSet, MonthKey, MonthlyPlan, ProjectionPlan, Transaction } from '../../types'
import { round2 } from './allocation'

// Despesas do planeamento que já não existem (apagadas) ou foram arquivadas,
// mas ainda têm valor planeado nalgum mês (planos reais ou projeções). Esses
// valores continuam a somar nos totais do plano, mas não aparecem em lado
// nenhum para serem editados nem nas análises por categoria. Esta lógica
// permite juntá-los noutra despesa (ex.: duas "Casa 1/Casa 2" → "Casas").

export interface OrphanExpense {
  id: string
  name?: string // só se a despesa ainda existe (arquivada)
  deleted: boolean
  months: { month: MonthKey; value: number }[] // plano real + projeções, por mês (soma)
  total: number
  transactions: number // gastos classificados diretamente nesta despesa
}

const EPS = 0.004

export function findOrphanExpenses(
  d: Pick<DataSet, 'expenseCategories' | 'monthlyPlans' | 'projectionPlans' | 'transactions'>,
): OrphanExpense[] {
  const cats = new Map(d.expenseCategories.map((c) => [c.id, c]))
  const acc = new Map<string, Map<MonthKey, number>>()
  const scan = (plans: { id: MonthKey; expenses: Record<string, number> }[]) => {
    for (const plan of plans) {
      for (const [id, value] of Object.entries(plan.expenses ?? {})) {
        if (Math.abs(value) < EPS) continue
        const cat = cats.get(id)
        if (cat && !cat.archived) continue // ativa: não é órfã
        const row = acc.get(id) ?? new Map<MonthKey, number>()
        row.set(plan.id, round2((row.get(plan.id) ?? 0) + value))
        acc.set(id, row)
      }
    }
  }
  scan(d.monthlyPlans)
  scan(d.projectionPlans)
  return [...acc.entries()].map(([id, row]) => {
    const months = [...row.entries()].map(([month, value]) => ({ month, value })).sort((a, b) => a.month.localeCompare(b.month))
    return {
      id,
      name: cats.get(id)?.name,
      deleted: !cats.has(id),
      months,
      total: round2(months.reduce((s, m) => s + m.value, 0)),
      transactions: d.transactions.filter((t) => t.planCategoryId === id).length,
    }
  }).sort((a, b) => Number(b.deleted) - Number(a.deleted) || a.months[0].month.localeCompare(b.months[0].month))
}

export interface MergeResult {
  monthlyPlans: MonthlyPlan[]
  projectionPlans: ProjectionPlan[]
  transactions: Transaction[]
}

// Soma o valor de cada despesa de origem, mês a mês, à despesa de destino e
// remove a chave de origem. O total de despesas de cada mês não muda (só passa
// de uma linha para outra), por isso os saldos e os 100% ficam iguais.
export function planMerge(
  d: Pick<DataSet, 'monthlyPlans' | 'projectionPlans' | 'transactions'>,
  fromIds: string[],
  targetId: string,
  moveTransactions: boolean,
): MergeResult {
  const from = new Set(fromIds.filter((id) => id !== targetId))
  const mergePlan = <P extends { expenses: Record<string, number> }>(plan: P): P | null => {
    const hit = Object.keys(plan.expenses ?? {}).filter((id) => from.has(id))
    if (hit.length === 0) return null
    const expenses = { ...plan.expenses }
    let moved = 0
    for (const id of hit) {
      moved += expenses[id] ?? 0
      delete expenses[id]
    }
    expenses[targetId] = round2((expenses[targetId] ?? 0) + moved)
    return { ...plan, expenses }
  }
  const pick = <P extends { expenses: Record<string, number> }>(plans: P[]): P[] =>
    plans.map(mergePlan).filter((p): p is P => p !== null)
  return {
    monthlyPlans: pick(d.monthlyPlans),
    projectionPlans: pick(d.projectionPlans),
    transactions: moveTransactions
      ? d.transactions
          .filter((t) => t.planCategoryId && from.has(t.planCategoryId))
          .map((t) => ({ ...t, planCategoryId: targetId, subcategoryId: undefined }))
      : [],
  }
}

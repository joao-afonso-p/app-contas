import { describe, expect, it } from 'vitest'
import { emptyDataSet } from '../../types'
import type { Transaction } from '../../types'
import { findOrphanExpenses, planMerge } from './mergeExpenses'

const plan = (id: string, expenses: Record<string, number>) => ({ id, income: {}, expenses, savings: {} })
const total = (p: { expenses: Record<string, number> }) => Object.values(p.expenses).reduce((s, v) => s + v, 0)

describe('juntar despesas antigas', () => {
  const d = emptyDataSet()
  d.expenseCategories = [
    { id: 'c1', name: 'Casa 1', archived: true, order: 0 },
    { id: 'casas', name: 'Casas', archived: false, order: 1 },
    { id: 'food', name: 'Comida', archived: false, order: 2 },
  ] as never
  d.monthlyPlans = [
    plan('2026-06', { c1: 1000, apagada: 980, food: 300 }),
    plan('2026-10', { casas: 1980, food: 300 }),
  ]
  d.projectionPlans = [plan('2026-12', { c1: 0, casas: 1980 })]
  d.transactions = [{ id: 't1', planCategoryId: 'apagada', subcategoryId: 's', amount: 5, date: '2026-06-02' } as Transaction]

  it('encontra arquivadas e apagadas com valor', () => {
    const o = findOrphanExpenses(d)
    expect(o.map((x) => [x.id, x.deleted, x.total])).toEqual([['apagada', true, 980], ['c1', false, 1000]])
    expect(o[0].transactions).toBe(1)
  })
  it('soma no destino, remove a origem e mantém o total do mês', () => {
    const r = planMerge(d, ['c1', 'apagada'], 'casas', true)
    expect(r.monthlyPlans).toHaveLength(1)
    const p = r.monthlyPlans[0]
    expect(p.expenses).toEqual({ casas: 1980, food: 300 })
    expect(total(p)).toBe(total(d.monthlyPlans[0]))
    expect(r.projectionPlans[0].expenses).toEqual({ casas: 1980 })
    expect(r.transactions[0]).toMatchObject({ planCategoryId: 'casas', subcategoryId: undefined })
    expect(findOrphanExpenses({ ...d, monthlyPlans: [p, d.monthlyPlans[1]], projectionPlans: r.projectionPlans })).toEqual([])
  })
  it('não toca nos gastos se não pedido', () => {
    expect(planMerge(d, ['apagada'], 'casas', false).transactions).toHaveLength(0)
  })
})

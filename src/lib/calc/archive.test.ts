import { describe, expect, it } from 'vitest'
import { emptyDataSet } from '../../types'
import { activeOnly, allocatedMonths, isAllocated, withResidual } from './archive'
import { allocationSummary } from './allocation'

const plan = (id: string, expenses: Record<string, number>) => ({ id, income: {}, expenses, savings: {} })

describe('arquivar itens do planeamento', () => {
  const d = emptyDataSet()
  d.monthlyPlans = [plan('2026-09', { casa1: 500 }), plan('2026-10', { casa1: 500, casas: 0 })]
  d.projectionPlans = [plan('2026-11', { casa1: 500 }), plan('2026-12', { casa1: 0 })]

  it('só conta meses atuais e futuros, no plano e nas projeções', () => {
    expect(allocatedMonths(d, 'expenses', 'casa1', '2026-10')).toEqual({ planeamento: ['2026-10'], projecoes: ['2026-11'] })
    expect(isAllocated(d, 'expenses', 'casa1', '2026-12')).toBe(false)
    expect(isAllocated(d, 'expenses', 'casas', '2026-10')).toBe(false)
  })
  it('itens arquivados com valor ficam visíveis (e contam nos 100%)', () => {
    const docs = [
      { id: 'casa1', name: 'Casa 1', archived: true, order: 0 },
      { id: 'casas', name: 'Casas', archived: false, order: 1 },
      { id: 'velha', name: 'Velha', archived: true, order: 2 },
    ]
    const listed = withResidual(docs, [d.monthlyPlans[1]], 'expenses')
    expect(listed.map((x) => [x.id, x.residual ?? false])).toEqual([['casa1', true], ['casas', false]])
    expect(allocationSummary(d.monthlyPlans[1], []).totalExpenses).toBe(500)
  })
  it('ao copiar um plano só vão itens ativos', () => {
    const data = emptyDataSet()
    data.expenseCategories = [
      { id: 'casa1', name: 'Casa 1', archived: true, order: 0 },
      { id: 'casas', name: 'Casas', archived: false, order: 1 },
    ]
    const copy = activeOnly(plan('2026-11', { casa1: 500, casas: 300, apagada: 40 }), data)
    expect(copy.expenses).toEqual({ casas: 300 })
  })
})

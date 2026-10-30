import { describe, expect, it } from 'vitest'
import { attentionInsights } from './planVsActual'

const all = [{ kind: 'over' }, { kind: 'recurring' }, { kind: 'unassigned' }, { kind: 'pace' }]

describe('attentionInsights', () => {
  it('com o plano seguinte já aplicado só fica o que falta categorizar', () => {
    const r = attentionInsights(all, { currentMonth: '2026-10', accountingMonth: '2026-11', daysUntilNextMonth: 3 })
    expect(r.map((i) => i.kind)).toEqual(['unassigned'])
  })

  it('"3 meses acima" só nos últimos 10 dias do mês', () => {
    const early = attentionInsights(all, { currentMonth: '2026-11', accountingMonth: '2026-11', daysUntilNextMonth: 20 })
    expect(early.map((i) => i.kind)).toEqual(['over', 'unassigned', 'pace'])
    const late = attentionInsights(all, { currentMonth: '2026-11', accountingMonth: '2026-11', daysUntilNextMonth: 8 })
    expect(late.map((i) => i.kind)).toContain('recurring')
  })
})

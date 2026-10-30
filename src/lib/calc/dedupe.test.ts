import { describe, expect, it } from 'vitest'
import { datesAreClose, makeDuplicateDetector } from './dedupe'

describe('dedupe', () => {
  it('datas no mesmo mês ou a ≤ 4 dias são próximas', () => {
    expect(datesAreClose('2026-08-30', '2026-09-01')).toBe(true) // 2 dias, meses diferentes
    expect(datesAreClose('2026-08-28', '2026-09-01')).toBe(true) // 4 dias
    expect(datesAreClose('2026-08-27', '2026-09-01')).toBe(false) // 5 dias
    expect(datesAreClose('2026-10-03', '2026-10-25')).toBe(true) // mesmo mês
    expect(datesAreClose('2026-10-30', '2026-09-01')).toBe(false)
  })

  it('mesma descrição e valor + data próxima = duplicado', () => {
    const d = makeDuplicateDetector([{ date: '2026-09-01', amount: 12.5, description: 'CONTINENTE' }])
    expect(d.check({ date: '2026-08-30', amount: 12.5, description: ' CONTINENTE ' })).toBe(true)
  })

  it('valor ou descrição diferentes não são duplicado', () => {
    const d = makeDuplicateDetector([{ date: '2026-09-01', amount: 12.5, description: 'CONTINENTE' }])
    expect(d.check({ date: '2026-09-01', amount: 12.51, description: 'CONTINENTE' })).toBe(false)
    expect(d.check({ date: '2026-09-01', amount: 12.5, description: 'PINGO DOCE' })).toBe(false)
  })

  it('linhas repetidas no mesmo extrato: a segunda é duplicada', () => {
    const d = makeDuplicateDetector([])
    expect(d.check({ date: '2026-10-05', amount: 1.5, description: 'CAFE' })).toBe(false)
    expect(d.check({ date: '2026-10-05', amount: 1.5, description: 'CAFE' })).toBe(true)
  })
})

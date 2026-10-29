import { describe, expect, it } from 'vitest'
import { finalPoint, requiredMonthly, simulate, type SimInput } from './simulator'

const base: SimInput = { initial: 1000, monthly: 100, growthPct: 0, years: 2, inflationPct: 0, taxPct: 0 }

describe('simulador', () => {
  it('sem juros: capital + entradas', () => {
    const p = finalPoint(simulate(base, 0))
    expect(p.value).toBe(3400)
    expect(p.invested).toBe(3400)
    expect(p.gain).toBe(0)
  })
  it('aumento anual em degraus', () => {
    expect(finalPoint(simulate({ ...base, initial: 0, growthPct: 10 }, 0)).value).toBe(2520)
  })
  it('juros compostos batem certo com o cálculo da projeção (2324,60 / 3% / 34 / +8%)', () => {
    const p = finalPoint(simulate({ initial: 2324.6, monthly: 34, growthPct: 8, years: 5, inflationPct: 0, taxPct: 0 }, 3))
    expect(p.value).toBe(5259.49)
  })
  it('imposto só sobre ganhos', () => {
    const gross = finalPoint(simulate({ ...base, years: 10 }, 5))
    const net = finalPoint(simulate({ ...base, years: 10, taxPct: 28 }, 5))
    expect(net.value).toBeCloseTo(gross.invested + gross.gain * 0.72, 1)
    // sem ganhos (taxa 0) não há imposto
    expect(finalPoint(simulate({ ...base, taxPct: 28 }, 0)).value).toBe(3400)
  })
  it('inflação reduz o valor em euros de hoje', () => {
    const real = finalPoint(simulate({ ...base, years: 10, inflationPct: 2 }, 5))
    const nominal = finalPoint(simulate({ ...base, years: 10 }, 5))
    expect(real.value).toBeLessThan(nominal.value)
    expect(real.invested).toBeLessThan(nominal.invested)
  })
  it('entrada necessária para um objetivo', () => {
    const m = requiredMonthly({ ...base, initial: 0, years: 10 }, 0, 12000)!
    expect(m).toBe(100)
    const m2 = requiredMonthly({ ...base, initial: 0, years: 10 }, 5, 50000)!
    expect(finalPoint(simulate({ ...base, initial: 0, years: 10, monthly: m2 }, 5)).value).toBeGreaterThanOrEqual(50000)
    expect(finalPoint(simulate({ ...base, initial: 0, years: 10, monthly: m2 - 0.02 }, 5)).value).toBeLessThan(50000)
    expect(requiredMonthly({ ...base, initial: 100000 }, 0, 1000)).toBe(0)
  })
})

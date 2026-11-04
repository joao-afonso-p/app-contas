import { describe, expect, it } from 'vitest'
import {
  annualize, combineMonths, fixedList, fixedSeries, fixedTotalAt, grossYield, groupRows, pointAt, propertyMonths, rangeFor, returnOnCapital, sumMonths,
} from './rentals'
import type { RentalProperty } from '../../types'

const house = (over: Partial<RentalProperty> = {}): RentalProperty => ({
  id: 'p1',
  name: 'Casa do Porto',
  rentedFrom: '2025-01',
  capitalInvested: 45000,
  propertyValue: 150000,
  rent: [{ from: '2025-01', value: 750 }, { from: '2026-10', value: 800 }],
  mortgage: [{ from: '2025-01', value: 420 }, { from: '2026-08', value: 435 }],
  fixedCosts: [],
  taxRate: [{ from: '2025-01', value: 15 }],
  oneOffs: [{ id: 'o1', month: '2026-07', amount: 180, kind: 'manutencao', note: 'Torneira' }],
  order: 0,
  ...over,
})

const r2 = (n: number) => Math.round(n * 1000) / 1000

describe('pointAt', () => {
  it('devolve o ponto em vigor e nada antes do primeiro', () => {
    const pts = [{ from: '2025-01', value: 1 }, { from: '2026-08', value: 2 }]
    expect(pointAt(pts, '2024-12')).toBe(undefined)
    expect(pointAt(pts, '2025-01')?.value).toBe(1)
    expect(pointAt(pts, '2026-07')?.value).toBe(1)
    expect(pointAt(pts, '2026-08')?.value).toBe(2)
    expect(pointAt(pts, '2030-01')?.value).toBe(2)
  })

  it('não depende da ordem dos pontos', () => {
    const pts = [{ from: '2026-08', value: 2 }, { from: '2025-01', value: 1 }]
    expect(pointAt(pts, '2026-09')?.value).toBe(2)
  })
})

describe('propertyMonths e sumMonths (exemplo maio a outubro de 2026)', () => {
  const rows = propertyMonths(house(), '2026-05', '2026-10')
  const t = sumMonths(rows)

  it('aplica as mudanças "a partir de" no mês certo', () => {
    expect(rows.map((r) => r.mortgage)).toEqual([420, 420, 420, 435, 435, 435])
    expect(rows.map((r) => r.rent)).toEqual([750, 750, 750, 750, 750, 800])
  })

  it('soma bruto, imposto e líquido', () => {
    expect(t.months).toBe(6)
    expect(t.rent).toBe(4550)
    expect(t.mortgage).toBe(2565)
    expect(t.oneOff).toBe(180)
    expect(t.gross).toBe(1805)
    expect(t.tax).toBe(682.5)
    expect(t.net).toBe(1122.5)
  })

  it('a margem ignora as despesas pontuais', () => {
    expect(r2(t.margin ?? 0)).toBe(r2((4550 - 2565 - 682.5) / 4550))
  })

  it('só conta meses a partir de "a arrendar desde"', () => {
    const late = propertyMonths(house({ rentedFrom: '2026-09' }), '2026-05', '2026-10')
    expect(late.map((r) => r.month)).toEqual(['2026-09', '2026-10'])
  })

  it('despesas fixas e capital amortizado entram nas contas', () => {
    const h = house({
      fixedCosts: [{ from: '2025-01', value: 30 }],
      mortgage: [{ from: '2025-01', value: 420, principal: 250 }],
    })
    const s = sumMonths(propertyMonths(h, '2026-05', '2026-06'))
    expect(s.fixed).toBe(60)
    expect(s.principal).toBe(500)
    expect(s.gross).toBe(2 * (750 - 420 - 30))
  })
})

describe('retorno e rentabilidade bruta', () => {
  const p = house()
  const items = [{ property: p, totals: sumMonths(propertyMonths(p, '2026-05', '2026-10')) }]

  it('retorno = líquido anualizado ÷ capital', () => {
    const r = returnOnCapital(items)
    expect(r2(r.value ?? 0)).toBe(r2((1122.5 * 2) / 45000))
    expect(r.included).toBe(1)
    expect(r.total).toBe(1)
  })

  it('rentabilidade bruta = renda anualizada ÷ valor', () => {
    expect(r2(grossYield(items).value ?? 0)).toBe(r2((4550 * 2) / 150000))
  })

  it('sem capital preenchido não há retorno, e o aviso diz quantas casas entraram', () => {
    const q = house({ id: 'p2', capitalInvested: undefined })
    const both = [...items, { property: q, totals: sumMonths(propertyMonths(q, '2026-05', '2026-10')) }]
    const r = returnOnCapital(both)
    expect(r.included).toBe(1)
    expect(r.total).toBe(2)
    expect(returnOnCapital([both[1]]).value).toBe(null)
  })

  it('annualize converte para 12 meses', () => {
    expect(annualize(100, 6)).toBe(200)
    expect(annualize(100, 0)).toBe(0)
  })
})

describe('várias casas, períodos e grupos', () => {
  it('combineMonths soma casa a casa, mês a mês', () => {
    const a = propertyMonths(house(), '2026-05', '2026-06')
    const b = propertyMonths(house({ id: 'p2', rentedFrom: '2026-06' }), '2026-05', '2026-06')
    const all = combineMonths([a, b])
    expect(all.map((r) => r.rent)).toEqual([750, 1500])
  })

  it('groupRows por trimestre e por ano', () => {
    const rows = propertyMonths(house(), '2026-01', '2026-12')
    const q = groupRows(rows, 'quarter')
    expect(q.map((g) => g.label)).toEqual(['T1 2026', 'T2 2026', 'T3 2026', 'T4 2026'])
    expect(q[0].totals.months).toBe(3)
    const y = groupRows(propertyMonths(house(), '2025-01', '2026-12'), 'year')
    expect(y.map((g) => g.label)).toEqual(['2025', '2026'])
    expect(y[0].totals.rent).toBe(750 * 12)
  })

  it('rangeFor: últimos 12 meses, este ano e desde o início', () => {
    const p = [house({ rentedFrom: '2025-03' }), house({ id: 'p2', rentedFrom: '2024-11' })]
    expect(rangeFor('last12', '2026-10', p)).toEqual({ from: '2025-11', to: '2026-10' })
    expect(rangeFor('year', '2026-10', p)).toEqual({ from: '2026-01', to: '2026-10' })
    expect(rangeFor('all', '2026-10', p)).toEqual({ from: '2024-11', to: '2026-10' })
  })
})

describe('despesas fixas com nome', () => {
  const h = house({
    fixedCosts: [],
    fixedExpenses: [
      { id: 'a', name: 'Condomínio', period: 'monthly', points: [{ from: '2025-01', value: 30 }, { from: '2026-06', value: 36 }] },
      { id: 'b', name: 'IMI', period: 'annual', points: [{ from: '2025-01', value: 240 }] },
    ],
  })

  it('anual divide por 12 e soma com as mensais', () => {
    expect(fixedTotalAt(h, '2026-05')).toBe(50)
    expect(fixedTotalAt(h, '2026-06')).toBe(56)
  })

  it('a série combinada só tem um ponto por mudança real', () => {
    expect(fixedSeries(h)).toEqual([{ from: '2025-01', value: 50 }, { from: '2026-06', value: 56 }])
  })

  it('entra no lucro', () => {
    const s = sumMonths(propertyMonths(h, '2026-05', '2026-06'))
    expect(s.fixed).toBe(106)
  })

  it('o formato antigo continua a ser lido', () => {
    const old = house({ fixedCosts: [{ from: '2025-01', value: 26 }] })
    expect(fixedList(old)).toHaveLength(1)
    expect(fixedTotalAt(old, '2026-05')).toBe(26)
    expect(fixedList(house({ fixedCosts: [] }))).toEqual([])
  })
})

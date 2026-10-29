import { describe, expect, it } from 'vitest'
import { emptyDataSet, type Transaction } from '../../types'
import { breakdownTable, expenseBreakdown, offPlanBreakdown, topSeries } from './breakdown'
import { allGroups, makeResolver } from './categories'
import { buildMonthReport, computeInsights, type MonthReport } from './planVsActual'

const tx = (id: string, date: string, group: string, sub: string | undefined, amount: number): Transaction => ({
  id, date, categoryId: '', amount, description: '', repoePoupanca: false, reposto: false, planCategoryId: group, subcategoryId: sub,
})

const d = emptyDataSet()
d.expenseCategories = [
  { id: 'outros', name: 'Outros', archived: false, order: 0 },
  { id: 'casa', name: 'Casa', archived: false, order: 1 },
]
d.savingsBuckets = [{ id: 'geral', name: 'Geral', kind: 'fixed', archived: false, order: 0 }]
d.subcategories = [
  { id: 'compras', parentId: 'outros', name: 'Compras', archived: false, order: 0 },
  { id: 'rest', parentId: 'outros', name: 'Restaurantes', archived: false, order: 1 },
  { id: 'saude', parentId: 'geral', name: 'Saúde', archived: false, order: 0 },
]
const months = ['2026-07', '2026-08', '2026-09', '2026-10']
const txs: Transaction[] = [
  ...months.flatMap((m, i) => [
    tx(`c${i}`, `${m}-05`, 'outros', 'compras', 150 + i * 20),
    tx(`r${i}`, `${m}-08`, 'outros', 'rest', 40),
    tx(`x${i}`, `${m}-09`, 'outros', undefined, 10),
    tx(`k${i}`, `${m}-02`, 'casa', undefined, 800),
  ]),
  tx('s1', '2026-10-12', 'geral', 'saude', 120),
]
const resolve = makeResolver(d)
const groups = allGroups(d)
const reports = new Map<string, MonthReport>(
  months.map((m) => [m, buildMonthReport({ month: m, transactions: txs, resolve, groups, subcategories: d.subcategories, planExpenses: { outros: 150, casa: 900 } })]),
)

describe('decomposição por subcategoria', () => {
  it('uma categoria: separa subcategorias e "sem subcategoria"', () => {
    const s = expenseBreakdown(reports, months, 'outros')
    expect(s.map((x) => x.label)).toEqual(['Compras', 'Restaurantes', 'Sem subcategoria'])
    expect(s[0].total).toBe(150 + 170 + 190 + 210)
  })
  it('todas: rótulos categoria › sub; categoria sem subs fica só com o nome', () => {
    const s = expenseBreakdown(reports, months, 'all')
    const labels = s.map((x) => x.label)
    expect(labels).toContain('Outros › Compras')
    expect(labels).toContain('Outros › Sem subcategoria')
    expect(labels).toContain('Casa')
  })
  it('pagos pela poupança: balde › subcategoria', () => {
    const s = offPlanBreakdown(reports, months, 'all')
    expect(s).toHaveLength(1)
    expect(s[0].label).toBe('Geral › Saúde')
    expect(s[0].total).toBe(120)
  })
  it('tabela do mês vs média dos 3 anteriores', () => {
    const { rows } = breakdownTable(expenseBreakdown(reports, months, 'outros'), '2026-10')
    const compras = rows.find((r) => r.label === 'Compras')!
    expect(compras).toMatchObject({ thisMonth: 210, avg3: 170, delta: 40 })
    expect(compras.avg6).toBeCloseTo((150 + 170 + 190) / 6, 1) // só 3 meses de histórico; zeros contam
    expect(rows[0].label).toBe('Compras')
  })
  it('só mostra linhas com valor no mês ou na média de 3/6 meses', () => {
    const series = expenseBreakdown(reports, months, 'outros')
    // 2026-11: sem gasto no mês, mas há histórico nos 3 meses anteriores -> aparecem
    expect(breakdownTable(series, '2026-11').rows).toHaveLength(series.length)
    // 2027-06: tudo fora das janelas de 3 e 6 meses -> nada aparece
    const far = breakdownTable(series, '2027-06')
    expect(far.rows).toHaveLength(0)
    expect(far.totals).toEqual({ thisMonth: 0, avg3: 0, avg6: 0, median3: 0 })
    // linha que só tem histórico entre 4 e 6 meses atrás aparece pela média de 6 meses
    const old = [{ key: 'x', label: 'x', total: 60, byMonth: new Map([['2026-06', 60]]) }]
    expect(breakdownTable(old, '2026-10').rows).toHaveLength(1)
    expect(breakdownTable(old, '2026-10').rows[0]).toMatchObject({ thisMonth: 0, avg3: 0, avg6: 10 })
    expect(breakdownTable(old, '2026-11').rows).toHaveLength(1) // jun = 5 meses antes de nov
    expect(breakdownTable(old, '2027-01').rows).toHaveLength(0)
  })
  it('topSeries junta o resto em "Outras"', () => {
    const t = topSeries(expenseBreakdown(reports, months, 'all'), 2, months)
    expect(t).toHaveLength(3)
    expect(t[2].label).toMatch(/^Outras/)
  })
})

describe('alertas com subcategorias', () => {
  const all = months.map((m) => reports.get(m)!)
  it('acima do plano indica o que mais pesa', () => {
    const texts = computeInsights(all).map((i) => i.text)
    expect(texts.some((t) => t.startsWith('Outros:') && t.includes('Pesa mais: Compras'))).toBe(true)
  })
  it('3 meses seguidos indica as subcategorias responsáveis', () => {
    const rec = computeInsights(all).find((i) => i.kind === 'recurring')!
    expect(rec.text).toContain('sobretudo por causa de Compras')
  })
})

import { recurringOverruns } from './planVsActual'
describe('recurringOverruns', () => {
  const rep = (month: string, a: [number, number], b: [number, number]): MonthReport => ({
    month, hasPlan: true, plannedTotal: 0, spentInPlan: 0, offPlan: [], offPlanTotal: 0, unassigned: [], unassignedTotal: 0, spentCash: 0,
    rows: ([['a', a], ['b', b]] as [string, [number, number]][]).map(([id, [planned, spent]]) => ({
      group: { id, name: id, kind: 'expense', order: 0 }, planned, spent, remaining: planned - spent, pct: 0, level: 'ok',
      fixed: false, aheadOfPace: false, subs: [], txs: [],
    })),
  }) as unknown as MonthReport
  it('só marca quem passou o plano nos 3 meses', () => {
    const r = recurringOverruns([rep('2026-08', [100, 120], [100, 120]), rep('2026-09', [100, 110], [100, 90]), rep('2026-10', [100, 130], [100, 150])])
    expect([...r.keys()]).toEqual(['a'])
    expect(r.get('a')!.avgExcess).toBe(20)
  })
  it('precisa de 3 meses de dados', () => {
    expect(recurringOverruns([rep('2026-09', [1, 2], [1, 2])]).size).toBe(0)
  })
})

describe('diferença face à mediana', () => {
  it('um mês atípico não desloca a referência', () => {
    const s = { key: 'k', label: 'Seguro', total: 0, byMonth: new Map([['2026-07', 100], ['2026-08', 900], ['2026-09', 100], ['2026-10', 120]]) }
    const row = breakdownTable([s], '2026-10').rows[0]
    expect(row.avg3).toBeCloseTo(366.67, 1)
    expect(row.median3).toBe(100)
    expect(row.delta).toBe(20)
  })
})

import type { MonthKey } from '../../types'
import { addMonths } from '../format'
import { round2 } from './allocation'
import type { MonthReport, SubRow } from './planVsActual'

// Decomposição do gasto por categoria + subcategoria, mês a mês, a partir dos
// MonthReport. Serve para responder a "em que é que gasto?" ao nível mais fino.

export interface Series {
  key: string
  label: string
  total: number // soma na janela
  byMonth: Map<MonthKey, number>
}

type Row = { group: { id: string; name: string }; subs: SubRow[] }

function build(
  rowsOf: (r: MonthReport) => Row[],
  reports: Map<MonthKey, MonthReport>,
  months: MonthKey[],
  groupId: string | 'all',
  noSubLabel: string,
): Series[] {
  // Categorias que têm subcategorias nomeadas na janela: nelas, "sem
  // subcategoria" ganha um rótulo próprio; nas outras, o item é a própria categoria.
  const hasNamed = new Set<string>()
  for (const m of months) {
    for (const row of rowsOf(reports.get(m)!)) {
      if (row.subs.some((s) => s.id !== '' && s.spent > 0)) hasNamed.add(row.group.id)
    }
  }
  const map = new Map<string, Series>()
  for (const m of months) {
    for (const row of rowsOf(reports.get(m)!)) {
      if (groupId !== 'all' && row.group.id !== groupId) continue
      for (const sub of row.subs) {
        if (sub.spent <= 0) continue
        const key = `${row.group.id}|${sub.id}`
        let label: string
        if (groupId === 'all') {
          label = sub.id !== '' ? `${row.group.name} › ${sub.name}` : hasNamed.has(row.group.id) ? `${row.group.name} › ${noSubLabel}` : row.group.name
        } else {
          label = sub.id !== '' ? sub.name : noSubLabel
        }
        const cur = map.get(key) ?? { key, label, total: 0, byMonth: new Map<MonthKey, number>() }
        cur.byMonth.set(m, round2((cur.byMonth.get(m) ?? 0) + sub.spent))
        cur.total = round2(cur.total + sub.spent)
        map.set(key, cur)
      }
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

// Despesas do plano (categoria principal › subcategoria).
export function expenseBreakdown(reports: Map<MonthKey, MonthReport>, months: MonthKey[], groupId: string | 'all'): Series[] {
  return build((r) => r.rows, reports, months, groupId, 'Sem subcategoria')
}

// Gastos pagos pela poupança (balde › subcategoria).
export function offPlanBreakdown(reports: Map<MonthKey, MonthReport>, months: MonthKey[], bucketId: string | 'all'): Series[] {
  return build((r) => r.offPlan, reports, months, bucketId, 'Sem subcategoria')
}

// Mantém as `n` maiores e junta o resto em "Outras".
export function topSeries(series: Series[], n: number, months: MonthKey[]): Series[] {
  if (series.length <= n) return series
  const head = series.slice(0, n)
  const rest = series.slice(n)
  const byMonth = new Map<MonthKey, number>()
  for (const m of months) {
    const v = round2(rest.reduce((s, x) => s + (x.byMonth.get(m) ?? 0), 0))
    if (v > 0) byMonth.set(m, v)
  }
  return [...head, { key: '__others', label: `Outras (${rest.length})`, total: round2(rest.reduce((s, x) => s + x.total, 0)), byMonth }]
}

export interface BreakdownRow {
  key: string
  label: string
  thisMonth: number
  avg3: number // média dos 3 meses anteriores (zeros contam)
  avg6: number // média dos 6 meses anteriores (zeros contam)
  median3: number // mediana dos 3 meses anteriores (zeros contam) — referência para a diferença
  delta: number // este mês − mediana de 3 meses (robusta a meses atípicos)
  total: number
  share: number // 0..1 do total do mês
}

export interface BreakdownTable {
  rows: BreakdownRow[]
  totals: { thisMonth: number; avg3: number; avg6: number; median3: number }
}

const avgBefore = (s: Series, month: MonthKey, n: number): number => {
  let sum = 0
  for (let i = 1; i <= n; i++) sum += s.byMonth.get(addMonths(month, -i)) ?? 0
  return round2(sum / n)
}

const median = (vals: number[]): number => {
  const v = [...vals].sort((a, b) => a - b)
  const mid = Math.floor(v.length / 2)
  return round2(v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2)
}

const valuesBefore = (s: Series, month: MonthKey, n: number): number[] =>
  Array.from({ length: n }, (_, i) => s.byMonth.get(addMonths(month, -(i + 1))) ?? 0)

// Uma linha só aparece se tiver valor no mês, ou na média de 3 ou de 6 meses
// anteriores. O que nunca teve nada nesses períodos não entra na tabela.
export function breakdownTable(series: Series[], month: MonthKey): BreakdownTable {
  const all = series.map((s) => {
    const thisMonth = s.byMonth.get(month) ?? 0
    const avg3 = avgBefore(s, month, 3)
    const median3 = median(valuesBefore(s, month, 3))
    return { key: s.key, label: s.label, thisMonth, avg3, avg6: avgBefore(s, month, 6), median3, delta: round2(thisMonth - median3), total: s.total, share: 0 }
  })
  const rows = all
    .filter((r) => r.thisMonth > 0 || r.avg3 > 0 || r.avg6 > 0)
    .sort((a, b) => b.thisMonth - a.thisMonth || b.avg3 - a.avg3 || b.avg6 - a.avg6 || a.label.localeCompare(b.label))
  const monthTotal = rows.reduce((acc, r) => acc + r.thisMonth, 0)
  // Mediana dos totais mensais (das linhas visíveis) nos 3 meses anteriores.
  const visible = new Set(rows.map((r) => r.key))
  const totalMedian3 = median([1, 2, 3].map((i) => series
    .filter((s) => visible.has(s.key))
    .reduce((acc, s) => acc + (s.byMonth.get(addMonths(month, -i)) ?? 0), 0)))
  for (const r of rows) r.share = monthTotal > 0 ? r.thisMonth / monthTotal : 0
  return {
    rows,
    totals: {
      thisMonth: round2(monthTotal),
      avg3: round2(rows.reduce((acc, r) => acc + r.avg3, 0)),
      avg6: round2(rows.reduce((acc, r) => acc + r.avg6, 0)),
      median3: totalMedian3,
    },
  }
}

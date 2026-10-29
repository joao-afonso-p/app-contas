import { useMemo, type ReactNode } from 'react'
import { Bar, CartesianGrid, ComposedChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { breakdownTable, topSeries, type Series } from '../lib/calc/breakdown'
import { fmtEUR, monthLabel, monthShort } from '../lib/format'
import type { MonthKey } from '../types'
import { ChartLegend, ChartTooltip, compactEUR, cursorStyle } from './ChartParts'
import { Card, EmptyState, cx } from './ui'

const PALETTE = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#84cc16']
const OTHERS_COLOR = '#94a3b8'
const axis = { fill: 'var(--muted)', fontSize: 12 }

// Gráfico empilhado (12 meses) + tabela do mês escolhido, para uma lista de
// séries (subcategorias, ou categoria › subcategoria). O seletor vem de fora.
export function BreakdownPanel({
  title, controls, series, months, month, emptyHint, valueLabel = 'Gasto',
}: {
  title: string
  controls?: ReactNode
  series: Series[]
  months: MonthKey[]
  month: MonthKey
  emptyHint: string
  valueLabel?: string
}) {
  const top = useMemo(() => topSeries(series, 7, months), [series, months])
  const data = useMemo(
    () => months.map((m) => {
      const row: Record<string, number | string> = { month: monthShort(m) }
      for (const s of top) row[s.label] = s.byMonth.get(m) ?? 0
      return row
    }),
    [top, months],
  )
  const table = useMemo(() => breakdownTable(series, month), [series, month])
  const colorOf = (key: string) => (key === '__others' ? OTHERS_COLOR : PALETTE[top.findIndex((s) => s.key === key) % PALETTE.length])
  const { rows, totals } = table

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">{title}</div>
        {controls}
      </div>
      {series.length === 0 ? (
        <EmptyState title="Sem gastos nesta janela" hint={emptyHint} />
      ) : (
        <>
          {top.length > 0 ? (
          <ResponsiveContainer height={260}>
            <ComposedChart data={data}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="month" tick={axis} axisLine={false} tickLine={false} />
              <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={compactEUR} width={44} />
              <Tooltip content={<ChartTooltip total />} cursor={cursorStyle} isAnimationActive={false} />
              <Legend content={<ChartLegend />} />
              {top.map((s) => (
                <Bar key={s.key} dataKey={s.label} stackId="b" fill={colorOf(s.key)} maxBarSize={56} />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted">Ainda sem gastos nesta janela.</p>
          )}

          <div className="mt-4 overflow-x-auto thin-scroll">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-muted">
                  <th className="py-1.5 pr-3">{monthLabel(month)}</th>
                  <th className="px-2 py-1.5 text-right">{valueLabel}</th>
                  <th className="px-2 py-1.5 text-right" title="Média dos 3 meses anteriores">Média 3 meses</th>
                  <th className="px-2 py-1.5 text-right" title="Média dos 6 meses anteriores">Média 6 meses</th>
                  <th className="px-2 py-1.5 text-right" title="Valor do meio dos 3 meses anteriores (ignora meses atípicos)">Mediana 3 meses</th>
                  <th className="px-2 py-1.5 text-right" title="Este mês menos a mediana dos 3 meses anteriores">Dif. vs mediana 3m</th>
                  <th className="w-32 py-1.5 pl-3">Peso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const up = r.delta > 0 && r.median3 > 0 && r.delta / r.median3 >= 0.3 && r.delta >= 20
                  return (
                    <tr key={r.key}>
                      <td className="py-2 pr-3">
                        <span className="flex items-center gap-2 font-medium">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: top.some((s) => s.key === r.key) ? colorOf(r.key) : OTHERS_COLOR }} />
                          {r.label}
                        </span>
                      </td>
                      <td className="tnum px-2 py-2 text-right font-semibold">{r.thisMonth > 0 ? fmtEUR(r.thisMonth) : '—'}</td>
                      <td className="tnum px-2 py-2 text-right text-muted">{r.avg3 > 0 ? fmtEUR(r.avg3) : '—'}</td>
                      <td className="tnum px-2 py-2 text-right text-muted">{r.avg6 > 0 ? fmtEUR(r.avg6) : '—'}</td>
                      <td className="tnum px-2 py-2 text-right text-muted">{r.median3 > 0 ? fmtEUR(r.median3) : '—'}</td>
                      <td className={cx('tnum px-2 py-2 text-right', up ? 'font-semibold text-warn' : 'text-muted')}>
                        {r.delta === 0 ? '—' : `${r.delta > 0 ? '+' : ''}${fmtEUR(r.delta)}`}
                      </td>
                      <td className="py-2 pl-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                            <div className="h-full rounded-full bg-accent-strong" style={{ width: `${Math.round(r.share * 100)}%` }} />
                          </div>
                          <span className="tnum w-9 text-right text-xs text-muted">{Math.round(r.share * 100)}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-semibold">
                  <td className="py-2 pr-3">Total</td>
                  <td className="tnum px-2 py-2 text-right">{fmtEUR(totals.thisMonth)}</td>
                  <td className="tnum px-2 py-2 text-right text-muted">{fmtEUR(totals.avg3)}</td>
                  <td className="tnum px-2 py-2 text-right text-muted">{fmtEUR(totals.avg6)}</td>
                  <td className="tnum px-2 py-2 text-right text-muted">{fmtEUR(totals.median3)}</td>
                  <td className="tnum px-2 py-2 text-right text-muted">
                    {Math.abs(totals.thisMonth - totals.median3) < 0.005 ? '—' : `${totals.thisMonth > totals.median3 ? '+' : ''}${fmtEUR(totals.thisMonth - totals.median3)}`}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            "Dif. vs mediana 3m" compara este mês com a <strong>mediana</strong> dos 3 meses anteriores (o valor do meio, que não é
            distorcido por um mês atípico); as médias de 3 e 6 meses são só referência. Fica laranja quando sobe 30% ou mais (e pelo menos 20 €).
            {' '}Só aparece o que teve gasto este mês ou nos 6 meses anteriores.
          </p>
        </>
      )}
    </Card>
  )
}

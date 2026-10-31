import { useMemo, useState } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { allocationSummary, round2 } from '../lib/calc/allocation'
import { bucketBalance, computeBalances, totalBalance } from '../lib/calc/balances'
import { offPlanBreakdown } from '../lib/calc/breakdown'
import type { MonthReport } from '../lib/calc/planVsActual'
import { currentMonthKey, fmtEURWhole as fmtEUR, fmtPct, monthLabel, monthShort } from '../lib/format'
import { effectivePlan, firstPlanMonth, useStore } from '../store/useStore'
import type { MonthKey } from '../types'
import { ChartLegend, ChartTooltip, compactEUR, cursorStyle } from './ChartParts'
import { BreakdownPanel } from './BreakdownPanel'
import { Card, EmptyState, MetricCard, MacroTitle, Select, cx } from './ui'

const PALETTE = ['#1f8a8a', '#d9573b', '#e8a21c', '#6b4c8a', '#3b7bbf', '#c9507a', '#5f8f3a', '#8a5a3b']
const AUTO_LABEL = 'Débitos automáticos'
const AUTO_ROW_LABEL = 'Débitos automáticos'

const axis = { fill: 'var(--muted)', fontSize: 12 }

// Análise das poupanças na janela de 12 meses do Analytics: quanto vai para
// poupança/investimento, em que baldes, como evolui cada saldo, como se
// compara a poupança planeada com a que realmente sobra, e se os objetivos
// estão no caminho.
export function SavingsAnalytics({
  month, months, reports,
}: { month: MonthKey; months: MonthKey[]; reports: Map<MonthKey, MonthReport> }) {
  const data = useStore((s) => s.data)
  const currentMonth = currentMonthKey()

  const buckets = useMemo(
    () => data.savingsBuckets.slice().sort((a, b) => a.order - b.order),
    [data.savingsBuckets],
  )

  // Plano de cada mês: o gravado; para o mês atual/futuros, o "efetivo".
  const rows = useMemo(() => months.map((m) => {
    const plan = data.monthlyPlans.find((p) => p.id === m) ?? (m >= currentMonth ? effectivePlan(data, m) : undefined)
    const sum = allocationSummary(plan, data.incomeSources)
    const saved = round2(sum.totalSavings + sum.totalAutoInvestments)
    const report = reports.get(m)
    const real = sum.totalIncome > 0 && m <= currentMonth && report && (report.spentCash > 0)
      ? ((sum.totalIncome - report.spentCash) / sum.totalIncome) * 100
      : null
    return {
      m, plan, income: sum.totalIncome, saved, auto: sum.totalAutoInvestments,
      hasPlan: sum.totalIncome > 0 || saved > 0,
      plannedRate: sum.totalIncome > 0 ? (saved / sum.totalIncome) * 100 : null,
      realRate: real,
      usedFromSavings: report?.offPlanTotal ?? 0,
    }
  }), [months, data, currentMonth, reports])

  const from = firstPlanMonth(data)
  const table = useMemo(
    () => computeBalances({
      buckets, plans: data.monthlyPlans, movements: data.savingsMovements, overrides: data.balanceOverrides,
      from, to: month,
    }),
    [buckets, data.monthlyPlans, data.savingsMovements, data.balanceOverrides, from, month],
  )

  const contribution = (bucketId: string, i: number) => rows[i].plan?.savings[bucketId] ?? 0

  // Baldes com contribuições / saldo na janela.
  const contribBuckets = buckets.filter((b) => rows.some((_, i) => Math.abs(contribution(b.id, i)) > 0.004))
  const balanceBuckets = buckets.filter((b) => months.some((m) => Math.abs(bucketBalance(table, b.id, m)) > 0.004))
  const hasAuto = rows.some((r) => r.auto > 0.004)

  const pastRows = rows.filter((r) => r.hasPlan && r.m <= currentMonth)
  const avgSaved = pastRows.length ? pastRows.reduce((s, r) => s + r.saved, 0) / pastRows.length : 0
  const rateRows = pastRows.filter((r) => r.plannedRate !== null)
  const avgRate = rateRows.length ? rateRows.reduce((s, r) => s + (r.plannedRate ?? 0), 0) / rateRows.length : 0
  const usedTotal = round2(rows.reduce((s, r) => s + r.usedFromSavings, 0))
  const selected = rows[rows.length - 1]

  const contribData = rows.map((r, i) => {
    const row: Record<string, number | string> = { month: monthShort(r.m) }
    for (const b of contribBuckets) row[b.name] = contribution(b.id, i)
    if (hasAuto) row[AUTO_LABEL] = r.auto
    return row
  })
  const rateData = rows.map((r) => ({
    month: monthShort(r.m),
    planeada: r.plannedRate !== null ? round2(r.plannedRate) : null,
    real: r.realRate !== null ? round2(r.realRate) : null,
  }))
  // Gastos pagos pela poupança: por balde › subcategoria.
  const [usedBucket, setUsedBucket] = useState<string>('all')
  const usedBuckets = useMemo(() => {
    const ids = new Set<string>()
    for (const m of months) for (const o of reports.get(m)?.offPlan ?? []) ids.add(o.group.id)
    return buckets.filter((b) => ids.has(b.id))
  }, [months, reports, buckets])
  const usedBucketEff = usedBucket === 'all' || usedBuckets.some((b) => b.id === usedBucket) ? usedBucket : 'all'
  const usedSeries = useMemo(() => offPlanBreakdown(reports, months, usedBucketEff), [reports, months, usedBucketEff])
  const hasAnything = rows.some((r) => r.hasPlan) || balanceBuckets.length > 0

  if (!hasAnything) {
    return (
      <section>
        <MacroTitle>Poupanças</MacroTitle>
        <Card><EmptyState title="Ainda sem dados de poupança" hint="Aloca poupança no Planeamento para veres a análise aqui." /></Card>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <MacroTitle>Poupanças</MacroTitle>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Saldo nos baldes"
          value={fmtEUR(totalBalance(table, month))}
          hint={`no fim de ${monthLabel(month)}`}
        />
        <MetricCard
          label="Poupado no mês"
          value={fmtEUR(selected.saved)}
          hint={selected.plannedRate !== null ? `${fmtPct(selected.plannedRate)} do income (planeado)` : undefined}
          tone="positive"
        />
        <MetricCard
          label="Média mensal"
          value={fmtEUR(avgSaved)}
          hint={rateRows.length ? `${fmtPct(avgRate)} do income, em ${rateRows.length} meses` : undefined}
          info="Média do que vai para baldes de poupança e débitos automáticos, nos meses da janela com plano."
        />
        <MetricCard
          label="Usado da poupança"
          value={fmtEUR(usedTotal)}
          hint="gastos pagos pela poupança, 12 meses"
          tone={usedTotal > 0 ? 'warn' : 'default'}
          info="Total de gastos cuja categoria é um balde de poupança (ex.: reparações). Mostra quanto a poupança teve de cobrir."
        />
      </div>

      <Card>
        <div className="mb-3 text-sm font-semibold">Poupado por mês, por balde</div>
        {contribBuckets.length === 0 && !hasAuto ? (
          <p className="text-sm text-muted">Sem contribuições nesta janela.</p>
        ) : (
          <ResponsiveContainer height={260}>
            <ComposedChart data={contribData}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="month" tick={axis} axisLine={false} tickLine={false} />
              <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={compactEUR} width={44} />
              <Tooltip content={<ChartTooltip total format={fmtEUR} />} cursor={cursorStyle} isAnimationActive={false} />
              <Legend content={<ChartLegend />} />
              {contribBuckets.map((b, i) => (
                <Bar key={b.id} dataKey={b.name} stackId="s" fill={PALETTE[i % PALETTE.length]} maxBarSize={56} />
              ))}
              {hasAuto && <Bar dataKey={AUTO_LABEL} stackId="s" fill="#94a3b8" maxBarSize={56} />}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card>
        <div className="mb-1 text-sm font-semibold">Taxa de poupança: planeada vs. real</div>
        <p className="mb-3 text-xs text-muted">
          Planeada = (poupança + débitos automáticos) ÷ income. Real = (income − gasto real do orçamento) ÷ income —
          o que realmente sobrou. Se a real fica abaixo da planeada, gastaste mais do que o plano previa.
          O mês em curso ainda está incompleto.
        </p>
        <ResponsiveContainer height={240}>
          <LineChart data={rateData}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="month" tick={axis} axisLine={false} tickLine={false} />
            <YAxis tick={axis} axisLine={false} tickLine={false} unit="%" width={44} />
            <Tooltip content={<ChartTooltip format={fmtPct} />} isAnimationActive={false} />
            <Legend content={<ChartLegend />} />
            <Line type="monotone" dataKey="planeada" name="Planeada" stroke="var(--warn)" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
            <Line type="monotone" dataKey="real" name="Real (sobra)" stroke="var(--accent-strong)" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {usedTotal > 0 && (
        <BreakdownPanel
          title={usedBucketEff === 'all' ? 'Pago pela poupança, por balde › subcategoria' : 'Pago pela poupança, por subcategoria'}
          controls={
            <Select value={usedBucketEff} onChange={(e) => setUsedBucket(e.target.value)} className="py-1.5 text-xs">
              <option value="all">Todos os baldes</option>
              {usedBuckets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          }
          series={usedSeries}
          months={months}
          month={month}
          valueLabel="Usado"
          emptyHint="Escolhe um balde como categoria de um gasto para ele aparecer aqui."
        />
      )}

      <Card className="overflow-x-auto thin-scroll">
        <div className="mb-3 text-sm font-semibold">Contribuições por balde</div>
        {contribBuckets.length === 0 && !hasAuto ? (
          <p className="text-sm text-muted">Sem contribuições nesta janela.</p>
        ) : (
          <>
            <table className="w-full min-w-[720px] border-separate border-spacing-1 text-xs">
              <thead>
                <tr className="text-left font-medium text-muted">
                  <th className="pr-3">Balde</th>
                  {months.map((m) => (
                    <th key={m} className={cx('px-1 text-center', m === month && 'font-semibold text-text')}>{monthShort(m)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contribBuckets.map((b) => {
                  // Escala entre o mínimo e o máximo (>0) do balde, para as diferenças se notarem.
                  const vals = rows.map((_, i) => contribution(b.id, i)).filter((v) => v > 0)
                  const lo = Math.min(...vals)
                  const hi = Math.max(...vals)
                  const shade = (v: number) => (hi > lo ? (v - lo) / (hi - lo) : 0.5)
                  return (
                    <tr key={b.id}>
                      <td className="whitespace-nowrap pr-3 font-medium text-text">{b.name}</td>
                      {rows.map((r, i) => {
                        const v = contribution(b.id, i)
                        const alpha = v > 0 ? 0.15 + 0.7 * shade(v) : 0
                        return (
                          <td
                            key={r.m}
                            className="tnum h-8 rounded text-center align-middle"
                            style={{
                              backgroundColor: v > 0 ? `rgba(16, 185, 129, ${alpha.toFixed(2)})` : 'var(--surface-2)',
                              color: v <= 0 ? 'var(--muted)' : alpha > 0.55 ? '#fff' : 'var(--text)',
                            }}
                            title={`${b.name} • ${monthShort(r.m)}: ${fmtEUR(v)}`}
                          >
                            {v > 0 ? fmtEUR(v, true) : ''}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
                {hasAuto && (
                  <tr>
                    <td className="whitespace-nowrap pr-3 font-medium text-text">{AUTO_ROW_LABEL}</td>
                    {rows.map((r) => (
                      <td
                        key={r.m}
                        className="tnum h-8 rounded text-center align-middle"
                        style={{ backgroundColor: r.auto > 0 ? 'rgba(148, 163, 184, 0.3)' : 'var(--surface-2)' }}
                      >
                        {r.auto > 0 ? fmtEUR(r.auto, true) : ''}
                      </td>
                    ))}
                  </tr>
                )}
                <tr className="font-semibold">
                  <td className="whitespace-nowrap pr-3 text-text">Total poupado</td>
                  {rows.map((r) => (
                    <td key={r.m} className="tnum h-8 text-center align-middle">{r.hasPlan ? fmtEUR(r.saved, true) : ''}</td>
                  ))}
                </tr>
                <tr className="text-muted">
                  <td className="whitespace-nowrap pr-3">% do income</td>
                  {rows.map((r) => (
                    <td key={r.m} className="tnum text-center align-middle">
                      {r.plannedRate !== null ? `${Math.round(r.plannedRate)}%` : ''}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-muted">
              Valores planeados em cada mês (as transferências fazem-se quando aplicas o plano). Em cada balde,
              o verde vai do mais claro (a menor contribuição) ao mais escuro (a maior).
              {hasAuto && ' "Débitos automáticos" é o dinheiro que sai direto da conta para investimentos (ex.: PPR), definido em Planeamento — não passa pelos baldes.'}
            </p>
          </>
        )}
      </Card>
    </section>
  )
}

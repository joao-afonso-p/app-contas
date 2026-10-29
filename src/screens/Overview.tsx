import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  MetricCard,
  Modal,
  Money,
  SectionTitle,
  Select,
  cx,
} from '../components/ui'
import { ChartTooltip } from '../components/ChartParts'
import { allocationSummary, round2 } from '../lib/calc/allocation'
import { activeAccountingMonth, bucketBalance, computeBalances, totalBalance } from '../lib/calc/balances'
import { savingsRate } from '../lib/calc/projections'
import { allGroups, makeResolver } from '../lib/calc/categories'
import { buildMonthReport, computeInsights, detectFixedGroups, groupMonthTotals, type MonthReport } from '../lib/calc/planVsActual'
import {
  addMonths,
  currentMonthKey,
  dayOfMonth,
  fmtEUR as fmtEURExact,
  fmtEURWhole as fmtEUR,
  fmtPct,
  monthLabel,
  monthOfDate,
  monthRange,
  monthShort,
  parseAmount,
  todayISO,
} from '../lib/format'
import { activeBuckets, autoInvestmentTotals, effectivePlan, firstPlanMonth, useStore, vehicleAllocations } from '../store/useStore'

// Uma cor distinta por balde (até 9) — a linha do total tem a sua própria cor.
const BUCKET_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948', '#06b6d4']
const TOTAL_KEY = 'total'

export function Overview() {
  const data = useStore((s) => s.data)
  const addMovement = useStore((s) => s.addMovement)
  const setScreen = useStore((s) => s.setScreen)

  const calendarMonth = currentMonthKey()
  const accountingMonth = activeAccountingMonth(data.monthlyPlans, calendarMonth)
  const buckets = useMemo(() => activeBuckets(data), [data])

  const months = useMemo(
    () => monthRange(firstPlanMonth(data), accountingMonth),
    [data, accountingMonth],
  )

  const table = useMemo(
    () =>
      computeBalances({
        buckets,
        plans: data.monthlyPlans,
        movements: data.savingsMovements,
        overrides: data.balanceOverrides,
        from: months[0],
        to: accountingMonth,
      }),
    [buckets, data.monthlyPlans, data.savingsMovements, data.balanceOverrides, months, accountingMonth],
  )

  const totalNow = totalBalance(table, accountingMonth)
  const allocations = useMemo(() => vehicleAllocations(data), [data])
  const episodicInvested = allocations.reduce((acc, a) => acc + a.invested, 0)
  // totalNow já é o saldo líquido dos baldes/objetivos — as saídas episódicas
  // para veículos já saíram de lá (foram registadas como movimento negativo),
  // por isso "na conta do banco" não volta a subtraí-las.
  const bankBalance = totalNow

  const autoTotals = useMemo(
    () => autoInvestmentTotals(data, accountingMonth),
    [data, accountingMonth],
  )
  const autoInvested = useMemo(
    () => [...autoTotals.values()].reduce((acc, v) => acc + v, 0),
    [autoTotals],
  )
  const vehiclesWithInitialBalance = data.investmentVehicles.filter((v) => v.initialBalance)
  const initialInvested = vehiclesWithInitialBalance.reduce((acc, v) => acc + (v.initialBalance ?? 0), 0)
  const totalInvested = episodicInvested + autoInvested + initialInvested
  // Total poupado = o que ainda está nos baldes/objetivos + tudo o que já foi
  // parar a veículos de investimento (de qualquer origem).
  const totalSaved = totalNow + totalInvested

  const accountingPlan = data.monthlyPlans.find((p) => p.id === accountingMonth)
  const currentSummary = allocationSummary(accountingPlan, data.incomeSources)
  const currentRate = savingsRate(currentSummary.totalIncome, currentSummary.totalSavings)

  const calendarPlan = data.monthlyPlans.find((p) => p.id === calendarMonth)
  const showApplyWarning = dayOfMonth() >= 10 && calendarPlan?.closed !== true

  // ---------- Evolução de saldos ----------

  // Série mostrada no gráfico: o total poupado (por defeito) ou um balde.
  const [series, setSeries] = useState<string>(TOTAL_KEY)
  const seriesBucket = buckets.find((b) => b.id === series)
  const seriesColor = seriesBucket
    ? BUCKET_COLORS[buckets.findIndex((b) => b.id === seriesBucket.id) % BUCKET_COLORS.length]
    : 'var(--accent-strong)'

  // Total poupado ao longo do tempo = saldos dos baldes + tudo o que já foi para
  // veículos até esse mês. O último ponto usa exatamente o valor do cartão.
  const savedByMonth = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of months) {
      let episodic = 0
      for (const mv of data.savingsMovements) {
        if (mv.vehicleId && monthOfDate(mv.date) <= m) episodic += -mv.amount
      }
      const auto = [...autoInvestmentTotals(data, m).values()].reduce((acc, v) => acc + v, 0)
      map.set(m, round2(totalBalance(table, m) + episodic + auto + initialInvested))
    }
    map.set(accountingMonth, round2(totalSaved))
    return map
  }, [months, data, table, initialInvested, accountingMonth, totalSaved])

  const chartData = months.map((m) => ({
    mes: monthShort(m),
    [seriesBucket?.name ?? 'Total poupado']: seriesBucket ? bucketBalance(table, seriesBucket.id, m) : savedByMonth.get(m) ?? 0,
  }))

  // Variação de cada balde face ao mês anterior, separando o que saiu para
  // investimento (dinheiro que continua teu) do resto.
  const prevMonth = months.length > 1 ? months[months.length - 2] : undefined
  const bucketChange = (bucketId: string) => {
    if (!prevMonth) return null
    const delta = bucketBalance(table, bucketId, accountingMonth) - bucketBalance(table, bucketId, prevMonth)
    const invested = data.savingsMovements
      .filter((mv) => mv.bucketId === bucketId && mv.vehicleId && monthOfDate(mv.date) === accountingMonth)
      .reduce((acc, mv) => acc - mv.amount, 0)
    return { other: round2(delta + invested), invested: round2(invested) }
  }

  // ---------- Forçar saldo de um balde ----------
  const [forceModal, setForceModal] = useState<{ step: 'form' | 'confirm'; bucketId: string; value: string } | null>(null)

  const openForceModal = () => {
    setForceModal({ step: 'form', bucketId: buckets[0]?.id ?? '', value: '' })
  }

  const confirmForceStep = () => {
    if (!forceModal) return
    if (!forceModal.bucketId || parseAmount(forceModal.value) === null) return
    setForceModal({ ...forceModal, step: 'confirm' })
  }

  const applyForcedBalance = () => {
    if (!forceModal) return
    const parsed = parseAmount(forceModal.value)
    if (parsed === null) return
    const delta = round2(parsed - bucketBalance(table, forceModal.bucketId, accountingMonth))
    if (Math.abs(delta) > 0.005) {
      void addMovement({
        date: todayISO(),
        bucketId: forceModal.bucketId,
        amount: delta,
        description: 'Ajuste de saldo',
      })
    }
    setForceModal(null)
  }

  const forceBucket = forceModal ? buckets.find((b) => b.id === forceModal.bucketId) : undefined
  const forceOldValue = forceModal ? bucketBalance(table, forceModal.bucketId, accountingMonth) : 0
  const forceNewValue = forceModal ? parseAmount(forceModal.value) ?? 0 : 0

  // ---------- Distribuição por veículos ----------
  // Um único total por veículo, sem distinguir a origem (balde, débito automático, saldo inicial).
  interface VehicleTotal { vehicleId: string; vehicleName: string; invested: number }

  const vehicleTotalMap = new Map<string, VehicleTotal>()
  const vehicleTotalOrder: string[] = []
  const addToVehicleTotal = (vehicleId: string, amount: number) => {
    let entry = vehicleTotalMap.get(vehicleId)
    if (!entry) {
      const vehicleName = data.investmentVehicles.find((v) => v.id === vehicleId)?.name ?? '—'
      entry = { vehicleId, vehicleName, invested: 0 }
      vehicleTotalMap.set(vehicleId, entry)
      vehicleTotalOrder.push(vehicleId)
    }
    entry.invested += amount
  }
  for (const a of allocations) addToVehicleTotal(a.vehicleId, a.invested)
  for (const [vehicleId, invested] of autoTotals.entries()) addToVehicleTotal(vehicleId, invested)
  for (const v of vehiclesWithInitialBalance) addToVehicleTotal(v.id, v.initialBalance ?? 0)
  const vehicleTotals = vehicleTotalOrder.map((id) => vehicleTotalMap.get(id)!)

  // ---------- Plano vs. real (últimos 6 meses até ao mês de calendário) ----------

  const reportMonths = useMemo(() => monthRange(addMonths(calendarMonth, -5), calendarMonth), [calendarMonth])
  const reports = useMemo(() => {
    const resolve = makeResolver(data)
    const groups = allGroups(data)
    const totals = groupMonthTotals(data.transactions, resolve)
    const today = new Date()
    const dim = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    return reportMonths.map((m): { report: MonthReport; income: number; savingsPlanned: number } => {
      const saved = data.monthlyPlans.find((p) => p.id === m)
      const plan = saved ?? (m === calendarMonth ? effectivePlan(data, m) : undefined)
      const summary = allocationSummary(plan, data.incomeSources)
      return {
        report: buildMonthReport({
          month: m, transactions: data.transactions, resolve, groups, subcategories: data.subcategories,
          planExpenses: plan?.expenses, elapsed: m === calendarMonth ? today.getDate() / dim : undefined,
          fixedIds: detectFixedGroups(groups, totals, m),
        }),
        income: summary.totalIncome,
        savingsPlanned: summary.totalSavings,
      }
    })
  }, [data, reportMonths, calendarMonth])
  const insights = useMemo(() => computeInsights(reports.map((r) => r.report)), [reports])

  return (
    <div className="fade-up flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-black">Overview</h1>
        <Badge tone="accent">{monthLabel(accountingMonth, true)}</Badge>
      </div>

      {showApplyWarning && (
        <Card className="border-warn/40 bg-warn-soft">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-lg">⚠️</span>
            <div className="flex flex-1 flex-wrap items-center gap-2 text-sm font-medium">
              O plano de {monthLabel(calendarMonth, true)} ainda não foi aplicado.
              <Badge tone="warn">Por aplicar</Badge>
            </div>
            <Button size="sm" onClick={() => setScreen('planeamento')}>Ir para Planeamento</Button>
          </div>
        </Card>
      )}

      {insights.length > 0 && (
        <Card>
          <SectionTitle
            right={<Button variant="ghost" size="sm" onClick={() => setScreen('budgets')}>Ver Analytics</Button>}
          >
            Atenção este mês
          </SectionTitle>
          <ul className="flex flex-col gap-2">
            {insights.slice(0, 4).map((i, idx) => (
              <li key={idx} className={cx('items-start gap-2 text-sm', idx >= 2 ? 'hidden md:flex' : 'flex')}>
                <span className="mt-0.5">
                  {i.kind === 'over' ? '🔴' : i.kind === 'recurring' ? '🔁' : i.kind === 'unassigned' ? '⚠️' : '🟠'}
                </span>
                <span>{i.text}</span>
              </li>
            ))}
            {insights.length > 4 && (
              <li className="hidden text-xs text-muted md:block">+ {insights.length - 4} alertas em Analytics</li>
            )}
            {insights.length > 2 && (
              <li className="text-xs text-muted md:hidden">+ {insights.length - 2} alertas em Analytics (desktop)</li>
            )}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <MetricCard label="Total poupado" value={fmtEUR(totalSaved)} />
        <MetricCard label="Na conta do banco" value={fmtEUR(bankBalance)} />
        <div className="hidden md:block">
          <MetricCard label="Distribuído em veículos" value={fmtEUR(totalInvested)} />
        </div>
        <div className="hidden md:block">
          <MetricCard
            label="Taxa de poupança (mês)"
            value={fmtPct(currentRate)}
            hint={`do income de ${monthLabel(accountingMonth)}`}
          />
        </div>
      </div>

      <section>
        <SectionTitle
          right={
            <Button variant="ghost" size="sm" onClick={openForceModal} aria-label="Forçar saldo de um balde">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"
                />
              </svg>
            </Button>
          }
        >
          Saldos por balde
        </SectionTitle>
        <Card>
          <p className="mb-2 text-[11px] text-muted md:hidden">Setas: variação face ao mês passado.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {buckets.map((b) => (
              <div key={b.id} className="rounded-xl border border-border bg-surface p-3">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <div className="break-words text-xs font-medium text-muted">{b.name}</div>
                  {b.kind === 'goal' && <Badge tone="goal">Objetivo</Badge>}
                </div>
                <div className="mt-1">
                  <Money whole value={bucketBalance(table, b.id, accountingMonth)} className="text-lg font-bold lg:text-2xl" />
                </div>
                <BucketChange change={bucketChange(b.id)} />
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle
          right={
            <span className="hidden md:inline-flex">
              <Button variant="ghost" size="sm" onClick={() => setScreen('historico')}>
                Ver histórico completo
              </Button>
            </span>
          }
        >
          Evolução de saldos
        </SectionTitle>
        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="hidden text-xs font-medium text-muted md:block">
              {seriesBucket ? `Saldo de ${seriesBucket.name}` : 'Total poupado (baldes + investido)'}
            </div>
            <Select value={series} onChange={(e) => setSeries(e.target.value)} aria-label="Série do gráfico" className="w-full md:w-auto">
              <option value={TOTAL_KEY}>Total poupado</option>
              {buckets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <div className="h-[220px] md:h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="mes" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: 'var(--muted)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                domain={['auto', 'auto']}
                tickFormatter={(v: number) => String(Math.trunc(v))}
              />
              <Tooltip content={<ChartTooltip total={false} format={fmtEUR} />} isAnimationActive={false} />
              <Line
                type="monotone"
                dataKey={seriesBucket?.name ?? 'Total poupado'}
                stroke={seriesColor}
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: seriesColor, stroke: 'var(--surface)', strokeWidth: 1.5 }}
                activeDot={{ r: 6 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
          </div>
        </Card>
      </section>

      <section className="hidden md:block">
        <SectionTitle>Mês a mês: plano vs. real</SectionTitle>
        <Card className="overflow-x-auto thin-scroll">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-muted">
                <th className="py-1.5 pr-3">Mês</th>
                <th className="px-2 py-1.5 text-right">Income</th>
                <th className="px-2 py-1.5 text-right">Gasto planeado</th>
                <th className="px-2 py-1.5 text-right">Gasto real</th>
                <th className="px-2 py-1.5 text-right">vs. plano</th>
                <th className="px-2 py-1.5 text-right">Poupança plano</th>
                <th className="px-2 py-1.5 text-right">Poupança real</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reports.map(({ report, income, savingsPlanned }) => {
                const m = report.month
                const planRate = savingsRate(income, savingsPlanned)
                const realRate = income > 0 ? ((income - report.spentCash) / income) * 100 : 0
                const diff = report.spentCash - report.plannedTotal
                return (
                  <tr key={m}>
                    <td className={cx('py-2 pr-3 font-medium', m === calendarMonth && 'text-accent-strong')}>
                      {monthShort(m)}{m === calendarMonth && <span className="ml-1 text-[10px] font-normal text-muted">em curso</span>}
                    </td>
                    <td className="tnum px-2 py-2 text-right">{income > 0 ? fmtEUR(income) : '—'}</td>
                    <td className="tnum px-2 py-2 text-right">{report.hasPlan ? fmtEUR(report.plannedTotal) : '—'}</td>
                    <td className="tnum px-2 py-2 text-right">{fmtEUR(report.spentCash)}</td>
                    <td className="px-2 py-2 text-right">
                      {report.hasPlan ? (
                        <span className={cx('tnum', diff > 0.5 ? 'text-negative' : diff < -0.5 ? 'text-positive' : '')}>
                          {diff > 0.5 ? '+' : ''}{fmtEUR(diff)}
                        </span>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td className="tnum px-2 py-2 text-right">{income > 0 ? fmtPct(planRate) : '—'}</td>
                    <td className="tnum px-2 py-2 text-right">{income > 0 ? fmtPct(realRate) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted">
            "Gasto real" conta o que saiu do orçamento mensal (despesas do plano + gastos ainda sem categoria);
            gastos pagos pela poupança ficam de fora. "vs. plano" = real − planeado: positivo (vermelho) = gastaste mais do que planeaste; negativo (verde) = gastaste menos.
            "Poupança real" = (income − gasto real) ÷ income.
          </p>
        </Card>
      </section>

      <section>
        <SectionTitle>Distribuição por veículos</SectionTitle>
        <Card className="overflow-x-auto thin-scroll">
          {vehicleTotals.length === 0 ? (
            <EmptyState
              title="Sem registos de distribuição por veículos"
              hint="Regista uma saída para investimento nos Movimentos de Poupança, ou um débito automático no Planeamento"
            />
          ) : (
            <table className="w-full min-w-[320px] text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-muted">
                  <th className="py-1.5 pr-3">Veículo</th>
                  <th className="px-2 py-1.5 text-right">Total investido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {vehicleTotals.map((v) => (
                  <tr key={v.vehicleId}>
                    <td className="py-2 pr-3 font-medium">{v.vehicleName}</td>
                    <td className="px-2 py-2 text-right">
                      <Money whole value={v.invested} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-semibold">
                  <td className="py-2 pr-3">Total</td>
                  <td className="tnum px-2 py-2 text-right">{fmtEUR(totalInvested)}</td>
                </tr>
              </tfoot>
            </table>
          )}
          <p className="mt-3 hidden text-xs text-muted md:block">
            A gestão dos veículos disponíveis faz-se em Definições. Para investir, regista um movimento de saída
            marcado como investimento, ou define um débito automático no Planeamento.
          </p>
        </Card>
      </section>

      <Modal
        open={forceModal !== null}
        onClose={() => setForceModal(null)}
        title={forceModal?.step === 'confirm' ? 'Confirmar alteração de saldo' : 'Forçar saldo'}
      >
        {forceModal?.step === 'form' && (
          <div className="flex flex-col gap-3">
            <Select
              value={forceModal.bucketId}
              onChange={(e) => setForceModal({ ...forceModal, bucketId: e.target.value })}
            >
              {buckets.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
            <Input
              inputMode="decimal"
              placeholder="Novo saldo em €"
              value={forceModal.value}
              onChange={(e) => setForceModal({ ...forceModal, value: e.target.value })}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setForceModal(null)}>Cancelar</Button>
              <Button
                size="sm"
                onClick={confirmForceStep}
                disabled={!forceModal.bucketId || parseAmount(forceModal.value) === null}
              >
                OK
              </Button>
            </div>
          </div>
        )}
        {forceModal?.step === 'confirm' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">
              Tens a certeza que queres mudar o saldo da <strong>{forceBucket?.name}</strong> de{' '}
              <strong>{fmtEURExact(forceOldValue)}</strong> para <strong>{fmtEURExact(forceNewValue)}</strong>?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setForceModal({ ...forceModal, step: 'form' })}>
                Cancelar
              </Button>
              <Button size="sm" onClick={applyForcedBalance}>Confirmar</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// Variação mensal de um balde. O que saiu para investimento não é "perda":
// aparece à parte, a cinzento, como "→ X € investidos".
function BucketChange({ change }: { change: { other: number; invested: number } | null }) {
  if (!change) return null
  const { other, invested } = change
  const hasOther = Math.abs(other) >= 1
  const hasInvested = invested >= 1
  const sign = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtEUR(Math.abs(v))}`
  if (!hasOther && !hasInvested) {
    return <div className="mt-0.5 text-[11px] text-muted">· sem variação</div>
  }
  return (
    <div className="mt-0.5 flex flex-col text-[11px]">
      {hasOther && (
        <span className={other > 0 ? 'text-positive' : 'text-negative'}>
          {other > 0 ? '↑' : '↓'} {sign(other)}<span className="hidden md:inline"> vs mês passado</span>
        </span>
      )}
      {hasInvested && <span className="text-muted">→ {fmtEUR(invested)} investidos</span>}
    </div>
  )
}

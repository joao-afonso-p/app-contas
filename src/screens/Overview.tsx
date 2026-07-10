import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
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
import { allocationSummary } from '../lib/calc/allocation'
import { bucketBalance, computeBalances, totalBalance } from '../lib/calc/balances'
import { savingsRate } from '../lib/calc/projections'
import {
  addMonths,
  currentMonthKey,
  dayOfMonth,
  fmtEUR,
  fmtPct,
  monthLabel,
  monthRange,
  monthShort,
  parseAmount,
} from '../lib/format'
import { activeBuckets, autoInvestmentTotals, firstPlanMonth, useStore, vehicleAllocations } from '../store/useStore'

const PALETTE = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6']

export function Overview() {
  const data = useStore((s) => s.data)
  const put = useStore((s) => s.put)
  const setScreen = useStore((s) => s.setScreen)

  const currentMonth = currentMonthKey()
  const buckets = useMemo(() => activeBuckets(data), [data])

  const months = useMemo(
    () => monthRange(firstPlanMonth(data), currentMonth),
    [data, currentMonth],
  )

  const table = useMemo(
    () =>
      computeBalances({
        buckets,
        plans: data.monthlyPlans,
        movements: data.savingsMovements,
        overrides: data.balanceOverrides,
        from: months[0],
        to: currentMonth,
      }),
    [buckets, data.monthlyPlans, data.savingsMovements, data.balanceOverrides, months, currentMonth],
  )

  const totalNow = totalBalance(table, currentMonth)
  const allocations = useMemo(() => vehicleAllocations(data), [data])
  const episodicInvested = allocations.reduce((acc, a) => acc + a.invested, 0)
  // totalNow já é o saldo líquido dos baldes/objetivos — as saídas episódicas
  // para veículos já saíram de lá (foram registadas como movimento negativo),
  // por isso "na conta do banco" não volta a subtraí-las.
  const bankBalance = totalNow

  const autoTotals = useMemo(() => autoInvestmentTotals(data), [data])
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

  const currentPlan = data.monthlyPlans.find((p) => p.id === currentMonth)
  const currentSummary = allocationSummary(currentPlan, data.incomeSources)
  const currentRate = savingsRate(currentSummary.totalIncome, currentSummary.totalSavings)

  const showApplyWarning = dayOfMonth() >= 10 && currentPlan?.closed !== true

  // ---------- Evolução de saldos ----------

  const geralBucket = buckets.find((b) => b.name.toLowerCase() === 'geral')
  const [selected, setSelected] = useState<Set<string>>(() => {
    const initial = new Set<string>(['total'])
    if (geralBucket) initial.add(geralBucket.id)
    return initial
  })

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedBuckets = buckets.filter((b) => selected.has(b.id))

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
    void put('balanceOverrides', {
      id: `${currentMonth}_${forceModal.bucketId}`,
      month: currentMonth,
      bucketId: forceModal.bucketId,
      balance: parsed,
    })
    setForceModal(null)
  }

  const forceBucket = forceModal ? buckets.find((b) => b.id === forceModal.bucketId) : undefined
  const forceOldValue = forceModal ? bucketBalance(table, forceModal.bucketId, currentMonth) : 0
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

  const chartData = months.map((m) => {
    const row: Record<string, number | string> = { mes: monthShort(m) }
    if (selected.has('total')) row.Total = totalBalance(table, m)
    for (const b of selectedBuckets) row[b.name] = bucketBalance(table, b.id, m)
    return row
  })

  // ---------- Comparação mensal ----------

  const last6 = months.slice(-6)

  return (
    <div className="fade-up flex flex-col gap-6">
      <h1 className="text-xl font-black">Overview</h1>

      {showApplyWarning && (
        <Card className="border-warn/40 bg-warn-soft">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-lg">⚠️</span>
            <div className="flex flex-1 flex-wrap items-center gap-2 text-sm font-medium">
              O plano de {monthLabel(currentMonth, true)} ainda não foi aplicado.
              <Badge tone="warn">Por aplicar</Badge>
            </div>
            <Button size="sm" onClick={() => setScreen('planeamento')}>Ir para Planeamento</Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total poupado" value={fmtEUR(totalSaved)} />
        <MetricCard
          label="Na conta do banco"
          value={fmtEUR(bankBalance)}
          hint="depois de distribuído em veículos"
        />
        <MetricCard
          label="Distribuído em veículos"
          value={fmtEUR(totalInvested)}
        />
        <MetricCard
          label="Taxa de poupança (mês)"
          value={fmtPct(currentRate)}
          hint="do income deste mês"
        />
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {buckets.map((b) => (
              <div key={b.id} className="rounded-xl border border-border bg-surface p-3">
                <div className="flex items-center gap-1.5">
                  <div className="truncate text-xs font-medium text-muted">{b.name}</div>
                  {b.kind === 'goal' && <Badge tone="goal">Objetivo</Badge>}
                </div>
                <div className="mt-1">
                  <Money value={bucketBalance(table, b.id, currentMonth)} className="text-lg font-bold" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle
          right={
            <Button variant="ghost" size="sm" onClick={() => setScreen('historico')}>
              Ver histórico completo
            </Button>
          }
        >
          Evolução de saldos
        </SectionTitle>
        <Card>
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              onClick={() => toggleSelect('total')}
              className={cx(
                'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                selected.has('total')
                  ? 'border-accent-strong bg-accent-soft text-accent-strong'
                  : 'border-border bg-surface text-muted hover:bg-surface-2',
              )}
            >
              Total
            </button>
            {buckets.map((b) => (
              <button
                key={b.id}
                onClick={() => toggleSelect(b.id)}
                className={cx(
                  'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                  selected.has(b.id)
                    ? 'border-accent-strong bg-accent-soft text-accent-strong'
                    : 'border-border bg-surface text-muted hover:bg-surface-2',
                )}
              >
                {b.name}
              </button>
            ))}
          </div>
          {selected.size === 0 ? (
            <p className="text-sm text-muted">Seleciona pelo menos uma série para ver o gráfico.</p>
          ) : (
            <ResponsiveContainer height={300}>
              <LineChart data={chartData}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="mes" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)' }}
                  formatter={(value: number) => fmtEUR(value)}
                />
                <Legend />
                {selected.has('total') && (
                  <Line type="monotone" dataKey="Total" stroke="var(--accent-strong)" strokeWidth={2.5} dot={false} />
                )}
                {selectedBuckets.map((b, i) => (
                  <Line
                    key={b.id}
                    type="monotone"
                    dataKey={b.name}
                    stroke={PALETTE[i % PALETTE.length]}
                    strokeWidth={2.5}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle>Comparação mensal</SectionTitle>
        <Card className="overflow-x-auto thin-scroll">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-muted">
                <th className="py-1.5 pr-3">Mês</th>
                <th className="px-2 py-1.5 text-right">Income</th>
                <th className="px-2 py-1.5 text-right">Poupado</th>
                <th className="px-2 py-1.5 text-right">Taxa</th>
                <th className="px-2 py-1.5 text-right">Variação saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {last6.map((m) => {
                const plan = data.monthlyPlans.find((p) => p.id === m)
                const summary = allocationSummary(plan, data.incomeSources)
                const rate = savingsRate(summary.totalIncome, summary.totalSavings)
                const delta = totalBalance(table, m) - totalBalance(table, addMonths(m, -1))
                return (
                  <tr key={m}>
                    <td className={cx('py-2 pr-3 font-medium', m === currentMonth && 'text-accent-strong')}>
                      {monthShort(m)}
                    </td>
                    <td className="tnum px-2 py-2 text-right">{fmtEUR(summary.totalIncome)}</td>
                    <td className="tnum px-2 py-2 text-right">{fmtEUR(summary.totalSavings)}</td>
                    <td className="tnum px-2 py-2 text-right">{fmtPct(rate)}</td>
                    <td className="px-2 py-2 text-right">
                      <Money value={delta} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
                      <Money value={v.invested} />
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
          <p className="mt-3 text-xs text-muted">
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
              <strong>{fmtEUR(forceOldValue)}</strong> para <strong>{fmtEUR(forceNewValue)}</strong>?
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

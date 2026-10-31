import { Fragment, useMemo, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartLegend, ChartTooltip, compactEUR, cursorStyle } from '../components/ChartParts'
import { Badge, Button, Card, EditableName, EmptyState, Input, MetricCard, Modal, SectionTitle, Select, cx } from '../components/ui'
import { round2 } from '../lib/calc/allocation'
import { normalizeDesc } from '../lib/calc/budgets'
import {
  accountingMonth, buildVehicleSummaries, holdingsSeries, injectedBreakdown, medianMonthlyInjection, monthlyAfterYears, projectWithContributions, seriesMonths,
  type Holding, type VehicleSummary,
} from '../lib/calc/investments'
import { addMonths, calendarMonthKey, fmtDate, fmtEURWhole as fmtEUR, fmtPct, monthRange, monthShort, nowISO, parseAmount, todayISO, uid } from '../lib/format'
import { InvestmentSimulator } from '../components/InvestmentSimulator'
import { useStore } from '../store/useStore'
import { Trash, TriangleAlert } from 'lucide-react'

const PALETTE = ['#1f8a8a', '#d9573b', '#e8a21c', '#6b4c8a', '#3b7bbf', '#c9507a', '#5f8f3a', '#8a5a3b']
const axis = { fill: 'var(--muted)', fontSize: 12 }
const KINDS = ['ETF', 'Ação', 'Fundo', 'Conta poupança', 'Certificado de Aforro', 'Depósito a prazo', 'Outro']

type ModalState =
  | { type: 'checkpoint'; holding: Holding }
  | { type: 'entry'; holding: Holding }
  | { type: 'distribute'; summary: VehicleSummary }
  | { type: 'asset'; vehicleId: string }
  | null

const gainTone = (v: number) => (v > 0.004 ? 'text-accent-strong' : v < -0.004 ? 'text-negative' : 'text-muted')
const signed = (v: number) => `${v > 0.004 ? '+' : v < -0.004 ? '−' : ''}${fmtEUR(Math.abs(v))}`

// Eixo Y que se adapta aos dados (não começa em 0): margem à volta do mínimo e do
// máximo, arredondada a um passo "redondo".
function fitDomain(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1]
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  const pad = Math.max(range * 0.25, Math.abs(max) * 0.03, 1)
  const raw = (range + 2 * pad) / 4
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((x) => x >= raw) ?? raw
  return [Math.max(0, Math.floor((min - pad) / step) * step), Math.ceil((max + pad) / step) * step]
}
const axisEUR = (v: number) => (Math.abs(v) >= 10000 ? compactEUR(v) : v.toLocaleString('pt-PT', { maximumFractionDigits: 0 }))

const STALE_MONTHS = 6 // mesmo limite do aviso no resumo do topo

// Data do último checkpoint; a laranja com ⚠ se já passaram 6 meses ou mais.
function CheckpointDate({ iso }: { iso?: string }) {
  if (!iso) return <span>—</span>
  const m = monthsSince(iso)
  if (m < STALE_MONTHS) return <span>{fmtDate(iso)}</span>
  return (
    <span className="font-semibold text-warn" title={`Último checkpoint há ${m} meses — convém atualizar`}>
      <TriangleAlert size={13} strokeWidth={2} className="mr-1 inline align-[-2px]" aria-hidden="true" />{fmtDate(iso)}
    </span>
  )
}

function monthsSince(iso: string): number {
  const a = new Date(iso)
  const b = new Date()
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
}

export function Investimentos() {
  const data = useStore((s) => s.data)
  const put = useStore((s) => s.put)
  const calendar = calendarMonthKey()
  const today = todayISO()
  const through = accountingMonth(data, calendar)

  const summaries = useMemo(() => buildVehicleSummaries(data, calendar, today), [data, calendar, today])
  const allHoldings = useMemo(() => summaries.flatMap((s) => s.holdings), [summaries])

  const [modal, setModal] = useState<ModalState>(null)
  const [openVehicles, setOpenVehicles] = useState<Set<string>>(new Set())
  const [detail, setDetail] = useState<string | null>(null)
  // Gráfico "Investido vs. valor": veículo (ou todos) + ativo opcional.
  const [vSel, setVSel] = useState('all')
  const [aSel, setASel] = useState('total')
  // Gráfico "Injetado": veículo (ou todos), agrupamento, janela e acumulado.
  const [injWindow, setInjWindow] = useState<'12' | '24' | 'all'>('12')
  const [injVehicle, setInjVehicle] = useState('all')
  const [injGroup, setInjGroup] = useState<'vehicle' | 'asset'>('vehicle')
  const [injCumulative, setInjCumulative] = useState(false)
  const [projContrib, setProjContrib] = useState(true)
  const [projOpen, setProjOpen] = useState<Set<string>>(new Set())
  const [newVehicle, setNewVehicle] = useState('')

  const totalContributed = round2(summaries.reduce((s, v) => s + v.contributed, 0))
  const totalValue = round2(summaries.reduce((s, v) => s + v.value, 0))
  const totalGain = round2(totalValue - totalContributed)
  const lastCp = allHoldings.map((h) => h.lastCheckpoint).filter((x): x is string => Boolean(x)).sort().pop()
  const stale = lastCp ? monthsSince(lastCp) : null

  const addVehicle = () => {
    const name = newVehicle.trim()
    if (!name) return
    void put('investmentVehicles', { id: uid(), name, archived: false, order: data.investmentVehicles.length })
    setNewVehicle('')
  }

  // ----- Gráfico 1: investido vs. valor -----
  const vSummary = summaries.find((s) => s.vehicle.id === vSel)
  const vehicleSel = vSummary ? vSel : 'all'
  const assetOptions = vSummary ? vSummary.holdings : []
  const assetSel = assetOptions.some((h) => h.key === aSel) ? aSel : 'total'
  const scopeHoldings = useMemo(() => {
    if (!vSummary) return allHoldings
    if (assetSel === 'total') return vSummary.holdings
    return vSummary.holdings.filter((h) => h.key === assetSel)
  }, [vSummary, assetSel, allHoldings])
  const valueMonths = useMemo(() => seriesMonths(scopeHoldings, through), [scopeHoldings, through])
  const valueSeries = useMemo(() => holdingsSeries(scopeHoldings, valueMonths), [scopeHoldings, valueMonths])
  // O valor só existe a partir do 1.º checkpoint: antes disso não há valor real
  // (seria igual ao investido), por isso mostra-se só a linha do investido.
  const firstCheckpoint = scopeHoldings.flatMap((h) => h.checkpoints.map((c) => c.date.slice(0, 7))).sort()[0]
  const valueData = valueSeries.map((p) => ({
    month: monthShort(p.month),
    investido: p.contributed,
    valor: firstCheckpoint && p.month >= firstCheckpoint ? p.value : null,
    checkpoint: p.checkpoint,
  }))

  // ----- Gráfico 2: injetado -----
  const injMonths = useMemo(() => {
    if (injWindow === 'all') {
      const first = data.monthlyPlans.map((p) => p.id).concat(data.savingsMovements.map((m) => m.date.slice(0, 7)), data.assetEntries.map((e) => e.date.slice(0, 7))).sort()[0] ?? through
      return monthRange(first < through ? first : through, through)
    }
    return monthRange(addMonths(through, -(Number(injWindow) - 1)), through)
  }, [injWindow, through, data.monthlyPlans, data.savingsMovements, data.assetEntries])
  const injAll = useMemo(() => injectedBreakdown(summaries, injMonths, injCumulative), [summaries, injMonths, injCumulative])
  const injVehicleSel = injAll.some((v) => v.vehicleId === injVehicle) ? injVehicle : 'all'
  // Séries a desenhar: {name, key, stackId, color, opacity, perMonth}
  const injBars = useMemo(() => {
    type Bar = { dk: string; name: string; stackId: string; color: string; opacity: number; perMonth: number[] }
    const bars: Bar[] = []
    if (injVehicleSel !== 'all') {
      const v = injAll.find((x) => x.vehicleId === injVehicleSel)!
      v.series.forEach((x, i) => bars.push({ dk: x.key, name: x.name, stackId: 's', color: PALETTE[i % PALETTE.length], opacity: 1, perMonth: x.perMonth }))
    } else if (injGroup === 'vehicle') {
      injAll.forEach((v, i) => bars.push({ dk: v.vehicleId, name: v.name, stackId: 's', color: PALETTE[(i + 2) % PALETTE.length], opacity: 1, perMonth: v.perMonth }))
    } else {
      injAll.forEach((v, i) => v.series.forEach((x, j) => bars.push({
        dk: x.key, name: `${v.name} › ${x.name}`, stackId: v.vehicleId, color: PALETTE[(i + 2) % PALETTE.length],
        opacity: Math.max(0.4, 1 - j * 0.2), perMonth: x.perMonth,
      })))
    }
    return bars
  }, [injAll, injVehicleSel, injGroup])
  const injData = injMonths.map((m, i) => {
    const row: Record<string, number | string> = { month: monthShort(m) }
    for (const b of injBars) row[b.dk] = b.perMonth[i]
    return row
  })
  const injTotal = round2(injBars.reduce((s, b) => s + (injCumulative ? b.perMonth[b.perMonth.length - 1] ?? 0 : b.perMonth.reduce((a, x) => a + x, 0)), 0))

  if (summaries.length === 0 && data.investmentVehicles.length === 0) {
    return (
      <div className="fade-up flex flex-col gap-6">
        <h1 className="text-xl font-black">Investimento</h1>
        <Card>
          <EmptyState
            title="Ainda sem investimentos"
            hint="Cria um veículo (ex.: PPR, Degiro, XTB, Certificados de Aforro) para acompanhares quanto metes e quanto vale. Se não investes, podes ignorar esta página."
          />
          <div className="mt-4 flex justify-center gap-2">
            <Input value={newVehicle} onChange={(e) => setNewVehicle(e.target.value)} placeholder="Nome do veículo…" onKeyDown={(e) => e.key === 'Enter' && addVehicle()} />
            <Button onClick={addVehicle} disabled={!newVehicle.trim()}>Criar</Button>
          </div>
        </Card>
      </div>
    )
  }

  const toggleVehicle = (id: string) => setOpenVehicles((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  // Projeção: entrada mensal = a definida pelo utilizador, ou a mediana dos últimos 6 meses.
  const projRows = allHoldings.map((h) => {
    const median = medianMonthlyInjection(h, through)
    const monthly = projContrib ? (h.monthlyContribution ?? median) : 0
    const rate = h.expectedRate ?? 0
    const growth = projContrib ? (h.contributionGrowth ?? 0) : 0
    const active = rate > 0 || monthly > 0
    return { h, median, monthly, rate, growth, active }
  }).filter((r) => r.h.value > 0 || r.median > 0 || (r.h.monthlyContribution ?? 0) > 0)
  const projFuture = (r: { h: Holding; monthly: number; rate: number; growth: number }, y: number) =>
    projectWithContributions(r.h.value, r.rate, y, r.monthly, r.growth)

  return (
    <div className="fade-up flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black">Investimento</h1>
        <div className="flex gap-2">
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Total investido" value={fmtEUR(Math.max(0, totalContributed))} hint="o que meteste, líquido de saídas" />
        <MetricCard
          label="Valor atual (estimado)"
          value={fmtEUR(totalValue)}
          hint="último checkpoint + entradas posteriores"
          info="Em cada ativo: o último valor real que registaste (checkpoint) mais o que entrou ou saiu depois. Sem checkpoint, assume-se o valor investido."
        />
        <MetricCard
          label="Ganho / perda"
          value={signed(totalGain)}
          hint={totalContributed > 0 ? fmtPct((totalGain / totalContributed) * 100) : undefined}
          tone={totalGain > 0.004 ? 'positive' : totalGain < -0.004 ? 'negative' : 'default'}
        />
        <MetricCard
          label="Último checkpoint"
          value={lastCp ? fmtDate(lastCp) : '—'}
          hint={lastCp ? (stale !== null && stale >= STALE_MONTHS ? `há ${stale} meses — convém atualizar` : stale === 0 ? 'este mês' : `há ${stale} ${stale === 1 ? 'mês' : 'meses'}`) : 'ainda sem checkpoints: o ganho conta como 0'}
          tone={stale !== null && stale >= STALE_MONTHS ? 'warn' : 'default'}
        />
      </div>

      <section>
        <SectionTitle
          right={
            <span className="max-w-xl text-right text-xs font-normal normal-case tracking-normal text-muted">
              <strong className="text-text">Movimento</strong> (direto) = dinheiro que entra (depósito) ou sai (resgate) sem vir de um balde,
              ex.: depósito da conta à ordem na corretora.
            </span>
          }
        >
          Veículos
        </SectionTitle>
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-muted">
                <th className="px-4 py-2">Veículo / ativo</th>
                <th className="px-2 py-2 text-right">Investido</th>
                <th className="px-2 py-2 text-right">Valor atual</th>
                <th className="px-2 py-2 text-right">Ganho</th>
                <th className="px-2 py-2 text-right">%</th>
                <th className="px-2 py-2">Último checkpoint</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => {
                const open = openVehicles.has(s.vehicle.id)
                const rows = s.holdings
                const single = !s.hasAssets // o veículo é o próprio ativo: uma só linha
                const pool = s.pool
                return (
                  <Fragment key={s.vehicle.id}>
                    <tr className={cx('border-b border-border bg-surface-2/40', single && detail === pool.key && 'border-b-0')}>
                      <td className="px-4 py-2.5 font-semibold">
                        <button
                          className="flex items-center gap-1.5 text-left"
                          onClick={() => (single ? setDetail(detail === pool.key ? null : pool.key) : toggleVehicle(s.vehicle.id))}
                        >
                          <span className="text-xs text-muted">{(single ? detail === pool.key : open) ? '▾' : '▸'}</span>
                          {s.vehicle.name}
                          {s.vehicle.archived && <Badge tone="warn">Arquivado</Badge>}
                          {!single && s.undistributed > 0.004 && (
                            <span className="text-xs font-normal text-warn" title="Dinheiro do veículo que ainda não está atribuído a nenhum ativo (ex.: saldo na corretora). Usa Distribuir.">
                              <TriangleAlert size={13} strokeWidth={2} className="mr-1 inline align-[-2px]" aria-hidden="true" />{fmtEUR(s.undistributed)} em saldo livre
                            </span>
                          )}
                        </button>
                      </td>
                      <td className="tnum px-2 text-right" title={s.contributed < -0.004 ? 'Já resgataste mais do que investiste: a diferença é lucro realizado' : undefined}>{fmtEUR(Math.max(0, s.contributed))}</td>
                      <td className="tnum px-2 text-right font-semibold">{fmtEUR(s.value)}</td>
                      <td className={cx('tnum px-2 text-right', gainTone(s.gain))}>{signed(s.gain)}</td>
                      <td className={cx('tnum px-2 text-right', gainTone(s.gain))}>{s.pct !== null ? fmtPct(s.pct) : '—'}</td>
                      <td className="px-2 text-xs text-muted"><CheckpointDate iso={s.lastCheckpoint} /></td>
                      <td className="whitespace-nowrap px-4 text-right">
                        <span className="inline-flex items-center gap-1">
                          {s.hasAssets && Math.abs(s.undistributed) > 0.004 && (
                            <Button size="sm" variant="soft" onClick={() => setModal({ type: 'distribute', summary: s })}>Distribuir</Button>
                          )}
                          {single && (
                            <>
                              <RowAction onClick={() => setModal({ type: 'checkpoint', holding: pool })}>Checkpoint</RowAction>
                              <RowAction onClick={() => setModal({ type: 'entry', holding: pool })}>Movimento</RowAction>
                            </>
                          )}
                          <RowAction onClick={() => setModal({ type: 'asset', vehicleId: s.vehicle.id })}>Ativo</RowAction>
                        </span>
                      </td>
                    </tr>
                    {single && detail === pool.key && <HoldingDetail holding={pool} />}
                    {!single && open && rows.map((h) => (
                      <HoldingRow
                        key={h.key}
                        holding={h}
                        indent={s.hasAssets}
                        expanded={detail === h.key}
                        onToggle={() => setDetail(detail === h.key ? null : h.key)}
                        onCheckpoint={() => setModal({ type: 'checkpoint', holding: h })}
                        onEntry={() => setModal({ type: 'entry', holding: h })}
                                                undistributedLabel={s.hasAssets && !h.asset}
                      />
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          <div className="flex items-center gap-2 border-t border-border p-3">
            <Input value={newVehicle} onChange={(e) => setNewVehicle(e.target.value)} placeholder="Novo veículo (ex.: Trade Republic)…" onKeyDown={(e) => e.key === 'Enter' && addVehicle()} />
            <Button variant="soft" className="shrink-0 whitespace-nowrap" onClick={addVehicle} disabled={!newVehicle.trim()}>+ Veículo</Button>
          </div>
        </Card>
        <p className="mt-2 text-xs text-muted">
          Investido = débitos automáticos do Planeamento + saídas de baldes para o veículo (Movimentos) + depósitos que registares aqui.
          Para dividir um veículo em ativos, cria ativos e usa "Distribuir" (o dinheiro que ainda não atribuíste fica em "Saldo livre").
        </p>
      </section>

      <section>
        <SectionTitle
          right={
            <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
              <label className="flex items-center gap-2 text-xs text-muted">
                Veículo
                <Select value={vehicleSel} onChange={(e) => { setVSel(e.target.value); setASel('total') }} className="py-1.5 text-xs">
                  <option value="all">Todos</option>
                  {summaries.map((s) => <option key={s.vehicle.id} value={s.vehicle.id}>{s.vehicle.name}</option>)}
                </Select>
              </label>
              <label className="flex items-center gap-2 text-xs text-muted" title={!assetOptions.some((h) => h.asset) ? 'Escolhe um veículo com ativos' : undefined}>
                Ativo
                <Select value={assetSel} onChange={(e) => setASel(e.target.value)} disabled={!assetOptions.some((h) => h.asset)} className="py-1.5 text-xs">
                  <option value="total">Total</option>
                  {assetOptions.map((h) => <option key={h.key} value={h.key}>{h.asset ? h.name : 'Saldo livre'}</option>)}
                </Select>
              </label>
            </div>
          }
        >
          Investido vs. valor
        </SectionTitle>
        <Card>
          {valueSeries.length === 0 ? (
            <p className="text-sm text-muted">Ainda sem dados.</p>
          ) : (
            <>
              <ResponsiveContainer height={280}>
                <ComposedChart data={valueData} margin={{ top: 10, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="month" tick={axis} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={axis} axisLine={false} tickLine={false} tickFormatter={axisEUR} width={52}
                    domain={fitDomain(valueData.flatMap((d) => [d.investido, ...(d.valor !== null ? [d.valor] : [])]))}
                  />
                  <Tooltip content={<ChartTooltip format={fmtEUR} />} cursor={cursorStyle} isAnimationActive={false} />
                  <Legend content={<ChartLegend />} />
                  <Line type="monotone" dataKey="investido" name="Investido" stroke="var(--warn)" strokeWidth={2.5} dot={false} />
                  <Line
                    type="linear" dataKey="valor" name="Valor (estimado)" stroke="var(--accent-strong)" strokeWidth={2.5}
                    strokeDasharray="5 4"
                    dot={(p: { cx?: number; cy?: number; payload?: { checkpoint?: boolean }; index?: number }) =>
                      p.payload?.checkpoint
                        ? <circle key={p.index} cx={p.cx} cy={p.cy} r={5} fill="var(--accent-strong)" stroke="var(--surface)" strokeWidth={2} />
                        : <g key={p.index} />}
                  />
                </ComposedChart>
              </ResponsiveContainer>
              <p className="mt-2 text-[11px] text-muted">
                Os pontos cheios são checkpoints (valores reais que registaste). Entre eles o valor é uma estimativa: o ganho evolui em
                linha reta de um checkpoint para o seguinte, e depois do último fica constante. Antes do primeiro só há a linha do investido.
              </p>
            </>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle
          right={
            <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
              <label className="flex items-center gap-2 text-xs text-muted">
                Veículo
                <Select value={injVehicleSel} onChange={(e) => setInjVehicle(e.target.value)} className="py-1.5 text-xs">
                  <option value="all">Todos</option>
                  {injAll.map((v) => <option key={v.vehicleId} value={v.vehicleId}>{v.name}</option>)}
                </Select>
              </label>
              <label className="flex items-center gap-2 text-xs text-muted" title={injVehicleSel !== 'all' ? 'Com um veículo escolhido, as barras são os ativos desse veículo' : undefined}>
                Agrupar
                <Select value={injGroup} onChange={(e) => setInjGroup(e.target.value as 'vehicle' | 'asset')} disabled={injVehicleSel !== 'all'} className="py-1.5 text-xs">
                  <option value="vehicle">Por veículo</option>
                  <option value="asset">Por ativo (lado a lado)</option>
                </Select>
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted">
                <input type="checkbox" checked={injCumulative} onChange={(e) => setInjCumulative(e.target.checked)} />
                Acumulado
              </label>
              <Select value={injWindow} onChange={(e) => setInjWindow(e.target.value as '12' | '24' | 'all')} className="py-1.5 text-xs">
                <option value="12">12 meses</option>
                <option value="24">24 meses</option>
                <option value="all">Desde sempre</option>
              </Select>
            </div>
          }
        >
          Injetado
        </SectionTitle>
        <Card>
          {injBars.length === 0 ? (
            <p className="text-sm text-muted">Sem dinheiro injetado nesta janela.</p>
          ) : (
            <>
              <ResponsiveContainer height={280}>
                <ComposedChart data={injData} margin={{ top: 10, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="month" tick={axis} axisLine={false} tickLine={false} />
                  <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={compactEUR} width={44} />
                  <Tooltip content={<InjectedTooltip bars={injBars} total={injGroup === 'vehicle' || injVehicleSel !== 'all'} />} cursor={cursorStyle} isAnimationActive={false} />
                  <Legend content={<ChartLegend />} />
                  {injBars.map((b) => (
                    <Bar key={b.dk} dataKey={b.dk} name={b.name} stackId={b.stackId} fill={b.color} fillOpacity={b.opacity} maxBarSize={injGroup === 'asset' && injVehicleSel === 'all' ? 28 : 56} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
              <p className="mt-2 text-[11px] text-muted">
                {injCumulative ? 'Acumulado: tudo o que foi injetado até ao fim de cada mês (inclui meses anteriores à janela).' : 'Mensal: o que foi injetado em cada mês.'}
                {' '}Conta débitos automáticos dos planos aplicados, saídas de baldes marcadas com o veículo e depósitos/resgates externos; não conta saldos
                iniciais nem transferências entre ativos.
                {' '}"Saldo livre" é o dinheiro do veículo que ainda não atribuíste a um ativo (ex.: saldo na corretora); ao distribuíres, aparece um valor negativo aí
                no mês da distribuição e positivo no ativo.
                {injGroup === 'asset' && injVehicleSel === 'all' && ' Lado a lado: uma barra por veículo em cada mês, dividida pelos seus ativos.'}
              </p>
              <p className="mt-1 text-xs text-muted">
                {injCumulative ? 'Total acumulado no fim' : 'Total na janela'}: <span className="tnum font-semibold text-text">{fmtEUR(injTotal)}</span>
              </p>
            </>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle
          right={
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted">
              <input type="checkbox" checked={projContrib} onChange={(e) => setProjContrib(e.target.checked)} />
              Com entradas mensais
            </label>
          }
        >
          Projeção (rendimento esperado)
        </SectionTitle>
        <Card>
          <ul className="mb-4 list-disc space-y-0.5 pl-4 text-xs text-muted">
            <li><strong className="text-text">Taxa anual:</strong> rendimento que esperas (ex.: 3 = 3% ao ano), com juros compostos.</li>
            <li><strong className="text-text">Entrada/mês:</strong> por defeito a mediana dos últimos 6 meses (ignora meses atípicos); podes corrigi-la.</li>
            <li><strong className="text-text">Aumento anual:</strong> quanto a entrada sobe por ano (ex.: 3 = +3%). Com aumento, a seta mostra a entrada daqui a 1, 2, 5, 10 e 15 anos.</li>
            <li>Sem impostos nem comissões: é só uma ilustração. Fica guardado no ativo (ou no veículo, se não tiver ativos).</li>
          </ul>
          {projRows.length === 0 ? (
            <p className="text-sm text-muted">Ainda não há nenhum ativo com valor.</p>
          ) : (
            <table className="w-full text-sm [&_td]:py-1.5 [&_td]:pr-3 [&_th]:pb-2 [&_th]:pr-3 [&_td:last-child]:pr-0 [&_th:last-child]:pr-0">
              <thead>
                <tr className="text-left text-xs font-medium text-muted">
                  <th className="py-1">Ativo</th><th className="text-right">Hoje</th><th className="text-right">Taxa anual (%)</th>
                  <th className="text-right">Entrada/mês</th>
                  <th className="text-right" title="A entrada mensal sobe esta percentagem uma vez por ano">Aumento anual (%)</th>
                  <th className="text-right">5 anos</th><th className="text-right">10 anos</th><th className="text-right">20 anos</th>
                </tr>
              </thead>
              <tbody>
                {projRows.map((r) => {
                  const canExpand = projContrib && r.growth > 0 && r.monthly > 0
                  const expanded = canExpand && projOpen.has(r.h.key)
                  return (
                    <Fragment key={r.h.key}>
                      <tr className="border-t border-border">
                        <td className="py-1.5">
                          {canExpand ? (
                            <button
                              className="flex items-center gap-1.5 text-left"
                              onClick={() => setProjOpen((prev) => {
                                const next = new Set(prev)
                                if (next.has(r.h.key)) next.delete(r.h.key); else next.add(r.h.key)
                                return next
                              })}
                            >
                              <span className="text-xs text-muted">{expanded ? '▾' : '▸'}</span>
                              {vehicleName(summaries, r.h)}
                            </button>
                          ) : vehicleName(summaries, r.h)}
                        </td>
                        <td className="tnum text-right">{fmtEUR(r.h.value)}</td>
                        <td className="text-right"><RateInput key={`${r.h.key}:${r.h.expectedRate}`} holding={r.h} /></td>
                        <td className="text-right">
                          {projContrib ? <MonthlyInput key={`${r.h.key}:${r.h.monthlyContribution}`} holding={r.h} median={r.median} /> : <span className="text-muted">—</span>}
                        </td>
                        <td className="text-right">
                          {projContrib ? <GrowthInput key={`${r.h.key}:${r.h.contributionGrowth}`} holding={r.h} /> : <span className="text-muted">—</span>}
                        </td>
                        {[5, 10, 20].map((y) => (
                          <td key={y} className="tnum text-right">{r.active ? fmtEUR(projFuture(r, y)) : '—'}</td>
                        ))}
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={8} className="pb-2 pl-6 pt-0 text-xs text-muted">
                            Entrada mensal daqui a:{' '}
                            {[1, 2, 5, 10, 15].map((y, i) => (
                              <span key={y} className="tnum">
                                {i > 0 && ' · '}
                                {y} {y === 1 ? 'ano' : 'anos'}: <span className="font-semibold text-text">{fmtEUR(monthlyAfterYears(r.monthly, r.growth, y))}</span>
                              </span>
                            ))}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
                {projRows.some((r) => r.active) && (
                  <tr className="border-t border-border font-semibold">
                    <td className="py-1.5">Total</td>
                    <td className="tnum text-right">{fmtEUR(round2(projRows.filter((r) => r.active).reduce((a, r) => a + r.h.value, 0)))}</td><td /><td /><td />
                    {[5, 10, 20].map((y) => (
                      <td key={y} className="tnum text-right">{fmtEUR(round2(projRows.filter((r) => r.active).reduce((a, r) => a + projFuture(r, y), 0)))}</td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-[11px] text-muted">
            Linhas sem taxa nem entrada mensal ficam de fora do total. Sem taxa, só se somam as entradas (rendimento 0%).
          </p>
        </Card>
      </section>

      <InvestmentSimulator
        starts={projRows.map((r) => ({
          key: r.h.key, name: vehicleName(summaries, r.h), value: r.h.value,
          monthly: r.h.monthlyContribution ?? r.median, growth: r.h.contributionGrowth ?? 0, rate: r.h.expectedRate ?? 0,
        }))}
      />

      <InvestModals modal={modal} onClose={() => setModal(null)} summaries={summaries} />
    </div>
  )
}

// Tooltip do gráfico "Injetado": usa o nome de cada série (as chaves dos dados são ids).
function InjectedTooltip({ bars, total, ...rest }: { bars: { dk: string; name: string; color: string }[]; total: boolean; active?: boolean; payload?: { dataKey?: string | number; value?: number | string | null }[]; label?: string | number }) {
  const named = (rest.payload ?? []).filter((p) => typeof p.value === 'number' && Math.abs(p.value) > 0.004).map((p) => {
    const b = bars.find((x) => x.dk === p.dataKey)
    return { ...p, name: b?.name ?? String(p.dataKey), color: b?.color }
  })
  return <ChartTooltip format={fmtEUR} active={rest.active} label={rest.label} payload={named} total={total} />
}

// Ação de linha: texto discreto (sem caixa) que ganha cor e sublinhado ao passar o rato.
function RowAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg px-2 py-1 text-xs font-medium text-muted underline-offset-4 transition-colors hover:bg-accent-soft hover:text-accent-strong hover:underline"
    >
      {children}
    </button>
  )
}

function vehicleName(summaries: VehicleSummary[], h: Holding): string {
  const v = summaries.find((s) => s.vehicle.id === h.vehicleId)
  if (h.asset) return `${v?.vehicle.name ?? ''} › ${h.name}`
  // Sem ativo: o veículo inteiro, ou o "saldo livre" de um veículo com ativos.
  return v?.hasAssets ? `${v.vehicle.name} › Saldo livre` : (v?.vehicle.name ?? h.name)
}

// Taxa anual esperada: guardada no ativo, ou no veículo se a posição não for um ativo.
function RateInput({ holding: h, left }: { holding: Holding; left?: boolean }) {
  const data = useStore((s) => s.data)
  const put = useStore((s) => s.put)
  const [val, setVal] = useState(h.expectedRate !== undefined ? String(h.expectedRate) : '')
  const save = () => {
    const n = val.trim() === '' ? undefined : parseAmount(val)
    if (val.trim() !== '' && n === null) return
    if (h.asset) void put('investmentAssets', { ...h.asset, expectedRate: n ?? undefined })
    else {
      const v = data.investmentVehicles.find((x) => x.id === h.vehicleId)
      if (v) void put('investmentVehicles', { ...v, expectedRate: n ?? undefined })
    }
  }
  return (
    <div className={cx('w-20', !left && 'ml-auto')}>
      <Input value={val} onChange={(e) => setVal(e.target.value)} onBlur={save} inputMode="decimal" placeholder="ex.: 3" className={cx('py-1', !left && 'text-right')} />
    </div>
  )
}

// Entrada mensal assumida na projeção: vazio = mediana dos últimos 6 meses (mostrada como sugestão).
function MonthlyInput({ holding: h, median }: { holding: Holding; median: number }) {
  const data = useStore((s) => s.data)
  const put = useStore((s) => s.put)
  const [val, setVal] = useState(h.monthlyContribution !== undefined ? String(h.monthlyContribution) : '')
  const save = () => {
    const n = val.trim() === '' ? undefined : parseAmount(val)
    if (val.trim() !== "" && (n === null || n === undefined || n < 0)) return
    if (h.asset) void put('investmentAssets', { ...h.asset, monthlyContribution: n ?? undefined })
    else {
      const v = data.investmentVehicles.find((x) => x.id === h.vehicleId)
      if (v) void put('investmentVehicles', { ...v, monthlyContribution: n ?? undefined })
    }
  }
  return (
    <div className="ml-auto w-24" title="Vazio = mediana dos últimos 6 meses">
      <Input value={val} onChange={(e) => setVal(e.target.value)} onBlur={save} inputMode="decimal" placeholder={String(median)} className="py-1 text-right" />
    </div>
  )
}

// Aumento anual da entrada mensal (%) usado na projeção.
function GrowthInput({ holding: h }: { holding: Holding }) {
  const data = useStore((s) => s.data)
  const put = useStore((s) => s.put)
  const [val, setVal] = useState(h.contributionGrowth !== undefined ? String(h.contributionGrowth) : '')
  const save = () => {
    const n = val.trim() === '' ? undefined : parseAmount(val)
    if (val.trim() !== '' && (n === null || n === undefined || n < 0)) return
    if (h.asset) void put('investmentAssets', { ...h.asset, contributionGrowth: n ?? undefined })
    else {
      const v = data.investmentVehicles.find((x) => x.id === h.vehicleId)
      if (v) void put('investmentVehicles', { ...v, contributionGrowth: n ?? undefined })
    }
  }
  return (
    <div className="ml-auto w-20" title="A entrada mensal sobe esta percentagem uma vez por ano">
      <Input value={val} onChange={(e) => setVal(e.target.value)} onBlur={save} inputMode="decimal" placeholder="0" className="py-1 text-right" />
    </div>
  )
}

function HoldingRow({
  holding: h, indent, expanded, onToggle, onCheckpoint, onEntry, undistributedLabel,
}: {
  holding: Holding; indent: boolean; expanded: boolean; onToggle: () => void
  onCheckpoint: () => void; onEntry: () => void; undistributedLabel: boolean
}) {
  return (
    <>
      <tr className="border-b border-border">
        <td className={cx('py-2 pr-2', indent ? 'pl-9' : 'pl-4')}>
          <button className="flex items-center gap-1.5 text-left text-sm" onClick={onToggle}>
            <span className="text-xs text-muted">{expanded ? '▾' : '▸'}</span>
            {h.name}
            {h.asset?.kind && <span className="text-xs text-muted">· {h.asset.kind}</span>}
            {undistributedLabel && <Badge>saldo</Badge>}
            {h.asset?.archived && <Badge tone="warn">Arquivado</Badge>}
          </button>
        </td>
        <td className="tnum px-2 text-right" title={h.contributed < -0.004 ? 'Já resgataste mais do que investiste: a diferença é lucro realizado' : undefined}>{fmtEUR(Math.max(0, h.contributed))}</td>
        <td className="tnum px-2 text-right">{fmtEUR(h.value)}</td>
        <td className={cx('tnum px-2 text-right', gainTone(h.gain))}>{signed(h.gain)}</td>
        <td className={cx('tnum px-2 text-right', gainTone(h.gain))}>{h.pct !== null ? fmtPct(h.pct) : '—'}</td>
        <td className="px-2 text-xs text-muted"><CheckpointDate iso={h.lastCheckpoint} /></td>
        <td className="whitespace-nowrap px-4 text-right">
          <span className="inline-flex items-center gap-1">
            <RowAction onClick={onCheckpoint}>Checkpoint</RowAction>
            <RowAction onClick={onEntry}>Movimento</RowAction>
          </span>
        </td>
      </tr>
      {expanded && <HoldingDetail holding={h} />}
    </>
  )
}

function HoldingDetail({ holding: h }: { holding: Holding }) {
  const data = useStore((s) => s.data)
  const put = useStore((s) => s.put)
  const remove = useStore((s) => s.remove)

  const entries = data.assetEntries.filter((e) => (h.asset ? e.assetId === h.asset.id : e.vehicleId === h.vehicleId && !e.assetId))
  // Distribuições para ativos do mesmo veículo (saem do "saldo livre").
  const outgoing = h.asset ? [] : data.assetEntries.filter((e) => e.vehicleId === h.vehicleId && e.assetId && e.source === 'distribute')
  const items = [
    ...entries.map((e) => ({ id: e.id, date: e.date, kind: 'entry' as const, text: entryText(e.source, e.amount, e.note), amount: e.amount })),
    ...outgoing.map((e) => ({
      id: e.id, date: e.date, kind: 'entry' as const, amount: -e.amount,
      text: e.amount >= 0
        ? `Distribuído para ${data.investmentAssets.find((a) => a.id === e.assetId)?.name ?? 'ativo'}`
        : `Recebido de ${data.investmentAssets.find((a) => a.id === e.assetId)?.name ?? 'ativo'}`,
    })),
    ...h.checkpoints.map((c) => ({ id: c.id, date: c.date, kind: 'cp' as const, text: `Checkpoint${c.note ? ` — ${c.note}` : ''}`, amount: c.value })),
  ].sort((a, b) => b.date.localeCompare(a.date))
  const derived = h.flows.filter((f) => f.kind === 'auto' || f.kind === 'movement' || f.kind === 'initial')

  const asset = h.asset
  return (
    <tr className="border-b border-border bg-surface-2/30">
      <td colSpan={7} className="px-4 py-3">
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-xs">
          <div className="min-w-60">
            <div className="mb-1 font-semibold text-text">Taxa anual esperada (%)</div>
            <div className="flex items-center gap-2">
              <RateInput key={`${h.key}:${h.expectedRate}`} holding={h} left />
              <span className="text-muted">só para a projeção</span>
            </div>
            {h.withdrawn > 0.004 && (
              <div className="mt-3 text-muted">
                Depositado <span className="font-semibold text-text">{fmtEUR(h.deposited)}</span> · Resgatado{' '}
                <span className="font-semibold text-text">{fmtEUR(h.withdrawn)}</span>
                <div className="mt-0.5">Ganho = valor atual + resgatado − depositado.</div>
              </div>
            )}
            <div className="mt-3 text-muted">
              Rentabilidade anual estimada:{' '}
              <span className="font-semibold text-text">{h.annualized !== null ? fmtPct(h.annualized) : '—'}</span>
              <div className="mt-0.5">{h.annualized === null ? 'precisa de 2 checkpoints com pelo menos 3 meses de intervalo' : 'entre o primeiro e o último checkpoint, descontando entradas'}</div>
            </div>
            {(asset || h.vehicleId) && (
              <div className="mt-3">
                <div className="mb-1 font-semibold text-text">{asset ? 'Nome do ativo' : 'Nome do veículo'}</div>
                {asset ? (
                  <EditableName
                    value={asset.name}
                    className="text-sm"
                    onSave={(name) => void put('investmentAssets', { ...asset, name })}
                    validate={(name) =>
                      data.investmentAssets.some((a) => a.vehicleId === asset.vehicleId && a.id !== asset.id && normalizeDesc(a.name) === normalizeDesc(name))
                        ? { error: 'Já existe um ativo com este nome neste veículo.' }
                        : null}
                  />
                ) : (() => {
                  const vehicle = data.investmentVehicles.find((v) => v.id === h.vehicleId)
                  return vehicle ? (
                    <EditableName
                      value={vehicle.name}
                      className="text-sm"
                      onSave={(name) => void put('investmentVehicles', { ...vehicle, name })}
                      validate={(name) =>
                        data.investmentVehicles.some((v) => v.id !== vehicle.id && normalizeDesc(v.name) === normalizeDesc(name))
                          ? { error: 'Já existe um veículo com este nome.' }
                          : null}
                    />
                  ) : null
                })()}
              </div>
            )}
            {asset && (
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => void put('investmentAssets', { ...asset, archived: !asset.archived })}>
                  {asset.archived ? 'Reativar ativo' : 'Arquivar ativo'}
                </Button>
                {entries.length === 0 && h.checkpoints.length === 0 && (
                  <Button size="sm" variant="danger" onClick={() => { if (window.confirm(`Apagar o ativo "${asset.name}"? Não tem registos.`)) void remove('investmentAssets', asset.id) }}>Apagar</Button>
                )}
              </div>
            )}
          </div>
          <div className="min-w-72 flex-1">
            <div className="mb-1 font-semibold text-text">Registos</div>
            {items.length === 0 && derived.length === 0 && <p className="text-muted">Ainda sem registos.</p>}
            <ul className="flex flex-col gap-1">
              {items.map((it) => (
                <li key={it.kind + it.id} className="flex items-center justify-between gap-3">
                  <span className="text-muted">{fmtDate(it.date)} · {it.text}</span>
                  <span className="flex items-center gap-2">
                    <span className={cx('tnum font-medium', it.kind === 'cp' ? 'text-text' : gainTone(it.amount))}>
                      {it.kind === 'cp' ? fmtEUR(it.amount) : signed(it.amount)}
                    </span>
                    <button
                      className="rounded px-1 text-muted hover:text-negative"
                      aria-label="Apagar registo"
                      onClick={() => {
                        if (!window.confirm('Apagar este registo?')) return
                        if (it.kind === 'cp') { void remove('valueCheckpoints', it.id); return }
                        // Transferências: apaga as duas pernas; resgates: apaga também a entrada criada no balde.
                        const e = data.assetEntries.find((x) => x.id === it.id)
                        const legs = e?.transferGroupId ? data.assetEntries.filter((x) => x.transferGroupId === e.transferGroupId) : [e]
                        for (const l of legs) {
                          if (!l) continue
                          for (const m of data.savingsMovements.filter((x) => x.assetEntryId === l.id)) void remove('savingsMovements', m.id)
                          void remove('assetEntries', l.id)
                        }
                      }}
                    >
                      <Trash size={15} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            {derived.length > 0 && (
              <p className="mt-2 text-muted">
                Mais {derived.length} entrada{derived.length === 1 ? '' : 's'} automática{derived.length === 1 ? '' : 's'} (débitos do plano, movimentos
                {derived.some((f) => f.kind === 'initial') ? ', saldo inicial' : ''}) — total {fmtEUR(round2(derived.reduce((s, f) => s + f.amount, 0)))}.
              </p>
            )}
          </div>
        </div>
      </td>
    </tr>
  )
}

function entryText(source: string, amount: number, note?: string): string {
  const base = source === 'transfer' ? (amount < 0 ? 'Transferência (saída)' : 'Transferência (entrada)')
    : source === 'distribute' ? (amount < 0 ? 'Movido para o saldo livre' : 'Do saldo livre') : amount < 0 ? 'Resgate' : 'Depósito'
  return note ? `${base} — ${note}` : base
}

function InvestModals({
  modal, onClose, summaries,
}: { modal: ModalState; onClose: () => void; summaries: VehicleSummary[] }) {
  const put = useStore((s) => s.put)
  const data = useStore((s) => s.data)
  const [date, setDate] = useState(todayISO())
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [dir, setDir] = useState<'in' | 'out'>('in')
  const [pick, setPick] = useState('')
  const [name, setName] = useState('')
  const [kind, setKind] = useState('')
  const [error, setError] = useState('')

  // Reset sempre que abre um modal novo.
  const modalKey = modal ? `${modal.type}:${'holding' in modal ? modal.holding.key : 'summary' in modal ? modal.summary.vehicle.id : modal.vehicleId}` : ''
  const [lastKey, setLastKey] = useState('')
  if (modalKey !== lastKey) {
    setLastKey(modalKey)
    setDate(todayISO()); setAmount(''); setNote(''); setDir('in'); setError(''); setName(''); setKind('')
    setPick('')
    if (modal?.type === 'distribute') {
      // Com um só ativo: tudo pré-preenchido (ativo + valor em saldo livre).
      const targets = modal.summary.holdings.filter((h) => h.asset && !h.asset.archived)
      if (targets.length === 1) setPick(targets[0].key)
      if (modal.summary.undistributed > 0.004) setAmount(String(modal.summary.undistributed).replace('.', ','))
    }
  }

  if (!modal) return null
  const num = parseAmount(amount)
  const needAmount = (): number | null => {
    if (num === null || num <= 0) { setError('Indica um valor maior que 0.'); return null }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError('Escolhe uma data.'); return null }
    return num
  }
  const done = () => { onClose() }

  if (modal.type === 'checkpoint') {
    const h = modal.holding
    return (
      <Modal open onClose={onClose} title={`Checkpoint — ${vehicleName(summaries, h)}`}>
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted">Regista quanto vale agora (valor real da conta/ativo). Atual estimado: {fmtEUR(h.value)}.</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 block text-xs text-muted">Data</label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><label className="mb-1 block text-xs text-muted">Valor atual (€)</label><Input inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></div>
          </div>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)" />
          {error && <p className="text-sm text-negative">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={() => {
              if (num === null || num < 0) { setError('Indica o valor (0 ou mais).'); return }
              if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError('Escolhe uma data.'); return }
              void put('valueCheckpoints', { id: uid(), date, vehicleId: h.vehicleId, assetId: h.asset?.id, value: num, note: note.trim() || undefined })
              done()
            }}>Guardar</Button>
          </div>
        </div>
      </Modal>
    )
  }

  if (modal.type === 'entry') {
    const h = modal.holding
    const buckets = data.savingsBuckets.filter((b) => !b.archived).sort((a, b) => a.order - b.order)
    return (
      <Modal open onClose={onClose} title={`Movimento direto — ${vehicleName(summaries, h)}`}>
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted">
            Dinheiro que entra ou sai sem vir de um balde (ex.: depósito direto da conta à ordem na corretora, ou resgate para fora).
            O que vem do Planeamento ou de Movimentos já conta sozinho.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Tipo</label>
              <Select value={dir} onChange={(e) => setDir(e.target.value as 'in' | 'out')} className="w-full">
                <option value="in">Depósito</option><option value="out">Resgate</option>
              </Select>
            </div>
            <div><label className="mb-1 block text-xs text-muted">Data</label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><label className="mb-1 block text-xs text-muted">Valor (€)</label><Input inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></div>
          </div>
          {dir === 'out' && (
            <div>
              <label className="mb-1 block text-xs text-muted">Para onde vai o dinheiro?</label>
              <Select value={pick} onChange={(e) => setPick(e.target.value)} className="w-full">
                <option value="">— escolher —</option>
                {h.asset && <option value="__free">Saldo livre (fica no veículo)</option>}
                {buckets.map((b) => <option key={b.id} value={b.id}>Balde: {b.name}</option>)}
                <option value="__account">Conta à ordem (sem balde)</option>
              </Select>
              <p className="mt-1 text-xs text-muted">
                {h.asset && 'Saldo livre: o dinheiro sai do ativo mas fica no veículo (ex.: vendeste o ativo e o dinheiro ficou na corretora); depois podes usar "Distribuir" para o pôr noutro ativo. '}
                Com um balde, cria-se também a entrada desse valor nesse balde (em Movimentos), ligada a este resgate.
                Se o dinheiro vai para a conta à ordem, escolhe a última opção.
              </p>
            </div>
          )}
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)" />
          {error && <p className="text-sm text-negative">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={() => {
              const v = needAmount(); if (v === null) return
              if (dir === 'out' && !pick) { setError('Escolhe para onde vai o dinheiro (um balde ou a conta à ordem).'); return }
              const entryId = uid()
              if (dir === 'out' && pick === '__free' && h.asset) {
                // Ativo → saldo livre do mesmo veículo (registo de distribuição negativo).
                void put('assetEntries', {
                  id: entryId, date, vehicleId: h.vehicleId, assetId: h.asset.id, amount: -v,
                  source: 'distribute', note: note.trim() || undefined, createdAt: nowISO(),
                })
                done()
                return
              }
              void put('assetEntries', {
                id: entryId, date, vehicleId: h.vehicleId, assetId: h.asset?.id, amount: dir === 'in' ? v : -v,
                source: 'external', note: note.trim() || undefined, createdAt: nowISO(),
              })
              if (dir === 'out' && pick !== '__account' && pick !== '__free') {
                void put('savingsMovements', {
                  id: uid(), date, bucketId: pick, amount: v, description: `Resgate de ${vehicleName(summaries, h)}`,
                  assetEntryId: entryId, createdAt: nowISO(),
                })
              }
              done()
            }}>Guardar</Button>
          </div>
        </div>
      </Modal>
    )
  }

  if (modal.type === 'distribute') {
    const s = modal.summary
    const targets = s.holdings.filter((h) => h.asset && !h.asset.archived)
    return (
      <Modal open onClose={onClose} title={`Distribuir — ${s.vehicle.name}`}>
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted">Saldo livre: <strong className="text-text">{fmtEUR(s.undistributed)}</strong>. Escolhe quanto vai para cada ativo — o total do veículo não muda.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Ativo</label>
              <Select value={pick} onChange={(e) => setPick(e.target.value)} className="w-full">
                <option value="">— escolher —</option>
                {targets.map((h) => <option key={h.key} value={h.key}>{h.name}</option>)}
              </Select>
            </div>
            <div><label className="mb-1 block text-xs text-muted">Valor (€)</label><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></div>
          </div>
          <div><label className="mb-1 block text-xs text-muted">Data</label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          {error && <p className="text-sm text-negative">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={() => {
              if (!pick) { setError('Escolhe o ativo.'); return }
              const v = needAmount(); if (v === null) return
              if (v > s.undistributed + 0.004 && !window.confirm('É mais do que o valor em saldo livre. Continuar mesmo assim?')) return
              void put('assetEntries', { id: uid(), date, vehicleId: s.vehicle.id, assetId: pick, amount: v, source: 'distribute', createdAt: nowISO() })
              done()
            }}>Distribuir</Button>
          </div>
        </div>
      </Modal>
    )
  }

  // asset
  const vehicle = data.investmentVehicles.find((v) => v.id === modal.vehicleId)
  return (
    <Modal open onClose={onClose} title={`Novo ativo — ${vehicle?.name ?? ''}`}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted">Ex.: um ETF ou ação dentro da Degiro/XTB, ou a conta poupança e os certificados dentro da Amélia.</p>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex.: IWDA, Conta poupança)" />
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-full">
          <option value="">Tipo (opcional)</option>
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </Select>
        {error && <p className="text-sm text-negative">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => {
            if (!name.trim()) { setError('Dá um nome ao ativo.'); return }
            const order = data.investmentAssets.filter((a) => a.vehicleId === modal.vehicleId).length
            void put('investmentAssets', { id: uid(), vehicleId: modal.vehicleId, name: name.trim(), kind: kind || undefined, archived: false, order })
            done()
          }}>Criar</Button>
        </div>
      </div>
    </Modal>
  )
}

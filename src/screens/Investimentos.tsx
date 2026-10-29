import { Fragment, useMemo, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartLegend, ChartTooltip, compactEUR, cursorStyle } from '../components/ChartParts'
import { Badge, Button, Card, EmptyState, Input, MetricCard, Modal, SectionTitle, Select, cx } from '../components/ui'
import { round2 } from '../lib/calc/allocation'
import {
  accountingMonth, buildVehicleSummaries, holdingsSeries, injectedBreakdown, medianMonthlyInjection, projectWithContributions, seriesMonths, transferLegs,
  type Holding, type VehicleSummary,
} from '../lib/calc/investments'
import { addMonths, currentMonthKey, fmtDate, fmtEUR, fmtPct, monthRange, monthShort, nowISO, parseAmount, todayISO, uid } from '../lib/format'
import { useStore } from '../store/useStore'

const PALETTE = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#84cc16', '#f97316']
const axis = { fill: 'var(--muted)', fontSize: 12 }
const KINDS = ['ETF', 'Ação', 'Fundo', 'Conta poupança', 'Certificado de Aforro', 'Depósito a prazo', 'Outro']

type ModalState =
  | { type: 'checkpoint'; holding: Holding }
  | { type: 'entry'; holding: Holding }
  | { type: 'distribute'; summary: VehicleSummary }
  | { type: 'transfer'; from?: string }
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
      ⚠ {fmtDate(iso)}
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
  const calendar = currentMonthKey()
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

  const assetHoldings = allHoldings.filter((h) => h.asset)
  // Projeção: entrada mensal = a definida pelo utilizador, ou a mediana dos últimos 6 meses.
  const projRows = allHoldings.map((h) => {
    const median = medianMonthlyInjection(h, through)
    const monthly = projContrib ? (h.monthlyContribution ?? median) : 0
    const rate = h.expectedRate ?? 0
    const active = rate > 0 || monthly > 0
    return { h, median, monthly, rate, active }
  }).filter((r) => r.h.value > 0 || r.median > 0 || (r.h.monthlyContribution ?? 0) > 0)
  const projFuture = (r: { h: Holding; monthly: number; rate: number }, y: number) =>
    projectWithContributions(r.h.value, r.rate, y, r.monthly)

  return (
    <div className="fade-up flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black">Investimento</h1>
        <div className="flex gap-2">
          {assetHoldings.length >= 2 && <Button variant="soft" onClick={() => setModal({ type: 'transfer' })}>Transferir entre ativos</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Total investido" value={fmtEUR(totalContributed)} hint="o que meteste, líquido de saídas" />
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
        <SectionTitle>Veículos</SectionTitle>
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
                const open = openVehicles.has(s.vehicle.id) || !s.hasAssets
                const rows = s.hasAssets ? s.holdings : s.holdings
                return (
                  <Fragment key={s.vehicle.id}>
                    <tr className="border-b border-border bg-surface-2/40">
                      <td className="px-4 py-2.5 font-semibold">
                        <button className="flex items-center gap-1.5 text-left" onClick={() => s.hasAssets && toggleVehicle(s.vehicle.id)}>
                          {s.hasAssets && <span className="text-xs text-muted">{open ? '▾' : '▸'}</span>}
                          {s.vehicle.name}
                          {s.vehicle.archived && <Badge tone="warn">Arquivado</Badge>}
                        </button>
                      </td>
                      <td className="tnum px-2 text-right">{fmtEUR(s.contributed)}</td>
                      <td className="tnum px-2 text-right font-semibold">{fmtEUR(s.value)}</td>
                      <td className={cx('tnum px-2 text-right', gainTone(s.gain))}>{signed(s.gain)}</td>
                      <td className={cx('tnum px-2 text-right', gainTone(s.gain))}>{s.pct !== null ? fmtPct(s.pct) : '—'}</td>
                      <td className="px-2 text-xs text-muted"><CheckpointDate iso={s.lastCheckpoint} /></td>
                      <td className="whitespace-nowrap px-4 text-right">
                        <Button size="sm" variant="ghost" onClick={() => setModal({ type: 'asset', vehicleId: s.vehicle.id })}>+ Ativo</Button>
                        {s.hasAssets && Math.abs(s.undistributed) > 0.004 && (
                          <Button size="sm" variant="soft" onClick={() => setModal({ type: 'distribute', summary: s })}>Distribuir</Button>
                        )}
                      </td>
                    </tr>
                    {open && rows.map((h) => (
                      <HoldingRow
                        key={h.key}
                        holding={h}
                        indent={s.hasAssets}
                        expanded={detail === h.key}
                        onToggle={() => setDetail(detail === h.key ? null : h.key)}
                        onCheckpoint={() => setModal({ type: 'checkpoint', holding: h })}
                        onEntry={() => setModal({ type: 'entry', holding: h })}
                        onTransfer={h.asset ? () => setModal({ type: 'transfer', from: h.key }) : undefined}
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
            <Button size="sm" variant="soft" onClick={addVehicle} disabled={!newVehicle.trim()}>+ Veículo</Button>
          </div>
        </Card>
        <p className="mt-2 text-xs text-muted">
          Investido = débitos automáticos do Planeamento + saídas de baldes para o veículo (Movimentos) + entradas que registares aqui.
          Para dividir um veículo em ativos, cria ativos e usa "Distribuir".
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
                  {assetOptions.map((h) => <option key={h.key} value={h.key}>{h.asset ? h.name : 'Por distribuir'}</option>)}
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
                  <Tooltip content={<ChartTooltip />} cursor={cursorStyle} isAnimationActive={false} />
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
                {' '}Conta débitos automáticos dos planos aplicados, saídas de baldes marcadas com o veículo e entradas externas; não conta saldos
                iniciais nem transferências entre ativos.
                {' '}"Por distribuir" é o dinheiro do veículo que ainda não atribuíste a um ativo; ao distribuíres, aparece um valor negativo aí
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
          <p className="mb-3 text-xs text-muted">
            Como funciona: escreve a taxa anual que esperas de cada ativo (ex.: 3 para 3% ao ano). A app faz o valor atual crescer a essa taxa
            (juros compostos) e, com "Com entradas mensais" ligado, soma uma entrada por mês: por defeito a <strong className="text-text">mediana
            dos últimos 6 meses</strong> (ignora meses atípicos, como uma entrada grande única), que podes corrigir em "Entrada/mês".
            Mostra o valor daqui a 5, 10 e 20 anos, sem impostos nem comissões: é só uma ilustração. Fica guardado no ativo (ou no veículo, se não tiver ativos).
          </p>
          {projRows.length === 0 ? (
            <p className="text-sm text-muted">Ainda não há nenhum ativo com valor.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-muted">
                  <th className="py-1">Ativo</th><th className="text-right">Hoje</th><th className="px-2 text-right">Taxa anual (%)</th>
                  <th className="px-2 text-right">Entrada/mês</th>
                  <th className="text-right">5 anos</th><th className="text-right">10 anos</th><th className="text-right">20 anos</th>
                </tr>
              </thead>
              <tbody>
                {projRows.map((r) => (
                  <tr key={r.h.key} className="border-t border-border">
                    <td className="py-1.5">{vehicleName(summaries, r.h)}</td>
                    <td className="tnum text-right">{fmtEUR(r.h.value)}</td>
                    <td className="px-2 text-right"><RateInput key={`${r.h.key}:${r.h.expectedRate}`} holding={r.h} /></td>
                    <td className="px-2 text-right">
                      {projContrib ? <MonthlyInput key={`${r.h.key}:${r.h.monthlyContribution}`} holding={r.h} median={r.median} /> : <span className="text-muted">—</span>}
                    </td>
                    {[5, 10, 20].map((y) => (
                      <td key={y} className="tnum text-right">{r.active ? fmtEUR(projFuture(r, y)) : '—'}</td>
                    ))}
                  </tr>
                ))}
                {projRows.some((r) => r.active) && (
                  <tr className="border-t border-border font-semibold">
                    <td className="py-1.5">Total</td>
                    <td className="tnum text-right">{fmtEUR(round2(projRows.filter((r) => r.active).reduce((a, r) => a + r.h.value, 0)))}</td><td /><td />
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

      <InvestModals modal={modal} onClose={() => setModal(null)} summaries={summaries} assetHoldings={assetHoldings} />
    </div>
  )
}

// Tooltip do gráfico "Injetado": usa o nome de cada série (as chaves dos dados são ids).
function InjectedTooltip({ bars, total, ...rest }: { bars: { dk: string; name: string; color: string }[]; total: boolean; active?: boolean; payload?: { dataKey?: string | number; value?: number | string | null }[]; label?: string | number }) {
  const named = (rest.payload ?? []).filter((p) => typeof p.value === 'number' && Math.abs(p.value) > 0.004).map((p) => {
    const b = bars.find((x) => x.dk === p.dataKey)
    return { ...p, name: b?.name ?? String(p.dataKey), color: b?.color }
  })
  return <ChartTooltip active={rest.active} label={rest.label} payload={named} total={total} />
}

function vehicleName(summaries: VehicleSummary[], h: Holding): string {
  const v = summaries.find((s) => s.vehicle.id === h.vehicleId)
  if (h.asset) return `${v?.vehicle.name ?? ''} › ${h.name}`
  // Sem ativo: o veículo inteiro, ou o "por distribuir" de um veículo com ativos.
  return v?.hasAssets ? `${v.vehicle.name} › Por distribuir` : (v?.vehicle.name ?? h.name)
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
    <div className={cx('w-24', !left && 'ml-auto')}>
      <Input value={val} onChange={(e) => setVal(e.target.value)} onBlur={save} inputMode="decimal" placeholder="ex.: 3" className={left ? '' : 'text-right'} />
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
    <div className="ml-auto w-28" title="Vazio = mediana dos últimos 6 meses">
      <Input value={val} onChange={(e) => setVal(e.target.value)} onBlur={save} inputMode="decimal" placeholder={String(median)} className="text-right" />
    </div>
  )
}

function HoldingRow({
  holding: h, indent, expanded, onToggle, onCheckpoint, onEntry, onTransfer, undistributedLabel,
}: {
  holding: Holding; indent: boolean; expanded: boolean; onToggle: () => void
  onCheckpoint: () => void; onEntry: () => void; onTransfer?: () => void; undistributedLabel: boolean
}) {
  return (
    <>
      <tr className="border-b border-border">
        <td className={cx('py-2 pr-2', indent ? 'pl-9' : 'pl-4')}>
          <button className="flex items-center gap-1.5 text-left text-sm" onClick={onToggle}>
            <span className="text-xs text-muted">{expanded ? '▾' : '▸'}</span>
            {h.name}
            {h.asset?.kind && <span className="text-xs text-muted">· {h.asset.kind}</span>}
            {undistributedLabel && <Badge>sem ativo</Badge>}
            {h.asset?.archived && <Badge tone="warn">Arquivado</Badge>}
          </button>
        </td>
        <td className="tnum px-2 text-right">{fmtEUR(h.contributed)}</td>
        <td className="tnum px-2 text-right">{fmtEUR(h.value)}</td>
        <td className={cx('tnum px-2 text-right', gainTone(h.gain))}>{signed(h.gain)}</td>
        <td className={cx('tnum px-2 text-right', gainTone(h.gain))}>{h.pct !== null ? fmtPct(h.pct) : '—'}</td>
        <td className="px-2 text-xs text-muted"><CheckpointDate iso={h.lastCheckpoint} /></td>
        <td className="whitespace-nowrap px-4 text-right">
          <Button size="sm" variant="ghost" onClick={onCheckpoint}>+ Checkpoint</Button>
          <Button size="sm" variant="ghost" onClick={onEntry}>+ Entrada</Button>
          {onTransfer && <Button size="sm" variant="ghost" onClick={onTransfer}>Transferir</Button>}
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
  // Distribuições para ativos do mesmo veículo (saem do "por distribuir").
  const outgoing = h.asset ? [] : data.assetEntries.filter((e) => e.vehicleId === h.vehicleId && e.assetId && e.source === 'distribute')
  const items = [
    ...entries.map((e) => ({ id: e.id, date: e.date, kind: 'entry' as const, text: entryText(e.source, e.amount, e.note), amount: e.amount })),
    ...outgoing.map((e) => ({ id: e.id, date: e.date, kind: 'entry' as const, text: `Distribuído para ${data.investmentAssets.find((a) => a.id === e.assetId)?.name ?? 'ativo'}`, amount: -e.amount })),
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
            <div className="mt-3 text-muted">
              Rentabilidade anual estimada:{' '}
              <span className="font-semibold text-text">{h.annualized !== null ? fmtPct(h.annualized) : '—'}</span>
              <div className="mt-0.5">{h.annualized === null ? 'precisa de 2 checkpoints com pelo menos 3 meses de intervalo' : 'entre o primeiro e o último checkpoint, descontando entradas'}</div>
            </div>
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
                        // Transferências: apaga as duas pernas.
                        const e = data.assetEntries.find((x) => x.id === it.id)
                        const legs = e?.transferGroupId ? data.assetEntries.filter((x) => x.transferGroupId === e.transferGroupId) : [e]
                        for (const l of legs) if (l) void remove('assetEntries', l.id)
                      }}
                    >
                      🗑
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
    : source === 'distribute' ? 'Distribuído' : amount < 0 ? 'Saída' : 'Entrada'
  return note ? `${base} — ${note}` : base
}

function InvestModals({
  modal, onClose, summaries, assetHoldings,
}: { modal: ModalState; onClose: () => void; summaries: VehicleSummary[]; assetHoldings: Holding[] }) {
  const put = useStore((s) => s.put)
  const data = useStore((s) => s.data)
  const [date, setDate] = useState(todayISO())
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [dir, setDir] = useState<'in' | 'out'>('in')
  const [pick, setPick] = useState('')
  const [pick2, setPick2] = useState('')
  const [name, setName] = useState('')
  const [kind, setKind] = useState('')
  const [error, setError] = useState('')

  // Reset sempre que abre um modal novo.
  const modalKey = modal ? `${modal.type}:${'holding' in modal ? modal.holding.key : 'summary' in modal ? modal.summary.vehicle.id : 'vehicleId' in modal ? modal.vehicleId : modal.from ?? ''}` : ''
  const [lastKey, setLastKey] = useState('')
  if (modalKey !== lastKey) {
    setLastKey(modalKey)
    setDate(todayISO()); setAmount(''); setNote(''); setDir('in'); setError(''); setName(''); setKind('')
    setPick(modal?.type === 'transfer' ? (modal.from ?? '') : ''); setPick2('')
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
    return (
      <Modal open onClose={onClose} title={`Entrada / saída — ${vehicleName(summaries, h)}`}>
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted">
            Para dinheiro que entra ou sai e que a app ainda não conhece (ex.: depósito direto na corretora).
            O que vem do Planeamento ou de Movimentos já conta sozinho.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Tipo</label>
              <Select value={dir} onChange={(e) => setDir(e.target.value as 'in' | 'out')} className="w-full">
                <option value="in">Entrada</option><option value="out">Saída (resgate)</option>
              </Select>
            </div>
            <div><label className="mb-1 block text-xs text-muted">Data</label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><label className="mb-1 block text-xs text-muted">Valor (€)</label><Input inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></div>
          </div>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)" />
          {error && <p className="text-sm text-negative">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={() => {
              const v = needAmount(); if (v === null) return
              void put('assetEntries', {
                id: uid(), date, vehicleId: h.vehicleId, assetId: h.asset?.id, amount: dir === 'in' ? v : -v,
                source: 'external', note: note.trim() || undefined, createdAt: nowISO(),
              })
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
          <p className="text-xs text-muted">Por distribuir: <strong className="text-text">{fmtEUR(s.undistributed)}</strong>. Escolhe quanto vai para cada ativo — o total do veículo não muda.</p>
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
              if (v > s.undistributed + 0.004 && !window.confirm('É mais do que o valor por distribuir. Continuar mesmo assim?')) return
              void put('assetEntries', { id: uid(), date, vehicleId: s.vehicle.id, assetId: pick, amount: v, source: 'distribute', createdAt: nowISO() })
              done()
            }}>Distribuir</Button>
          </div>
        </div>
      </Modal>
    )
  }

  if (modal.type === 'transfer') {
    const label = (h: Holding) => vehicleName(summaries, h)
    return (
      <Modal open onClose={onClose} title="Transferir entre ativos">
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted">Move dinheiro de um ativo para outro (ex.: da conta poupança da Amélia para os certificados). Não conta como dinheiro novo.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">De</label>
              <Select value={pick} onChange={(e) => setPick(e.target.value)} className="w-full">
                <option value="">— escolher —</option>
                {assetHoldings.map((h) => <option key={h.key} value={h.key}>{label(h)} ({fmtEUR(h.contributed)})</option>)}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Para</label>
              <Select value={pick2} onChange={(e) => setPick2(e.target.value)} className="w-full">
                <option value="">— escolher —</option>
                {assetHoldings.filter((h) => h.key !== pick).map((h) => <option key={h.key} value={h.key}>{label(h)}</option>)}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 block text-xs text-muted">Valor (€)</label><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></div>
            <div><label className="mb-1 block text-xs text-muted">Data</label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          {error && <p className="text-sm text-negative">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={() => {
              const from = assetHoldings.find((h) => h.key === pick)
              const to = assetHoldings.find((h) => h.key === pick2)
              if (!from || !to || from.key === to.key) { setError('Escolhe dois ativos diferentes.'); return }
              const v = needAmount(); if (v === null) return
              const legs = transferLegs(
                { vehicleId: from.vehicleId, assetId: from.asset!.id }, { vehicleId: to.vehicleId, assetId: to.asset!.id },
                v, date, uid(), [uid(), uid()],
              )
              for (const l of legs) void put('assetEntries', { ...l, createdAt: nowISO() })
              done()
            }}>Transferir</Button>
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

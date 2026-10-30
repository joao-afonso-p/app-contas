import type { AssetEntry, DataSet, InvestmentAsset, InvestmentVehicle, MonthKey, ValueCheckpoint } from '../../types'
import { addMonths, calendarMonthOf as monthOfDate, monthRange } from '../format'
import { round2 } from './allocation'
import { activeAccountingMonth } from './balances'

// Investimentos: veículo → ativos (+ "saldo livre"). Tudo derivado dos dados
// já existentes (débitos automáticos do plano, saídas de baldes com veículo) e
// de três coleções novas (assetEntries, valueCheckpoints, investmentAssets).
//
// Valor atual de uma posição = último checkpoint + o que entrou/saiu depois
// dele. Sem checkpoint, assume-se o valor investido (ganho zero).

export interface Flow {
  date: string // YYYY-MM-DD
  amount: number
  kind: 'initial' | 'auto' | 'movement' | 'distribute' | 'external' | 'transfer'
  entryId?: string
}

export interface Holding {
  key: string // assetId, ou `pool:${vehicleId}`
  vehicleId: string
  asset?: InvestmentAsset // undefined = "saldo livre" / veículo sem ativos
  name: string
  flows: Flow[]
  checkpoints: ValueCheckpoint[] // por data crescente
  contributed: number
  value: number
  gain: number
  pct: number | null // ganho / investido
  lastCheckpoint?: string
  annualized: number | null // rentabilidade anual estimada (≥2 checkpoints, ≥90 dias)
  expectedRate?: number
  monthlyContribution?: number // definida pelo utilizador (projeção)
  contributionGrowth?: number // aumento anual da entrada (%)
  deposited: number // dinheiro que entrou de fora (planos, movimentos, depósitos), bruto
  withdrawn: number // dinheiro que saiu para fora (resgates), bruto
  hasData: boolean
}

export interface VehicleSummary {
  vehicle: InvestmentVehicle
  holdings: Holding[] // pool primeiro, depois ativos
  pool: Holding // "saldo livre" (ou o veículo inteiro, se não tem ativos) — mesmo oculto na tabela
  hasAssets: boolean
  contributed: number
  value: number
  gain: number
  pct: number | null
  undistributed: number // investido ainda em saldo livre (pode ser <0 se distribuíste a mais)
  lastCheckpoint?: string
}

const EARLY = '0000-00-00'

// Entradas derivadas do que a app já conhece: débitos automáticos dos planos
// aplicados + saídas de baldes marcadas com o veículo (+ saldo inicial).
export function derivedVehicleFlows(d: DataSet, vehicleId: string, throughMonth: MonthKey): Flow[] {
  const flows: Flow[] = []
  const v = d.investmentVehicles.find((x) => x.id === vehicleId)
  if (v?.initialBalance) flows.push({ date: EARLY, amount: v.initialBalance, kind: 'initial' })
  for (const plan of d.monthlyPlans) {
    if (plan.id > throughMonth || plan.closed === false) continue
    const value = plan.autoInvestments?.[vehicleId]
    if (value) flows.push({ date: `${plan.id}-01`, amount: value, kind: 'auto' })
  }
  for (const m of d.savingsMovements) {
    if (m.vehicleId !== vehicleId || monthOfDate(m.date) > throughMonth) continue
    flows.push({ date: m.date, amount: round2(-m.amount), kind: 'movement' })
  }
  return flows
}

const byDate = <T extends { date: string }>(a: T, b: T) => a.date.localeCompare(b.date)

export function valueAt(flows: Flow[], checkpoints: ValueCheckpoint[], date: string): { contributed: number; value: number; checkpoint?: ValueCheckpoint } {
  const upTo = flows.filter((f) => f.date <= date)
  const contributed = round2(upTo.reduce((s, f) => s + f.amount, 0))
  const cp = [...checkpoints].filter((c) => c.date <= date).sort(byDate).pop()
  if (!cp) return { contributed, value: contributed }
  const after = upTo.filter((f) => f.date > cp.date).reduce((s, f) => s + f.amount, 0)
  return { contributed, value: round2(cp.value + after), checkpoint: cp }
}

// Rentabilidade anual estimada entre o 1.º e o último checkpoint.
export function annualizedReturn(flows: Flow[], checkpoints: ValueCheckpoint[]): number | null {
  if (checkpoints.length < 2) return null
  const sorted = [...checkpoints].sort(byDate)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const days = (Date.parse(last.date) - Date.parse(first.date)) / 86_400_000
  if (days < 90) return null
  const between = flows.filter((f) => f.date > first.date && f.date <= last.date).reduce((s, f) => s + f.amount, 0)
  const gain = last.value - first.value - between
  const base = first.value + between / 2
  if (base <= 0) return null
  const ratio = 1 + gain / base
  if (ratio <= 0) return null
  return (Math.pow(ratio, 365 / days) - 1) * 100
}

function makeHolding(
  key: string, vehicleId: string, asset: InvestmentAsset | undefined, name: string,
  flows: Flow[], checkpoints: ValueCheckpoint[], expectedRate: number | undefined, today: string,
  monthlyContribution?: number,
  contributionGrowth?: number,
): Holding {
  const sortedFlows = [...flows].sort(byDate)
  const cps = [...checkpoints].sort(byDate)
  const { contributed, value } = valueAt(sortedFlows, cps, today)
  const gain = round2(value - contributed)
  return {
    key, vehicleId, asset, name, flows: sortedFlows, checkpoints: cps, contributed, value, gain,
    pct: contributed > 0.004 ? (gain / contributed) * 100 : null,
    lastCheckpoint: cps[cps.length - 1]?.date,
    annualized: annualizedReturn(sortedFlows, cps),
    expectedRate,
    monthlyContribution,
    contributionGrowth,
    deposited: round2(sortedFlows.filter((f) => f.amount > 0 && ['initial', 'auto', 'movement', 'external'].includes(f.kind)).reduce((a, f) => a + f.amount, 0)),
    withdrawn: round2(-sortedFlows.filter((f) => f.amount < 0 && ['movement', 'external'].includes(f.kind)).reduce((a, f) => a + f.amount, 0)),
    hasData: Math.abs(contributed) > 0.004 || Math.abs(value) > 0.004 || cps.length > 0,
  }
}

export function accountingMonth(d: DataSet, calendarMonth: MonthKey): MonthKey {
  return activeAccountingMonth(d.monthlyPlans, calendarMonth)
}

export function buildVehicleSummaries(d: DataSet, calendarMonth: MonthKey, today: string): VehicleSummary[] {
  const through = accountingMonth(d, calendarMonth)
  const out: VehicleSummary[] = []
  for (const vehicle of d.investmentVehicles.slice().sort((a, b) => a.order - b.order)) {
    const entries = d.assetEntries.filter((e) => e.vehicleId === vehicle.id)
    const assets = d.investmentAssets.filter((a) => a.vehicleId === vehicle.id).sort((a, b) => a.order - b.order)
    // Ativos que receberam entradas de outro veículo (transferência) também contam como deste? Não:
    // cada ativo pertence ao seu veículo; as pernas de transferência já têm o vehicleId certo.
    const entryFlow = (e: AssetEntry): Flow => ({ date: e.date, amount: e.amount, kind: e.source, entryId: e.id })

    const poolFlows: Flow[] = [
      ...derivedVehicleFlows(d, vehicle.id, through),
      ...entries.filter((e) => !e.assetId && e.source === 'external').map(entryFlow),
      // distribuir tira do "saldo livre" o mesmo que põe no ativo
      ...entries.filter((e) => e.assetId && e.source === 'distribute')
        .map((e) => ({ date: e.date, amount: -e.amount, kind: 'distribute' as const, entryId: e.id })),
    ]
    const poolCps = d.valueCheckpoints.filter((c) => c.vehicleId === vehicle.id && !c.assetId)
    const pool = makeHolding(
      `pool:${vehicle.id}`, vehicle.id, undefined, assets.length ? 'Saldo livre' : vehicle.name,
      poolFlows, poolCps, vehicle.expectedRate, today, vehicle.monthlyContribution, vehicle.contributionGrowth,
    )

    const assetHoldings = assets.map((a) => makeHolding(
      a.id, vehicle.id, a, a.name,
      entries.filter((e) => e.assetId === a.id).map(entryFlow),
      d.valueCheckpoints.filter((c) => c.assetId === a.id), a.expectedRate ?? vehicle.expectedRate, today, a.monthlyContribution, a.contributionGrowth,
    )).filter((h) => !h.asset!.archived || h.hasData)

    const holdings = [pool, ...assetHoldings].filter((h, i) => i > 0 || h.hasData || assets.length === 0)
    const contributed = round2(holdings.reduce((s, h) => s + h.contributed, 0))
    const value = round2(holdings.reduce((s, h) => s + h.value, 0))
    const lastCps = holdings.map((h) => h.lastCheckpoint).filter((x): x is string => Boolean(x)).sort()
    out.push({
      vehicle, holdings, pool, hasAssets: assets.length > 0, contributed, value, gain: round2(value - contributed),
      pct: contributed > 0.004 ? ((value - contributed) / contributed) * 100 : null,
      undistributed: pool.contributed,
      lastCheckpoint: lastCps[lastCps.length - 1],
    })
  }
  return out.filter((s) => !s.vehicle.archived || s.holdings.some((h) => h.hasData))
}

// ---------- Séries mensais ----------

export interface SeriesPoint { month: MonthKey; contributed: number; value: number; checkpoint: boolean }

function monthEnd(m: MonthKey): string {
  const [y, mo] = m.split('-').map(Number)
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  return `${m}-${String(last).padStart(2, '0')}`
}

const dayNum = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000

// Valor de uma posição numa data: investido (exato) + ganho. O ganho vem dos
// checkpoints: antes do 1.º é 0 (assume-se o investido), entre dois é
// interpolado em linha reta, e depois do último fica constante.
export function interpolatedValue(h: Pick<Holding, 'flows' | 'checkpoints'>, date: string): { contributed: number; value: number } {
  const contributed = round2(h.flows.filter((f) => f.date <= date).reduce((s, f) => s + f.amount, 0))
  const cps = h.checkpoints
  const gainAt = (cp: ValueCheckpoint) => cp.value - h.flows.filter((f) => f.date <= cp.date).reduce((s, f) => s + f.amount, 0)
  const before = [...cps].filter((c) => c.date <= date).pop()
  if (!before) return { contributed, value: contributed }
  const idx = cps.indexOf(before)
  const next = cps[idx + 1]
  let gain = gainAt(before)
  if (next) {
    const t = (dayNum(date) - dayNum(before.date)) / Math.max(1, dayNum(next.date) - dayNum(before.date))
    gain = gain + (gainAt(next) - gain) * Math.min(1, Math.max(0, t))
  }
  return { contributed, value: round2(contributed + gain) }
}

export function holdingsSeries(holdings: Holding[], months: MonthKey[]): SeriesPoint[] {
  return months.map((m) => {
    const end = monthEnd(m)
    let contributed = 0
    let value = 0
    let checkpoint = false
    for (const h of holdings) {
      const r = interpolatedValue(h, end)
      contributed += r.contributed
      value += r.value
      if (h.checkpoints.some((c) => monthOfDate(c.date) === m)) checkpoint = true
    }
    return { month: m, contributed: round2(contributed), value: round2(value), checkpoint }
  })
}

export function seriesMonths(holdings: Holding[], through: MonthKey, maxMonths = 36): MonthKey[] {
  const dates = holdings.flatMap((h) => [...h.flows.map((f) => f.date), ...h.checkpoints.map((c) => c.date)])
    .filter((x) => x > EARLY)
  const first = dates.length ? monthOfDate(dates.sort()[0]) : through
  const all = monthRange(first <= through ? first : through, through)
  return all.slice(-maxMonths)
}

// ---------- Projeção (sem novas entradas) ----------

export function projectValue(value: number, ratePct: number, years: number): number {
  return round2(value * Math.pow(1 + ratePct / 100, years))
}

// ---------- Injetado: por veículo e por ativo, mensal ou acumulado ----------

export interface InjectedSeries { key: string; name: string; perMonth: number[] }
export interface InjectedVehicle { vehicleId: string; name: string; series: InjectedSeries[]; perMonth: number[] }

// Para cada veículo: uma série por ativo + "Saldo livre" (ou o próprio veículo, se
// não tem ativos). Conta débitos automáticos, movimentos e entradas externas; ignora
// saldos iniciais e transferências. `cumulative` soma tudo até ao fim de cada mês
// (incluindo meses anteriores à janela). Distribuir tira do "saldo livre" o que
// põe no ativo, por isso o total do veículo não depende de como distribuíste.
export function injectedBreakdown(summaries: VehicleSummary[], months: MonthKey[], cumulative: boolean): InjectedVehicle[] {
  const monthly = (h: Holding): number[] => {
    const flows = h.flows.filter((f) => f.kind !== 'initial' && f.kind !== 'transfer')
    return months.map((m) => round2(flows
      .filter((f) => (cumulative ? monthOfDate(f.date) <= m : monthOfDate(f.date) === m))
      .reduce((s, f) => s + f.amount, 0)))
  }
  const out: InjectedVehicle[] = []
  for (const sm of summaries) {
    const series: InjectedSeries[] = [
      { key: sm.pool.key, name: sm.hasAssets ? 'Saldo livre' : sm.vehicle.name, perMonth: monthly(sm.pool) },
      ...sm.holdings.filter((h) => h.asset).map((h) => ({ key: h.key, name: h.name, perMonth: monthly(h) })),
    ].filter((x) => x.perMonth.some((v) => Math.abs(v) > 0.004))
    if (series.length === 0) continue
    out.push({
      vehicleId: sm.vehicle.id, name: sm.vehicle.name, series,
      perMonth: months.map((_, i) => round2(series.reduce((a, x) => a + x.perMonth[i], 0))),
    })
  }
  return out
}

// Mediana do que entrou por mês nos últimos `n` meses (até `through`), contando
// meses sem entrada como 0. Robusta a meses atípicos (ex.: uma entrada grande única).
export function medianMonthlyInjection(h: Holding, through: MonthKey, n = 6): number {
  const months = monthRange(addMonths(through, -(n - 1)), through)
  const flows = h.flows.filter((f) => f.kind !== 'initial' && f.kind !== 'transfer')
  const vals = months
    .map((m) => flows.filter((f) => monthOfDate(f.date) === m).reduce((s, f) => s + f.amount, 0))
    .sort((a, b) => a - b)
  const mid = Math.floor(vals.length / 2)
  const med = vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2
  return Math.max(0, round2(med))
}

// Valor futuro com juros compostos e uma entrada mensal (no fim de cada mês).
// `growthPct`: aumento anual da entrada, em degraus (sobe uma vez por ano).
export function projectWithContributions(value: number, ratePct: number, years: number, monthly: number, growthPct = 0): number {
  const rm = Math.pow(1 + ratePct / 100, 1 / 12) - 1
  let bal = value
  for (let i = 1; i <= Math.round(12 * years); i++) {
    const contrib = monthly * Math.pow(1 + growthPct / 100, Math.floor((i - 1) / 12))
    bal = bal * (1 + rm) + contrib
  }
  return round2(bal)
}

// Entrada mensal daqui a `years` anos, com um aumento anual em degraus.
export function monthlyAfterYears(monthly: number, growthPct: number, years: number): number {
  return round2(monthly * Math.pow(1 + growthPct / 100, years))
}

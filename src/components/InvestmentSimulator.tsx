import { useMemo, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtEURWhole as fmtEUR, parseAmount } from '../lib/format'
import { finalPoint, requiredMonthly, simulate, type SimInput } from '../lib/calc/simulator'
import { ChartTooltip, compactEUR, cursorStyle } from './ChartParts'
import { Card, Input, SectionTitle, Select } from './ui'

export interface SimStart {
  key: string
  name: string
  value: number
  monthly: number
  growth: number
  rate: number
}

const axis = { fill: 'var(--muted)', fontSize: 12 }
const num = (s: string, fallback = 0): number => {
  const n = s.trim() === '' ? null : parseAmount(s)
  return n === null || !Number.isFinite(n) ? fallback : n
}
// Legenda própria: investido, base e o intervalo (tracejado) entre pessimista e otimista.
function SimLegend() {
  return (
    <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-muted">
      <li className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded" style={{ backgroundColor: 'var(--warn)' }} />Investido</li>
      <li className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded" style={{ backgroundColor: 'var(--accent-strong)' }} />Base</li>
      <li className="flex items-center gap-1.5">
        <span className="h-3 w-5 rounded-sm border-y-2 border-dashed" style={{ borderColor: 'var(--accent-strong)', backgroundColor: 'color-mix(in srgb, var(--accent-strong) 12%, transparent)' }} />
        Intervalo (entre pessimista e otimista)
      </li>
    </ul>
  )
}

const str = (n: number) => String(n).replace('.', ',')

// Sandbox "e se…": não guarda nada. Três cenários (taxa − e + a variação escolhida),
// entrada necessária para um objetivo, e opcionalmente inflação e imposto sobre ganhos.
export function InvestmentSimulator({ starts }: { starts: SimStart[] }) {
  const [initial, setInitial] = useState('1000')
  const [monthly, setMonthly] = useState('100')
  const [growth, setGrowth] = useState('0')
  const [rate, setRate] = useState('5')
  const [years, setYears] = useState('20')
  const [spread, setSpread] = useState('2')
  const [target, setTarget] = useState('')
  const [useInflation, setUseInflation] = useState(false)
  const [inflation, setInflation] = useState('2')
  const [tax, setTax] = useState('28')
  const [start, setStart] = useState('')

  const pick = (key: string) => {
    setStart(key)
    const s = starts.find((x) => x.key === key)
    if (!s) return
    setInitial(str(Math.round(s.value * 100) / 100))
    setMonthly(str(s.monthly))
    setGrowth(str(s.growth))
    setRate(str(s.rate))
  }

  const baseRate = num(rate)
  const sp = Math.max(0, num(spread, 2))
  const horizon = Math.min(60, Math.max(1, Math.round(num(years, 20))))
  const input: SimInput = {
    initial: Math.max(0, num(initial)),
    monthly: Math.max(0, num(monthly)),
    growthPct: Math.max(0, num(growth)),
    years: horizon,
    inflationPct: useInflation ? Math.max(0, num(inflation, 2)) : 0,
    taxPct: Math.min(100, Math.max(0, num(tax, 28))),
  }
  const targetValue = num(target)

  const scenarios = useMemo(() => {
    const rates = { low: baseRate - sp, base: baseRate, high: baseRate + sp }
    const gross = { ...input, taxPct: 0 }
    const run = (r: number) => ({ gross: simulate(gross, r), net: simulate(input, r) })
    return { rates, lo: run(rates.low), ba: run(rates.base), hi: run(rates.high) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, monthly, growth, years, inflation, tax, useInflation, rate, spread])

  // O gráfico e os valores principais são brutos (antes de imposto); o líquido aparece por baixo.
  const chartData = scenarios.ba.gross.map((p, i) => ({
    year: `Ano ${p.year}`,
    investido: p.invested,
    pessimista: scenarios.lo.gross[i].value,
    base: p.value,
    otimista: scenarios.hi.gross[i].value,
    band: [scenarios.lo.gross[i].value, scenarios.hi.gross[i].value] as [number, number],
  }))

  const fin = (sc: { gross: ReturnType<typeof simulate>; net: ReturnType<typeof simulate> }) => ({
    gross: finalPoint(sc.gross),
    net: finalPoint(sc.net),
  })
  const fLo = fin(scenarios.lo)
  const fBa = fin(scenarios.ba)
  const fHi = fin(scenarios.hi)

  const needed = useMemo(() => {
    if (targetValue <= 0) return null
    return {
      low: requiredMonthly(input, scenarios.rates.low, targetValue),
      base: requiredMonthly(input, scenarios.rates.base, targetValue),
      high: requiredMonthly(input, scenarios.rates.high, targetValue),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetValue, initial, growth, years, inflation, tax, useInflation, rate, spread])

  const taxPct = input.taxPct
  const tile = (label: string, r: number, p: { gross: typeof fBa.gross; net: typeof fBa.net }) => (
    <Card className="min-w-0">
      <div className="text-xs font-medium text-muted">{label} ({r.toLocaleString('pt-PT', { maximumFractionDigits: 2 })}%/ano)</div>
      <div className="tnum mt-1 truncate text-2xl font-bold text-text">{fmtEUR(p.gross.value)}</div>
      <div className="tnum mt-1 text-sm font-semibold text-accent-strong">
        líquido de imposto ({taxPct.toLocaleString('pt-PT', { maximumFractionDigits: 2 })}%): {fmtEUR(p.net.value)}
      </div>
      <div className="mt-1 text-xs text-muted">
        metes {fmtEUR(p.gross.invested)} · ganho líquido {p.net.gain >= 0 ? '+' : '−'}{fmtEUR(Math.abs(p.net.gain))}
      </div>
    </Card>
  )
  const neededText = (v: number | null | undefined) => (v === undefined || v === null ? 'inalcançável' : v === 0 ? 'já chegas sem entradas' : `${fmtEUR(v)}/mês`)

  const field = (label: string, value: string, set: (v: string) => void, suffixText?: string) => (
    <div>
      <label className="mb-1 block text-xs text-muted">{label}</label>
      <div className="flex items-center gap-1.5">
        <Input value={value} onChange={(e) => set(e.target.value)} inputMode="decimal" className="py-1.5 text-right" />
        {suffixText && <span className="text-xs text-muted">{suffixText}</span>}
      </div>
    </div>
  )

  return (
    <section>
      <SectionTitle>Simulador (e se…?)</SectionTitle>
      <Card>
        <p className="mb-3 text-xs text-muted">
          Brinca com números: nada do que escreves aqui é guardado nem altera os teus dados. Mostra três cenários (taxa mais baixa, a tua,
          e mais alta) porque rendimentos constantes são uma simplificação.
        </p>

        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
          Começar a partir de
          <Select value={start} onChange={(e) => pick(e.target.value)} className="py-1.5 text-xs">
            <option value="">Do zero (valores livres)</option>
            {starts.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {field('Capital inicial', initial, setInitial, '€')}
          {field('Entrada mensal', monthly, setMonthly, '€')}
          {field('Aumento anual da entrada', growth, setGrowth, '%')}
          {field('Taxa anual esperada', rate, setRate, '%')}
          {field('Horizonte', years, setYears, 'anos')}
          {field('Variação dos cenários ±', spread, setSpread, 'pts')}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2 flex items-end gap-3">
            <label className="mb-2 flex cursor-pointer items-center gap-2 whitespace-nowrap text-xs font-medium text-muted">
              <input type="checkbox" checked={useInflation} onChange={(e) => setUseInflation(e.target.checked)} />
              Descontar inflação
            </label>
            <div className={useInflation ? '' : 'pointer-events-none opacity-50'}>
              {field('Inflação anual', inflation, setInflation, '%')}
            </div>
          </div>
          <div>{field('Imposto sobre os ganhos', tax, setTax, '%')}</div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          {tile('Pessimista', scenarios.rates.low, fLo)}
          {tile('Base', scenarios.rates.base, fBa)}
          {tile('Otimista', scenarios.rates.high, fHi)}
        </div>
        {useInflation && <p className="mt-1 text-[11px] text-muted">Valores em euros de hoje (já descontada a inflação).</p>}

        <div className="mt-4">
          <ResponsiveContainer height={300}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="year" tick={axis} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={compactEUR} width={52} />
              <Tooltip content={<ChartTooltip format={fmtEUR} />} cursor={cursorStyle} isAnimationActive={false} />
              <Legend content={<SimLegend />} />
              <Area type="monotone" dataKey="band" name="Intervalo" stroke="none" fill="var(--accent-strong)" fillOpacity={0.12} legendType="none" activeDot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="investido" name="Investido" stroke="var(--warn)" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="pessimista" name="Pessimista" stroke="var(--accent-strong)" strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} legendType="none" />
              <Line type="monotone" dataKey="base" name="Base" stroke="var(--accent-strong)" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="otimista" name="Otimista" stroke="var(--accent-strong)" strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} legendType="none" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 rounded-xl bg-surface-2 p-3">
          <div className="mb-2 text-sm font-semibold text-text">Quanto preciso de meter por mês?</div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-44">{field('Objetivo em ' + horizon + ' anos (líquido)', target, setTarget, '€')}</div>
            {needed && (
              <div className="text-xs text-muted">
                Pessimista: <strong className="text-text">{neededText(needed.low)}</strong> · Base: <strong className="text-text">{neededText(needed.base)}</strong> ·
                Otimista: <strong className="text-text">{neededText(needed.high)}</strong>
                <div className="mt-0.5">
                  Valor líquido de imposto{useInflation ? ' e em euros de hoje' : ''}, com o capital inicial e o aumento anual acima.
                  {input.monthly > 0 && needed.base !== null && needed.base !== undefined && (
                    <> Estás a simular {fmtEUR(input.monthly)}/mês ({input.monthly >= needed.base ? 'chega ao objetivo no cenário base' : `faltam ${fmtEUR(needed.base - input.monthly)}/mês no cenário base`}).</>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="mt-3 text-[11px] text-muted">
          Juros compostos mensais, entrada no fim de cada mês, aumento da entrada uma vez por ano. O imposto (editável; põe 0 se não
          quiseres) aplica-se aos ganhos no fim (em Portugal os ganhos de capital costumam ter 28%, mas depende do produto: confirma o teu caso). É só uma ilustração, não é
          aconselhamento financeiro.
        </p>
      </Card>
    </section>
  )
}

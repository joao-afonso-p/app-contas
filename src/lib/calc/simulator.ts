import { round2 } from './allocation'

// Simulador de investimento ("e se…"): não guarda nada, não toca nos dados.
// Juros compostos mensais (taxa anual efetiva convertida em mensal), entrada no
// fim de cada mês, com aumento anual da entrada em degraus.

export interface SimInput {
  initial: number // capital inicial (€)
  monthly: number // entrada mensal (€)
  growthPct: number // aumento anual da entrada (%)
  years: number
  inflationPct: number // 0 = sem ajuste por inflação
  taxPct: number // imposto sobre os ganhos no fim (0 = sem imposto)
}

export interface SimPoint {
  year: number
  invested: number // dinheiro posto (em euros de hoje, se houver inflação)
  value: number // valor líquido (após imposto e, se houver, em euros de hoje)
  gain: number // value − invested
}

const monthlyRate = (annualPct: number) => Math.pow(1 + annualPct / 100, 1 / 12) - 1

// Pontos no fim de cada ano (0..years). Devolve também o ponto final.
export function simulate(input: SimInput, ratePct: number): SimPoint[] {
  const rm = monthlyRate(ratePct)
  const infM = monthlyRate(input.inflationPct)
  let bal = input.initial
  let invested = input.initial // nominal
  let investedReal = input.initial // em euros de hoje (cada entrada deflacionada à sua data)
  const out: SimPoint[] = []
  const snapshot = (year: number, months: number) => {
    const deflator = Math.pow(1 + infM, months)
    const gain = bal - invested
    const net = invested + (gain > 0 ? gain * (1 - input.taxPct / 100) : gain)
    out.push({
      year,
      invested: round2(investedReal),
      value: round2(net / deflator),
      gain: round2(net / deflator - investedReal),
    })
  }
  snapshot(0, 0)
  const total = Math.round(12 * input.years)
  for (let i = 1; i <= total; i++) {
    const contrib = input.monthly * Math.pow(1 + input.growthPct / 100, Math.floor((i - 1) / 12))
    bal = bal * (1 + rm) + contrib
    invested += contrib
    investedReal += contrib / Math.pow(1 + infM, i)
    if (i % 12 === 0) snapshot(i / 12, i)
  }
  if (total % 12 !== 0) snapshot(total / 12, total)
  return out
}

export const finalPoint = (points: SimPoint[]): SimPoint => points[points.length - 1]

// Entrada mensal necessária para chegar a `target` (valor final, já com
// imposto/inflação) no horizonte indicado. Bisseção (o valor cresce com a entrada).
export function requiredMonthly(input: SimInput, ratePct: number, target: number): number | null {
  const valueFor = (m: number) => finalPoint(simulate({ ...input, monthly: m }, ratePct)).value
  if (valueFor(0) >= target) return 0
  let hi = Math.max(target / Math.max(1, input.years * 12), 1)
  for (let i = 0; i < 60 && valueFor(hi) < target; i++) hi *= 2
  if (valueFor(hi) < target) return null
  let lo = 0
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (valueFor(mid) < target) lo = mid
    else hi = mid
  }
  return Math.ceil(hi * 100) / 100 // arredonda para cima: garante que chega ao objetivo
}

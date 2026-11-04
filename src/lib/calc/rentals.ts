// Imóveis arrendados: lucro, margem e retornos. Lógica pura, sem acesso a dados nem UI.
//
// Definições (todas sobre o período escolhido; ver a página Imóveis):
//   lucro bruto   = renda − prestação − despesas fixas − despesas pontuais
//   imposto       = renda × taxa (em vigor em cada mês)
//   lucro líquido = lucro bruto − imposto
//   margem        = (renda − prestação − despesas fixas − imposto) ÷ renda   (sem pontuais)
//   retorno       = lucro líquido anualizado ÷ capital investido
//   rent. bruta   = renda anualizada ÷ valor do imóvel

import type { MonthKey, RentalPoint, RentalProperty } from '../../types'
import { addMonths, monthDiff, monthRange } from '../format'

const round2 = (n: number): number => Math.round(n * 100) / 100

// O ponto que está em vigor num mês: o último com `from` ≤ mês. Antes do primeiro, não há valor.
export function pointAt(points: RentalPoint[], month: MonthKey): RentalPoint | undefined {
  let best: RentalPoint | undefined
  for (const p of points) {
    if (p.from <= month && (!best || p.from >= best.from)) best = p
  }
  return best
}

export interface RentalMonth {
  month: MonthKey
  rent: number
  mortgage: number
  fixed: number
  oneOff: number
  tax: number
  principal: number // parte da prestação que amortiza capital (0 se não preenchida)
  gross: number
  net: number
}

// Só conta os meses a partir de `rentedFrom`. Meses sem série em vigor valem 0.
export function propertyMonths(p: RentalProperty, from: MonthKey, to: MonthKey): RentalMonth[] {
  const start = from > p.rentedFrom ? from : p.rentedFrom
  return monthRange(start, to).map((month) => {
    const rent = pointAt(p.rent, month)?.value ?? 0
    const mortgagePoint = pointAt(p.mortgage, month)
    const mortgage = mortgagePoint?.value ?? 0
    const fixed = pointAt(p.fixedCosts, month)?.value ?? 0
    const oneOff = p.oneOffs.filter((o) => o.month === month).reduce((acc, o) => acc + o.amount, 0)
    const rate = pointAt(p.taxRate, month)?.value ?? 0
    const tax = round2((rent * rate) / 100)
    const gross = round2(rent - mortgage - fixed - oneOff)
    return {
      month, rent, mortgage, fixed, oneOff, tax,
      principal: mortgagePoint?.principal ?? 0,
      gross,
      net: round2(gross - tax),
    }
  })
}

export interface RentalTotals {
  months: number
  rent: number
  mortgage: number
  fixed: number
  oneOff: number
  tax: number
  principal: number
  gross: number
  net: number
  // (renda − prestação − fixas − imposto) ÷ renda, sem pontuais. null sem renda.
  margin: number | null
}

export function sumMonths(rows: RentalMonth[]): RentalTotals {
  const t = { months: rows.length, rent: 0, mortgage: 0, fixed: 0, oneOff: 0, tax: 0, principal: 0, gross: 0, net: 0 }
  for (const r of rows) {
    t.rent += r.rent
    t.mortgage += r.mortgage
    t.fixed += r.fixed
    t.oneOff += r.oneOff
    t.tax += r.tax
    t.principal += r.principal
    t.gross += r.gross
    t.net += r.net
  }
  const out = {
    ...t,
    rent: round2(t.rent), mortgage: round2(t.mortgage), fixed: round2(t.fixed), oneOff: round2(t.oneOff),
    tax: round2(t.tax), principal: round2(t.principal), gross: round2(t.gross), net: round2(t.net),
  }
  return { ...out, margin: out.rent > 0 ? (out.rent - out.mortgage - out.fixed - out.tax) / out.rent : null }
}

// Valor de um período convertido para 12 meses.
export const annualize = (value: number, months: number): number => (months > 0 ? (value * 12) / months : 0)

export interface Ratio {
  value: number | null // fração (0,05 = 5 %); null se não há dados para calcular
  included: number // casas com o campo preenchido e com meses no período
  total: number // casas com meses no período
}

// Retorno sobre o capital investido. Só entram as casas com capital preenchido.
export function returnOnCapital(items: { property: RentalProperty; totals: RentalTotals }[]): Ratio {
  const active = items.filter((i) => i.totals.months > 0)
  const used = active.filter((i) => (i.property.capitalInvested ?? 0) > 0)
  const capital = used.reduce((acc, i) => acc + (i.property.capitalInvested ?? 0), 0)
  const annualNet = used.reduce((acc, i) => acc + annualize(i.totals.net, i.totals.months), 0)
  return { value: capital > 0 ? annualNet / capital : null, included: used.length, total: active.length }
}

// Rentabilidade bruta: renda anualizada ÷ valor do imóvel. Só entram as casas com valor preenchido.
export function grossYield(items: { property: RentalProperty; totals: RentalTotals }[]): Ratio {
  const active = items.filter((i) => i.totals.months > 0)
  const used = active.filter((i) => (i.property.propertyValue ?? 0) > 0)
  const value = used.reduce((acc, i) => acc + (i.property.propertyValue ?? 0), 0)
  const annualRent = used.reduce((acc, i) => acc + annualize(i.totals.rent, i.totals.months), 0)
  return { value: value > 0 ? annualRent / value : null, included: used.length, total: active.length }
}

// ---------- Períodos ----------

export type RangePreset = 'last12' | 'year' | 'all'

export function rangeFor(preset: RangePreset, current: MonthKey, properties: RentalProperty[]): { from: MonthKey; to: MonthKey } {
  if (preset === 'year') return { from: `${current.slice(0, 4)}-01`, to: current }
  if (preset === 'all') {
    const first = properties.map((p) => p.rentedFrom).sort()[0] ?? current
    return { from: first, to: current }
  }
  return { from: addMonths(current, -11), to: current }
}

export type GroupBy = 'month' | 'quarter' | 'year'

export interface RentalGroup {
  key: string
  label: string
  totals: RentalTotals
}

const quarterOf = (month: MonthKey): number => Math.floor((Number(month.slice(5, 7)) - 1) / 3) + 1

// Agrupa as linhas mensais (já somadas entre casas, se for o caso) por mês, trimestre ou ano.
export function groupRows(rows: RentalMonth[], by: GroupBy): RentalGroup[] {
  const groups = new Map<string, { label: string; rows: RentalMonth[] }>()
  for (const r of rows) {
    const key = by === 'month' ? r.month : by === 'quarter' ? `${r.month.slice(0, 4)}-T${quarterOf(r.month)}` : r.month.slice(0, 4)
    const label = by === 'month' ? r.month : by === 'quarter' ? `T${quarterOf(r.month)} ${r.month.slice(0, 4)}` : r.month.slice(0, 4)
    const g = groups.get(key)
    if (g) g.rows.push(r)
    else groups.set(key, { label, rows: [r] })
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, g]) => ({ key, label: g.label, totals: sumMonths(g.rows) }))
}

// Soma as linhas mensais de várias casas, mês a mês ("todas as casas").
export function combineMonths(perProperty: RentalMonth[][]): RentalMonth[] {
  const byMonth = new Map<MonthKey, RentalMonth>()
  for (const rows of perProperty) {
    for (const r of rows) {
      const cur = byMonth.get(r.month)
      if (!cur) {
        byMonth.set(r.month, { ...r })
      } else {
        byMonth.set(r.month, {
          month: r.month,
          rent: round2(cur.rent + r.rent),
          mortgage: round2(cur.mortgage + r.mortgage),
          fixed: round2(cur.fixed + r.fixed),
          oneOff: round2(cur.oneOff + r.oneOff),
          tax: round2(cur.tax + r.tax),
          principal: round2(cur.principal + r.principal),
          gross: round2(cur.gross + r.gross),
          net: round2(cur.net + r.net),
        })
      }
    }
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month))
}

export const monthsBetween = (from: MonthKey, to: MonthKey): number => Math.max(0, monthDiff(from, to) + 1)

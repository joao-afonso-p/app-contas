import type { MonthKey } from '../types'

const eur = new Intl.NumberFormat('pt-PT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const eur0 = new Intl.NumberFormat('pt-PT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

export function fmtEUR(value: number, compact = false): string {
  return compact ? eur0.format(value) : eur.format(value)
}

export function fmtPct(value: number): string {
  return `${new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 }).format(value)}%`
}

// Aceita "1.234,56", "1234.56", "1234", "-12,5"
export function parseAmount(raw: string): number | null {
  const s = raw.trim().replace(/€|\s/g, '')
  if (!s) return null
  let normalized = s
  if (s.includes(',')) normalized = s.replace(/\./g, '').replace(',', '.')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

// ---------- Meses ----------

export function monthKey(date: Date): MonthKey {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function currentMonthKey(): MonthKey {
  return monthKey(new Date())
}

export function addMonths(key: MonthKey, delta: number): MonthKey {
  const [y, m] = key.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

export function monthDiff(from: MonthKey, to: MonthKey): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

export function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  const n = monthDiff(from, to)
  if (n < 0) return []
  return Array.from({ length: n + 1 }, (_, i) => addMonths(from, i))
}

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MONTHS_PT_FULL = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export function monthLabel(key: MonthKey, full = false): string {
  const [y, m] = key.split('-').map(Number)
  const names = full ? MONTHS_PT_FULL : MONTHS_PT
  return `${names[m - 1]} ${y}`
}

export function monthShort(key: MonthKey): string {
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS_PT[m - 1]} ${String(y).slice(2)}`
}

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function nowISO(): string {
  return new Date().toISOString()
}

export function dayOfMonth(): number {
  return new Date().getDate()
}

export function monthOfDate(iso: string): MonthKey {
  return iso.slice(0, 7)
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export function generateSpaceCode(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  const group = () =>
    Array.from(crypto.getRandomValues(new Uint32Array(4)), (v) => chars[v % chars.length]).join('')
  return [group(), group(), group(), group()].join('-')
}

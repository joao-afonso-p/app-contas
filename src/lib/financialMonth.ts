// Mês financeiro: cada mês tem um dia de início (por defeito 1). Dias 16–31 contam
// do mês anterior (início a 28 → novembro começa a 28 de outubro); dias 1–15 contam
// do próprio mês (início a 5 → outubro vai de 5 de out a 4 de nov).
// Autocontido (sem imports da app) para poder ser usado por format.ts.

export type MonthKey = string // "YYYY-MM"

export interface MonthStartRule {
  from: MonthKey // vale a partir deste mês (inclusive)
  day: number // 1–31
}

export interface MonthStartConfig {
  rules: MonthStartRule[] // histórico de defaults
  overrides: Record<MonthKey, number> // dia próprio de um mês
}

export const EMPTY_MONTH_START: MonthStartConfig = { rules: [], overrides: {} }

const pad = (n: number) => String(n).padStart(2, '0')
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate() // m: 1–12
const addMonthKey = (key: MonthKey, delta: number): MonthKey => {
  const [y, m] = key.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`
}

// Dia de início por defeito de um mês (último default aplicável, ou 1), sem overrides.
export function defaultStartDay(cfg: MonthStartConfig, month: MonthKey): number {
  let day = 1
  let from = ''
  for (const r of cfg.rules) if (r.from <= month && r.from >= from) { day = r.day; from = r.from }
  return day
}

// Dia de início configurado para um mês (override > default).
export function startDayFor(cfg: MonthStartConfig, month: MonthKey): number {
  return cfg.overrides[month] || defaultStartDay(cfg, month)
}

// Data (ISO) em que o mês financeiro começa.
export function monthStartDate(cfg: MonthStartConfig, month: MonthKey): string {
  const day = startDayFor(cfg, month)
  const key = day >= 16 ? addMonthKey(month, -1) : month
  const [y, m] = key.split('-').map(Number)
  return `${key}-${pad(Math.min(day, daysIn(y, m)))}`
}

// Mês financeiro a que pertence uma data.
export function financialMonthOf(cfg: MonthStartConfig, iso: string): MonthKey {
  const date = iso.slice(0, 10)
  const cal = date.slice(0, 7)
  for (const m of [addMonthKey(cal, 1), cal, addMonthKey(cal, -1)]) {
    if (monthStartDate(cfg, m) <= date) return m
  }
  return addMonthKey(cal, -1)
}

const dayNumber = (iso: string): number => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

export const addDaysISO = (iso: string, delta: number): string => {
  const d = new Date((dayNumber(iso) + delta) * 86_400_000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

// Dias desde o início do mês (0 no primeiro dia) e dias que faltam até ao mês seguinte.
export const daysSinceMonthStart = (cfg: MonthStartConfig, month: MonthKey, todayIso: string): number =>
  dayNumber(todayIso) - dayNumber(monthStartDate(cfg, month))

export const daysUntilNextMonth = (cfg: MonthStartConfig, month: MonthKey, todayIso: string): number =>
  dayNumber(monthStartDate(cfg, addMonthKey(month, 1))) - dayNumber(todayIso)

// Fração do mês financeiro já decorrida (0–1), para o ritmo de gastos.
export function monthProgress(cfg: MonthStartConfig, month: MonthKey, todayIso: string): number {
  const start = dayNumber(monthStartDate(cfg, month))
  const end = dayNumber(monthStartDate(cfg, addMonthKey(month, 1)))
  if (end <= start) return 1
  return Math.min(1, Math.max(0, (dayNumber(todayIso) - start + 1) / (end - start)))
}

// "dia 3 de 31" do mês financeiro.
export function monthDayInfo(cfg: MonthStartConfig, month: MonthKey, todayIso: string): { day: number; total: number } {
  const start = dayNumber(monthStartDate(cfg, month))
  const end = dayNumber(monthStartDate(cfg, addMonthKey(month, 1)))
  return { day: Math.min(end - start, Math.max(1, dayNumber(todayIso) - start + 1)), total: end - start }
}

// Primeiro dia em que se pode aplicar o plano de `month`: 3 dias antes do início,
// mas nunca depois do dia 25 do mês anterior (regra antiga, para início = dia 1).
export function earliestApplyDate(cfg: MonthStartConfig, month: MonthKey): string {
  const [py, pm] = addMonthKey(month, -1).split('-').map(Number)
  const legacy = `${py}-${pad(pm)}-25`
  const threeBefore = addDaysISO(monthStartDate(cfg, month), -3)
  return threeBefore < legacy ? threeBefore : legacy
}

// ---------- Configuração ativa (preenchida pela store a partir dos metadados) ----------

let active: MonthStartConfig = EMPTY_MONTH_START
export const setMonthStartConfig = (cfg: MonthStartConfig): void => { active = cfg }
export const getMonthStartConfig = (): MonthStartConfig => active

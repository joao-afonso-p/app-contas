import type { Budget, CategoryRule, MonthKey, Transaction, TransactionCategory } from '../../types'
import { monthOfDate } from '../format'
import { round2 } from './allocation'

// Gasto real por categoria e por mês, derivado das transações.

export type SpendTable = Map<string, Map<MonthKey, number>> // categoryId -> month -> €

export function computeSpend(transactions: Transaction[], opts?: { excludeRepoePoupanca?: boolean }): SpendTable {
  const table: SpendTable = new Map()
  for (const t of transactions) {
    if (opts?.excludeRepoePoupanca && t.repoePoupanca) continue
    const month = monthOfDate(t.date)
    let row = table.get(t.categoryId)
    if (!row) table.set(t.categoryId, (row = new Map()))
    row.set(month, round2((row.get(month) || 0) + t.amount))
  }
  return table
}

export interface MonthTotals {
  total: number // todos os gastos
  semReposto: number // exclui os já repostos (tag verde "Reposto")
  semRepostoSemCasa: number // exclui repostos e a categoria "Casas"
}

export function monthTotals(transactions: Transaction[], casaCategoryId?: string): Map<MonthKey, MonthTotals> {
  const out = new Map<MonthKey, MonthTotals>()
  for (const t of transactions) {
    const month = monthOfDate(t.date)
    const cur = out.get(month) || { total: 0, semReposto: 0, semRepostoSemCasa: 0 }
    cur.total = round2(cur.total + t.amount)
    if (!t.reposto) {
      cur.semReposto = round2(cur.semReposto + t.amount)
      if (t.categoryId !== casaCategoryId) cur.semRepostoSemCasa = round2(cur.semRepostoSemCasa + t.amount)
    }
    out.set(month, cur)
  }
  return out
}

export type BudgetLevel = 'ok' | 'warn' | 'over'

export function budgetStatus(spent: number, cap: number): BudgetLevel {
  if (cap <= 0) return 'ok'
  if (spent > cap) return 'over'
  if (spent >= cap * 0.8) return 'warn'
  return 'ok'
}

export function capFor(budgets: Budget[], categoryId: string): number | undefined {
  return budgets.find((b) => b.id === categoryId)?.cap
}

// Gasto "sem categoria": categoryId vazio ou que já não corresponde a nenhuma
// categoria ativa (ex.: arquivada/órfã). Estes gastos somam nos totais mas
// desaparecem das vistas por-categoria — daí serem sinalizados na UI.
export function isUncategorized(t: Transaction, categories: TransactionCategory[]): boolean {
  return !t.categoryId || !categories.some((c) => c.id === t.categoryId)
}

// ---------- Categorização automática ----------

export function normalizeDesc(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, ' ')
    .trim()
}

export function suggestCategory(description: string, rules: CategoryRule[]): string | undefined {
  const desc = normalizeDesc(description)
  // regra mais específica (keyword mais longa) primeiro
  const sorted = [...rules].sort((a, b) => b.keyword.length - a.keyword.length)
  return sorted.find((r) => desc.includes(normalizeDesc(r.keyword)))?.categoryId
}

// Categoria indicada explicitamente no extrato: match exato pelo nome
// (ignorando maiúsculas/acentos) contra as categorias já existentes.
export function matchCategoryByName(text: string, categories: TransactionCategory[]): string | undefined {
  const norm = normalizeDesc(text)
  if (!norm) return undefined
  return categories.find((c) => normalizeDesc(c.name) === norm)?.id
}

// Parse de extrato bancário colado (formato fixo de 5 campos:
// data;nome;categoria;valor;descrição, separados por ; ou tab).
// Devolve linhas candidatas — o utilizador confirma/ajusta antes de importar.
export interface ParsedRow {
  date: string // YYYY-MM-DD
  nome: string
  categoriaText: string
  description: string
  amount: number // positivo = gasto
}

export function parseBankStatement(text: string): ParsedRow[] {
  const rows: ParsedRow[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // Formato posicional fixo de 5 campos: os primeiros 4 separadores são
    // delimitadores estruturais; tudo depois do 4º pertence à descrição,
    // preservando literalmente qualquer separador extra aí dentro.
    const separators = [...trimmed.matchAll(/\t|;/g)]
    if (separators.length < 4) continue
    const idx = separators.slice(0, 4).map((m) => m.index)
    const parts = [
      trimmed.slice(0, idx[0]),
      trimmed.slice(idx[0] + 1, idx[1]),
      trimmed.slice(idx[1] + 1, idx[2]),
      trimmed.slice(idx[2] + 1, idx[3]),
      trimmed.slice(idx[3] + 1),
    ].map((p) => p.trim())
    const [rawDate, rawNome, rawCategoria, rawValor, rawDescricao] = parts
    const date = parseDate(rawDate)
    if (!date) continue
    const amount = parseEuroNumber(rawValor)
    if (amount === null || amount === 0) continue
    // gastos: valores negativos no extrato tornam-se positivos aqui; ignora créditos
    if (amount < 0) {
      rows.push({ date, nome: rawNome, categoriaText: rawCategoria, description: rawDescricao, amount: round2(-amount) })
    }
  }
  return rows
}

function parseDate(s: string): string | null {
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

function parseEuroNumber(s: string): number | null {
  const cleaned = s.replace(/€|EUR|\s/g, '')
  if (!/^[-+]?[\d.,]+$/.test(cleaned)) return null
  let normalized = cleaned
  if (cleaned.includes(',')) normalized = cleaned.replace(/\./g, '').replace(',', '.')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

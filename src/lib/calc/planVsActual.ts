import type { MonthKey, Subcategory, Transaction } from '../../types'
import { addMonths, fmtEUR, monthOfDate } from '../format'
import { round2 } from './allocation'
import type { Group, Resolved } from './categories'

// Plano vs. real: liga o que foi planeado em Planeamento (despesas) ao que foi
// realmente gasto em Gastos, usando a mesma categoria principal.

export type PlanLevel = 'ok' | 'warn' | 'over' | 'unplanned' | 'none'

export interface SubRow {
  id: string // '' = sem subcategoria
  name: string
  spent: number
}

export interface CategoryRow {
  group: Group
  planned: number
  spent: number
  remaining: number // planned - spent (pode ser negativo)
  pct: number // spent / planned (0 se não há plano)
  level: PlanLevel
  // Despesa fixa/constante (manual ou detetada): sem "quase no limite", sem
  // alerta de ritmo e sem projeção — só fica vermelha se passar do plano.
  fixed: boolean
  // Só no mês em curso: gasto acima do ritmo esperado para o dia do mês.
  aheadOfPace: boolean
  projected?: number // projeção para o fim do mês ao ritmo atual
  subs: SubRow[]
  txs: Transaction[]
}

export interface OffPlanRow {
  group: Group
  spent: number
  subs: SubRow[]
  txs: Transaction[]
}

export interface MonthReport {
  month: MonthKey
  hasPlan: boolean
  rows: CategoryRow[] // despesas do planeamento (com plano ou com gasto)
  plannedTotal: number
  spentInPlan: number // gasto nas despesas do plano
  offPlan: OffPlanRow[] // gastos pagos pela poupança (baldes)
  offPlanTotal: number
  unassigned: Transaction[] // sem categoria do plano
  unassignedTotal: number
  // Dinheiro que realmente saiu do orçamento mensal (plano + sem categoria).
  spentCash: number
}

export function levelFor(spent: number, planned: number): PlanLevel {
  if (planned <= 0) return spent > 0 ? 'unplanned' : 'none'
  if (spent > planned) return 'over'
  if (spent >= planned * 0.8) return 'warn'
  return 'ok'
}

export interface ReportInput {
  month: MonthKey
  transactions: Transaction[]
  resolve: (t: Transaction) => Resolved
  groups: Group[] // todas (incl. arquivadas) — só as despesas com plano/gasto aparecem
  subcategories: Subcategory[]
  planExpenses?: Record<string, number> // ExpenseCategory.id -> €
  // Fração do mês já decorrida (0..1); só relevante para o mês em curso.
  elapsed?: number
  fixedIds?: Set<string> // despesas fixas (ver detectFixedGroups)
}

// ---------- Despesas fixas ----------

export type GroupMonthTotals = Map<string, Map<MonthKey, number>> // groupId -> mês -> €

export function groupMonthTotals(transactions: Transaction[], resolve: (t: Transaction) => Resolved): GroupMonthTotals {
  const out: GroupMonthTotals = new Map()
  for (const t of transactions) {
    const gid = resolve(t).groupId
    if (!gid) continue
    const row = out.get(gid) ?? new Map<MonthKey, number>()
    const m = monthOfDate(t.date)
    row.set(m, round2((row.get(m) ?? 0) + t.amount))
    out.set(gid, row)
  }
  return out
}

// Uma despesa é "fixa" se o utilizador a marcou como tal (Definições) ou, em
// automático, se nos 6 meses anteriores (com ≥3 meses de gasto) o valor quase
// não varia: desvio-padrão ≤ 10% da média. O mês em análise não conta.
export function detectFixedGroups(groups: Group[], totals: GroupMonthTotals, month: MonthKey): Set<string> {
  const out = new Set<string>()
  for (const g of groups) {
    if (g.kind !== 'expense') continue
    if (g.fixed === true) { out.add(g.id); continue }
    if (g.fixed === false) continue
    const row = totals.get(g.id)
    if (!row) continue
    const values: number[] = []
    for (let i = 1; i <= 6; i++) {
      const v = row.get(addMonths(month, -i)) ?? 0
      if (v > 0) values.push(v)
    }
    if (values.length < 3) continue
    const mean = values.reduce((s, v) => s + v, 0) / values.length
    const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length)
    if (sd / mean <= 0.1) out.add(g.id)
  }
  return out
}

export function buildMonthReport(input: ReportInput): MonthReport {
  const { month, transactions, resolve, groups, subcategories, planExpenses, elapsed, fixedIds } = input
  const hasPlan = Boolean(planExpenses && Object.values(planExpenses).some((v) => v > 0))

  const byGroup = new Map<string, Transaction[]>()
  const unassigned: Transaction[] = []
  for (const t of transactions) {
    if (monthOfDate(t.date) !== month) continue
    const r = resolve(t)
    if (!r.groupId) {
      unassigned.push(t)
      continue
    }
    const list = byGroup.get(r.groupId) ?? []
    list.push(t)
    byGroup.set(r.groupId, list)
  }

  const subName = new Map(subcategories.map((s) => [s.id, s.name]))
  const subRows = (txs: Transaction[]): SubRow[] => {
    const acc = new Map<string, number>()
    for (const t of txs) {
      const sid = resolve(t).subcategoryId ?? ''
      acc.set(sid, round2((acc.get(sid) ?? 0) + t.amount))
    }
    return [...acc.entries()]
      .map(([id, spent]) => ({ id, name: id ? (subName.get(id) ?? '—') : 'Sem subcategoria', spent }))
      .sort((a, b) => b.spent - a.spent)
  }
  const sum = (txs: Transaction[]) => round2(txs.reduce((s, t) => s + t.amount, 0))

  const rows: CategoryRow[] = []
  for (const g of groups) {
    if (g.kind !== 'expense') continue
    const planned = planExpenses?.[g.id] ?? 0
    const txs = byGroup.get(g.id) ?? []
    const spent = sum(txs)
    if (g.archived && planned <= 0 && spent <= 0) continue
    const fixed = fixedIds?.has(g.id) ?? false
    let level = levelFor(spent, planned)
    // Fixas: abaixo ou igual ao plano é normal — só ficam a vermelho se passarem.
    if (fixed && level === 'warn') level = 'ok'
    const pct = planned > 0 ? spent / planned : 0
    const aheadOfPace = !fixed && elapsed !== undefined && elapsed < 1 && planned > 0 && spent > 0
      && level !== 'over' && pct > elapsed + 0.15
    const projected = !fixed && elapsed !== undefined && elapsed < 1 && elapsed >= 0.2 && spent > 0
      ? round2(spent / elapsed) : undefined
    rows.push({
      group: g, planned, spent, remaining: round2(planned - spent), pct, level, fixed, aheadOfPace, projected,
      subs: subRows(txs), txs: [...txs].sort((a, b) => b.amount - a.amount),
    })
  }
  rows.sort((a, b) => a.group.order - b.group.order)

  const offPlan: OffPlanRow[] = []
  for (const g of groups) {
    if (g.kind !== 'bucket') continue
    const txs = byGroup.get(g.id)
    if (!txs?.length) continue
    offPlan.push({ group: g, spent: sum(txs), subs: subRows(txs), txs: [...txs].sort((a, b) => b.amount - a.amount) })
  }

  const spentInPlan = round2(rows.reduce((s, r) => s + r.spent, 0))
  const unassignedTotal = sum(unassigned)
  return {
    month,
    hasPlan,
    rows,
    plannedTotal: round2(rows.reduce((s, r) => s + r.planned, 0)),
    spentInPlan,
    offPlan,
    offPlanTotal: round2(offPlan.reduce((s, r) => s + r.spent, 0)),
    unassigned,
    unassignedTotal,
    spentCash: round2(spentInPlan + unassignedTotal),
  }
}

// Ordena as linhas por "mais problemático" primeiro: acima do plano (maior
// excesso), sem plano, perto do limite/ritmo alto, e só depois as restantes.
export function sortByAttention(rows: CategoryRow[]): CategoryRow[] {
  const weight = (r: CategoryRow) => {
    if (r.level === 'over') return 0
    if (r.level === 'unplanned') return 1
    if (r.aheadOfPace || r.level === 'warn') return 2
    return 3
  }
  return [...rows].sort((a, b) => {
    const w = weight(a) - weight(b)
    if (w !== 0) return w
    if (a.level === 'over' && b.level === 'over') return a.remaining - b.remaining // mais negativo primeiro
    return b.spent - a.spent
  })
}

// ---------- Alertas automáticos ----------

export interface Insight {
  kind: 'over' | 'recurring' | 'unassigned' | 'pace'
  groupId?: string
  text: string
}

// "Compras (210 €) e Restaurantes (90 €)": as subcategorias que mais pesam
// (≥25% do total), no máximo duas. Vazio se não houver subcategorias nomeadas.
function topSubsText(subs: SubRow[], total: number): string {
  if (total <= 0) return ''
  return subs
    .filter((s) => s.id !== '' && s.spent / total >= 0.25)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 2)
    .map((s) => `${s.name} (${fmtEUR(s.spent)})`)
    .join(' e ')
}

// `reports`: do mais antigo para o mais recente; o último é o mês em curso.
export function computeInsights(reports: MonthReport[]): Insight[] {
  if (reports.length === 0) return []
  const cur = reports[reports.length - 1]
  const out: Insight[] = []

  for (const r of sortByAttention(cur.rows)) {
    if (r.level === 'over') {
      out.push({
        kind: 'over', groupId: r.group.id,
        text: `${r.group.name}: ${fmtEUR(r.spent)} de ${fmtEUR(r.planned)} planeados (+${fmtEUR(-r.remaining)}).${
          topSubsText(r.subs, r.spent) ? ` Pesa mais: ${topSubsText(r.subs, r.spent)}.` : ''}`,
      })
    } else if (r.level === 'unplanned') {
      out.push({
        kind: 'over', groupId: r.group.id,
        text: `${r.group.name}: ${fmtEUR(r.spent)} gastos sem teres planeado nada para este mês.`,
      })
    } else if (r.aheadOfPace) {
      out.push({
        kind: 'pace', groupId: r.group.id,
        text: `${r.group.name}: já gastaste ${Math.round(r.pct * 100)}% do plano — acima do ritmo do mês.`,
      })
    }
  }

  // Acima do plano 3 meses seguidos (inclui o mês em curso).
  const last3 = reports.slice(-3)
  if (last3.length === 3 && last3.every((m) => m.hasPlan)) {
    for (const r of cur.rows) {
      const overAll = last3.every((m) => {
        const row = m.rows.find((x) => x.group.id === r.group.id)
        return row && row.planned > 0 && row.spent > row.planned
      })
      if (overAll) {
        // Subcategorias que mais pesaram nestes 3 meses.
        const acc = new Map<string, SubRow>()
        let total = 0
        for (const m of last3) {
          for (const sub of m.rows.find((x) => x.group.id === r.group.id)?.subs ?? []) {
            total += sub.spent
            const cur = acc.get(sub.id) ?? { ...sub, spent: 0 }
            cur.spent = round2(cur.spent + sub.spent)
            acc.set(sub.id, cur)
          }
        }
        const culprits = topSubsText([...acc.values()], total)
        out.push({
          kind: 'recurring', groupId: r.group.id,
          text: `${r.group.name} está acima do plano há 3 meses seguidos${culprits ? `, sobretudo por causa de ${culprits}` : ''} — talvez valha a pena rever o valor planeado.`,
        })
      }
    }
  }

  if (cur.unassigned.length > 0) {
    out.push({
      kind: 'unassigned',
      text: `${cur.unassigned.length} gasto${cur.unassigned.length === 1 ? '' : 's'} sem categoria do plano (${fmtEUR(cur.unassignedTotal)}) — não contam em nenhuma despesa planeada.`,
    })
  }
  return out
}

// ---------- Sugestão ao planear: despesas acima do plano vários meses seguidos ----------

export interface Overrun {
  groupId: string
  months: { month: MonthKey; planned: number; spent: number }[] // do mais antigo ao mais recente
  avgExcess: number // média do excesso por mês
}

// `reports`: os últimos N meses (do mais antigo ao mais recente). Devolve as
// despesas que ultrapassaram o plano em TODOS esses meses (só é preciso planeado > 0).
export function recurringOverruns(reports: MonthReport[], needed = 3): Map<string, Overrun> {
  const out = new Map<string, Overrun>()
  if (reports.length < needed) return out
  const last = reports.slice(-needed)
  const latest = last[last.length - 1]
  for (const r of latest.rows) {
    const rows = last.map((m) => m.rows.find((x) => x.group.id === r.group.id))
    if (!rows.every((x) => x && x.planned > 0 && x.spent > x.planned)) continue
    const months = rows.map((x, i) => ({ month: last[i].month, planned: x!.planned, spent: x!.spent }))
    out.set(r.group.id, {
      groupId: r.group.id,
      months,
      avgExcess: round2(months.reduce((s, m) => s + (m.spent - m.planned), 0) / months.length),
    })
  }
  return out
}

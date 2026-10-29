import type {
  CategoryRule,
  DataSet,
  ExpenseCategory,
  SavingsBucket,
  Subcategory,
  Transaction,
  TransactionCategory,
} from '../../types'
import { normalizeDesc } from './budgets'

// Categoria principal de um gasto = despesa do planeamento ("expense") ou balde
// de poupança ("bucket", gasto pago pela poupança → fora do orçamento mensal).

export type GroupKind = 'expense' | 'bucket'

export interface Group {
  id: string
  name: string
  kind: GroupKind
  archived: boolean
  order: number
  fixed?: boolean // só despesas; undefined = automático
}

export interface Resolved {
  groupId?: string
  groupKind?: GroupKind
  subcategoryId?: string
}

type CatData = Pick<DataSet, 'expenseCategories' | 'savingsBuckets' | 'subcategories' | 'transactionCategories'>

export function allGroups(d: Pick<DataSet, 'expenseCategories' | 'savingsBuckets'>): Group[] {
  const expenses: Group[] = d.expenseCategories.map((c: ExpenseCategory) => ({
    id: c.id, name: c.name, kind: 'expense', archived: c.archived, order: c.order, fixed: c.fixed,
  }))
  const buckets: Group[] = d.savingsBuckets.map((b: SavingsBucket) => ({
    id: b.id, name: b.name, kind: 'bucket', archived: b.archived, order: b.order,
  }))
  return [...expenses, ...buckets]
}

// Só grupos ativos, despesas primeiro e baldes depois (cada um pela sua ordem).
export function activeGroups(d: Pick<DataSet, 'expenseCategories' | 'savingsBuckets'>): Group[] {
  const byOrder = (a: Group, b: Group) => a.order - b.order
  const groups = allGroups(d).filter((g) => !g.archived)
  return [
    ...groups.filter((g) => g.kind === 'expense').sort(byOrder),
    ...groups.filter((g) => g.kind === 'bucket').sort(byOrder),
  ]
}

export function subcategoriesOf(subs: Subcategory[], parentId: string, includeArchived = false): Subcategory[] {
  return subs
    .filter((s) => s.parentId === parentId && (includeArchived || !s.archived))
    .sort((a, b) => a.order - b.order)
}

// Cria a função que descobre a categoria principal/subcategoria de um gasto.
// Ordem:
//  1. campos novos (planCategoryId/subcategoryId) se o grupo ainda existe;
//  2. gasto antigo marcado "repor da poupança" → o balde fonte;
//  3. associação guardada na categoria antiga;
//  4. categoria antiga com nome igual a uma despesa/balde (associação implícita);
//  5. sem categoria do plano (por associar).
export function makeResolver(d: CatData): (t: Transaction) => Resolved {
  const groups = new Map(allGroups(d).map((g) => [g.id, g]))
  const subs = new Map(d.subcategories.map((s) => [s.id, s]))
  const legacy = new Map(d.transactionCategories.map((c: TransactionCategory) => [c.id, c]))
  const byName = new Map<string, Group>()
  for (const g of allGroups(d)) {
    const k = normalizeDesc(g.name)
    // despesas têm prioridade sobre baldes com o mesmo nome
    if (!byName.has(k) || g.kind === 'expense') byName.set(k, g)
  }

  const out = (group: Group | undefined, subId?: string): Resolved => {
    if (!group) return {}
    const sub = subId ? subs.get(subId) : undefined
    return {
      groupId: group.id,
      groupKind: group.kind,
      subcategoryId: sub && sub.parentId === group.id ? sub.id : undefined,
    }
  }

  return (t) => {
    if (t.planCategoryId && groups.has(t.planCategoryId)) return out(groups.get(t.planCategoryId), t.subcategoryId)
    if (t.repoePoupanca && t.fonteBucketId && groups.has(t.fonteBucketId)) return out(groups.get(t.fonteBucketId))
    const old = t.categoryId ? legacy.get(t.categoryId) : undefined
    if (old) {
      if (old.planCategoryId && groups.has(old.planCategoryId)) return out(groups.get(old.planCategoryId), old.subcategoryId)
      const implicit = byName.get(normalizeDesc(old.name))
      if (implicit) return out(implicit)
    }
    return {}
  }
}

export function isUnassigned(r: Resolved): boolean {
  return !r.groupId
}

// ---------- Opções de classificação (para IA / importação / regras) ----------

export interface CategoryOption {
  groupId: string
  subcategoryId?: string
  label: string // "Casa" ou "Casa / Eletricidade"
}

export function categoryOptions(d: CatData): CategoryOption[] {
  const out: CategoryOption[] = []
  for (const g of activeGroups(d)) {
    out.push({ groupId: g.id, label: g.name })
    for (const s of subcategoriesOf(d.subcategories, g.id)) {
      out.push({ groupId: g.id, subcategoryId: s.id, label: `${g.name} / ${s.name}` })
    }
  }
  return out
}

export function labelFor(r: Resolved, d: CatData): string {
  const group = allGroups(d).find((g) => g.id === r.groupId)
  if (!group) return ''
  const sub = r.subcategoryId ? d.subcategories.find((s) => s.id === r.subcategoryId) : undefined
  return sub ? `${group.name} / ${sub.name}` : group.name
}

// Texto livre (ex.: coluna "categoria" do extrato / resposta da IA) → opção.
// Match exato (sem maiúsculas/acentos) pelo rótulo completo, depois pelo nome
// da subcategoria, depois da categoria principal, e por fim por categorias
// antigas já associadas.
export function matchOptionByText(text: string, d: CatData): CategoryOption | undefined {
  const norm = normalizeDesc(text)
  if (!norm) return undefined
  const options = categoryOptions(d)
  const byLabel = options.find((o) => normalizeDesc(o.label) === norm)
  if (byLabel) return byLabel
  const subs = d.subcategories.filter((s) => !s.archived && normalizeDesc(s.name) === norm)
  if (subs.length === 1) {
    const g = allGroups(d).find((x) => x.id === subs[0].parentId && !x.archived)
    if (g) return { groupId: g.id, subcategoryId: subs[0].id, label: `${g.name} / ${subs[0].name}` }
  }
  const old = d.transactionCategories.find((c) => normalizeDesc(c.name) === norm)
  if (old?.planCategoryId) {
    const g = allGroups(d).find((x) => x.id === old.planCategoryId && !x.archived)
    if (g) {
      const sub = old.subcategoryId ? d.subcategories.find((s) => s.id === old.subcategoryId) : undefined
      return {
        groupId: g.id,
        subcategoryId: sub?.parentId === g.id ? sub.id : undefined,
        label: sub ? `${g.name} / ${sub.name}` : g.name,
      }
    }
  }
  return undefined
}

// Sugestão a partir de regras aprendidas (descrição → categoria).
export function suggestOption(description: string, rules: CategoryRule[], d: CatData): CategoryOption | undefined {
  const desc = normalizeDesc(description)
  const sorted = [...rules].sort((a, b) => b.keyword.length - a.keyword.length)
  const rule = sorted.find((r) => desc.includes(normalizeDesc(r.keyword)))
  if (!rule) return undefined
  const groups = allGroups(d)
  if (rule.planCategoryId) {
    const g = groups.find((x) => x.id === rule.planCategoryId && !x.archived)
    if (g) {
      const sub = rule.subcategoryId ? d.subcategories.find((s) => s.id === rule.subcategoryId) : undefined
      return {
        groupId: g.id,
        subcategoryId: sub?.parentId === g.id ? sub.id : undefined,
        label: sub ? `${g.name} / ${sub.name}` : g.name,
      }
    }
  }
  // regra antiga: passa pela categoria antiga
  const old = d.transactionCategories.find((c) => c.id === rule.categoryId)
  return old ? matchOptionByText(old.name, d) : undefined
}

// ---------- Migração: associar categorias antigas ----------

// Sugestão automática (só por nome) de a que categoria do plano pertence uma
// categoria antiga. Nunca escreve nada — só alimenta o ecrã de associação.
export function suggestGroupForLegacy(
  legacy: TransactionCategory,
  d: Pick<DataSet, 'expenseCategories' | 'savingsBuckets'>,
): Group | undefined {
  const n = normalizeDesc(legacy.name)
  if (!n) return undefined
  const groups = activeGroups(d)
  const exact = groups.find((g) => normalizeDesc(g.name) === n)
  if (exact) return exact
  return groups.find((g) => {
    const gn = normalizeDesc(g.name)
    return gn.length >= 4 && (n.includes(gn) || gn.includes(n))
  })
}

// Categorias antigas que ainda têm gastos por associar (nem associação
// explícita, nem implícita por nome).
export function legacyNeedingMapping(d: DataSet): { category: TransactionCategory; count: number; total: number }[] {
  const resolve = makeResolver(d)
  const acc = new Map<string, { count: number; total: number }>()
  for (const t of d.transactions) {
    if (t.planCategoryId) continue
    if (!isUnassigned(resolve(t))) continue
    if (!t.categoryId) continue
    const cur = acc.get(t.categoryId) ?? { count: 0, total: 0 }
    cur.count += 1
    cur.total += t.amount
    acc.set(t.categoryId, cur)
  }
  return d.transactionCategories
    .filter((c) => acc.has(c.id))
    .map((c) => ({ category: c, ...acc.get(c.id)! }))
    .sort((a, b) => b.total - a.total)
}

// ---------- Campos de categoria para gravar num gasto ----------

// Escolher um balde como categoria principal = gasto pago pela poupança: marca
// os campos legados (repoePoupanca/fonteBucketId/reposto) para continuarem
// coerentes com backups e versões antigas da app. A saída do balde é criada
// em useStore (saveTransaction/addTransactions).
export function txCategoryFields(
  d: Pick<DataSet, 'savingsBuckets'>,
  groupId: string | undefined,
  subcategoryId?: string,
): Pick<Transaction, 'planCategoryId' | 'subcategoryId' | 'repoePoupanca' | 'fonteBucketId' | 'reposto'> {
  const isBucket = Boolean(groupId && d.savingsBuckets.some((b) => b.id === groupId))
  return {
    planCategoryId: groupId || undefined,
    subcategoryId: groupId && subcategoryId ? subcategoryId : undefined,
    repoePoupanca: isBucket,
    fonteBucketId: isBucket ? groupId : undefined,
    reposto: isBucket,
  }
}

export function newSubcategory(
  subs: Subcategory[],
  parentId: string,
  name: string,
  id: string,
): Subcategory {
  return {
    id,
    parentId,
    name: name.trim(),
    archived: false,
    order: subs.filter((s) => s.parentId === parentId).length,
  }
}

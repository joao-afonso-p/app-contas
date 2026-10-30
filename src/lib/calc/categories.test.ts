import { describe, expect, it } from 'vitest'
import { emptyDataSet, type DataSet, type Transaction } from '../../types'
import { parseBackup, serializeBackup } from '../backup'
import {
  activeGroups, categoryOptions, legacyImplicitlyMappedTo, legacyNeedingMapping, makeResolver, matchOptionByText, suggestOption, txCategoryFields,
} from './categories'
import { buildMonthReport, computeInsights } from './planVsActual'

const tx = (over: Partial<Transaction>): Transaction => ({
  id: over.id ?? 't', date: '2026-10-05', categoryId: '', amount: 10, description: '', repoePoupanca: false, reposto: false, ...over,
})

function world(): DataSet {
  const d = emptyDataSet()
  d.expenseCategories = [
    { id: 'casa', name: 'Casa', archived: false, order: 0 },
    { id: 'lazer', name: 'Lazer', archived: false, order: 1 },
  ]
  d.savingsBuckets = [{ id: 'geral', name: 'Geral', kind: 'fixed', archived: false, order: 0 }]
  d.subcategories = [
    { id: 'luz', parentId: 'casa', name: 'Eletricidade', archived: false, order: 0 },
  ]
  d.transactionCategories = [
    { id: 'old-luz', name: 'Eletricidade', archived: false, order: 0, planCategoryId: 'casa', subcategoryId: 'luz' },
    { id: 'old-lazer', name: 'Lazer', archived: false, order: 1 }, // associação implícita por nome
    { id: 'old-x', name: 'Misc', archived: false, order: 2 }, // por associar
  ]
  return d
}

describe('resolver (categorias novas + antigas)', () => {
  const d = world()
  const resolve = makeResolver(d)

  it('usa os campos novos quando existem', () => {
    expect(resolve(tx({ planCategoryId: 'casa', subcategoryId: 'luz' }))).toMatchObject({ groupId: 'casa', groupKind: 'expense', subcategoryId: 'luz' })
  })
  it('ignora subcategoria que não pertence ao grupo', () => {
    expect(resolve(tx({ planCategoryId: 'lazer', subcategoryId: 'luz' })).subcategoryId).toBeUndefined()
  })
  it('lê gastos antigos pela associação guardada na categoria antiga', () => {
    expect(resolve(tx({ categoryId: 'old-luz' }))).toMatchObject({ groupId: 'casa', subcategoryId: 'luz' })
  })
  it('associa categorias antigas com o mesmo nome de uma despesa', () => {
    expect(resolve(tx({ categoryId: 'old-lazer' })).groupId).toBe('lazer')
  })
  it('gasto antigo "repor da poupança" conta como pago pelo balde', () => {
    expect(resolve(tx({ categoryId: 'old-x', repoePoupanca: true, fonteBucketId: 'geral' }))).toMatchObject({ groupId: 'geral', groupKind: 'bucket' })
  })
  it('categoria antiga por associar → sem categoria do plano (nada se perde)', () => {
    expect(resolve(tx({ categoryId: 'old-x' })).groupId).toBeUndefined()
    expect(resolve(tx({ categoryId: '' })).groupId).toBeUndefined()
  })
  it('lista categorias antigas por associar com totais', () => {
    d.transactions = [tx({ id: 'a', categoryId: 'old-x', amount: 30 }), tx({ id: 'b', categoryId: 'old-x', amount: 20 }), tx({ id: 'c', categoryId: 'old-lazer' })]
    const p = legacyNeedingMapping(d)
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ count: 2, total: 50 })
    d.transactions = []
  })
  it('txCategoryFields: balde = pago pela poupança; despesa = não', () => {
    expect(txCategoryFields(d, 'geral')).toMatchObject({ repoePoupanca: true, reposto: false, fonteBucketId: 'geral', planCategoryId: 'geral' })
    expect(txCategoryFields(d, 'casa', 'luz')).toMatchObject({ repoePoupanca: false, reposto: false, fonteBucketId: undefined, subcategoryId: 'luz' })
    expect(txCategoryFields(d, undefined)).toMatchObject({ planCategoryId: undefined, repoePoupanca: false })
  })
  it('opções e matching por texto', () => {
    expect(categoryOptions(d).map((o) => o.label)).toEqual(['Casa', 'Casa / Eletricidade', 'Lazer', 'Geral'])
    expect(matchOptionByText('eletricidade', d)).toMatchObject({ groupId: 'casa', subcategoryId: 'luz' })
    expect(matchOptionByText('casa / eletricidade', d)?.subcategoryId).toBe('luz')
    expect(activeGroups(d).map((g) => g.id)).toEqual(['casa', 'lazer', 'geral'])
  })
  it('regras antigas continuam a sugerir via categoria antiga associada', () => {
    const opt = suggestOption('EDP COMERCIAL', [{ id: 'r', keyword: 'edp', categoryId: 'old-luz' }], d)
    expect(opt).toMatchObject({ groupId: 'casa', subcategoryId: 'luz' })
  })
})

describe('plano vs real', () => {
  const d = world()
  const resolve = makeResolver(d)
  const txs = [
    tx({ id: '1', planCategoryId: 'casa', subcategoryId: 'luz', amount: 80 }),
    tx({ id: '2', planCategoryId: 'casa', amount: 50 }),
    tx({ id: '3', planCategoryId: 'lazer', amount: 120 }),
    tx({ id: '4', planCategoryId: 'geral', amount: 400, repoePoupanca: true, reposto: false, fonteBucketId: 'geral' }),
    tx({ id: '5', categoryId: 'old-x', amount: 15 }),
    tx({ id: '6', date: '2026-09-02', planCategoryId: 'lazer', amount: 999 }),
  ]
  const groups = [...d.expenseCategories.map((c) => ({ id: c.id, name: c.name, kind: 'expense' as const, archived: false, order: c.order })),
    { id: 'geral', name: 'Geral', kind: 'bucket' as const, archived: false, order: 0 }]
  const report = buildMonthReport({
    month: '2026-10', transactions: txs, resolve, groups, subcategories: d.subcategories,
    planExpenses: { casa: 200, lazer: 100 }, elapsed: 0.5,
  })

  it('compara o plano com o gasto por categoria', () => {
    const casa = report.rows.find((r) => r.group.id === 'casa')!
    const lazer = report.rows.find((r) => r.group.id === 'lazer')!
    expect(casa).toMatchObject({ planned: 200, spent: 130, remaining: 70, level: 'ok' })
    expect(casa.subs.map((s) => [s.name, s.spent])).toEqual([['Eletricidade', 80], ['Sem subcategoria', 50]])
    expect(lazer).toMatchObject({ spent: 120, level: 'over', remaining: -20 })
  })
  it('gastos pagos pela poupança ficam fora do orçamento', () => {
    expect(report.offPlanTotal).toBe(400)
    expect(report.spentInPlan).toBe(250)
    expect(report.unassignedTotal).toBe(15)
    expect(report.spentCash).toBe(265)
  })
  it('alertas: acima do plano e sem categoria', () => {
    const texts = computeInsights([report]).map((i) => i.kind)
    expect(texts).toContain('over')
    expect(texts).toContain('unassigned')
  })
})

describe('não perde dados', () => {
  it('backup preserva subcategorias e campos novos/antigos', () => {
    const d = world()
    d.transactions = [tx({ id: 'a', categoryId: 'old-luz', planCategoryId: 'casa', subcategoryId: 'luz' })]
    const back = parseBackup(serializeBackup(d))
    expect(back.subcategories).toEqual(d.subcategories)
    expect(back.transactions[0]).toMatchObject({ categoryId: 'old-luz', planCategoryId: 'casa' })
    expect(back.transactionCategories).toEqual(d.transactionCategories)
  })
  it('backup antigo (sem subcategorias) continua a abrir', () => {
    const old = JSON.stringify({ app: 'contas', version: 1, exportedAt: 'x', data: { transactions: [{ id: 't1', date: '2026-01-01', categoryId: 'c', amount: 5, description: '', repoePoupanca: false, reposto: false }] } })
    const back = parseBackup(old)
    expect(back.subcategories).toEqual([])
    expect(back.transactions).toHaveLength(1)
  })
})

import { detectFixedGroups, groupMonthTotals } from './planVsActual'

describe('despesas fixas', () => {
  const d = world()
  const resolve = makeResolver(d)
  const groups = [
    { id: 'casa', name: 'Casa', kind: 'expense' as const, archived: false, order: 0 },
    { id: 'lazer', name: 'Lazer', kind: 'expense' as const, archived: false, order: 1 },
  ]
  const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']
  const txs = [
    ...months.map((m, i) => tx({ id: `c${i}`, date: `${m}-02`, planCategoryId: 'casa', amount: 800 })),
    ...months.map((m, i) => tx({ id: `l${i}`, date: `${m}-10`, planCategoryId: 'lazer', amount: [40, 150, 90, 20, 200, 60][i] })),
  ]
  const totals = groupMonthTotals(txs, resolve)

  it('deteta pelo histórico: constante = fixa, oscilante = variável', () => {
    const fixed = detectFixedGroups(groups, totals, '2026-10')
    expect(fixed.has('casa')).toBe(true)
    expect(fixed.has('lazer')).toBe(false)
  })
  it('a escolha manual ganha à automática', () => {
    expect(detectFixedGroups([{ ...groups[1], fixed: true }], totals, '2026-10').has('lazer')).toBe(true)
    expect(detectFixedGroups([{ ...groups[0], fixed: false }], totals, '2026-10').has('casa')).toBe(false)
  })
  it('fixa: sem "quase no limite", sem ritmo/projeção; passa do plano = vermelho', () => {
    const cur = [tx({ id: 'x', date: '2026-10-02', planCategoryId: 'casa', amount: 800 }), tx({ id: 'y', date: '2026-10-03', planCategoryId: 'lazer', amount: 95 })]
    const base = { month: '2026-10', transactions: cur, resolve, subcategories: [], elapsed: 0.4 }
    const g = groups.map((x) => ({ ...x }))
    const r = buildMonthReport({ ...base, groups: g, planExpenses: { casa: 820, lazer: 100 }, fixedIds: new Set(['casa']) })
    const casa = r.rows.find((x) => x.group.id === 'casa')!
    const lazer = r.rows.find((x) => x.group.id === 'lazer')!
    expect(casa).toMatchObject({ fixed: true, level: 'ok', aheadOfPace: false, projected: undefined })
    expect(lazer.level).toBe('warn')
    expect(lazer.projected).toBeDefined()
    const over = buildMonthReport({ ...base, groups: g, planExpenses: { casa: 700, lazer: 100 }, fixedIds: new Set(['casa']) })
    expect(over.rows.find((x) => x.group.id === 'casa')!.level).toBe('over')
  })
})

describe('renomear sem perder gastos antigos', () => {
  it('categoria antiga ligada só pelo nome é identificada antes do rename', () => {
    const d = world()
    expect(legacyImplicitlyMappedTo(d, 'lazer').map((c) => c.id)).toEqual(['old-lazer'])
    // já tem associação explícita: não precisa de fixar
    expect(legacyImplicitlyMappedTo(d, 'casa').map((c) => c.id)).toEqual([])
  })

  it('depois de fixar a ligação, renomear não deixa os gastos sem categoria', () => {
    const d = world()
    const old = tx({ id: 'a', categoryId: 'old-lazer' })
    expect(makeResolver(d)(old).groupId).toBe('lazer')
    for (const c of legacyImplicitlyMappedTo(d, 'lazer')) c.planCategoryId = 'lazer'
    d.expenseCategories[1].name = 'Dia a dia'
    expect(makeResolver(d)(old).groupId).toBe('lazer')
  })
})

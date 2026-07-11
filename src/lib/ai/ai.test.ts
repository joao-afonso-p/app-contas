import { describe, expect, it } from 'vitest'
import { isUncategorized, parseBankStatement } from '../calc/budgets'
import { buildStatementHistory, rowsToStatementText, type ExtractedRow } from './openai'
import type { Transaction, TransactionCategory } from '../../types'

const cat = (id: string, name: string, order = 0): TransactionCategory => ({ id, name, archived: false, order })

const tx = (over: Partial<Transaction>): Transaction => ({
  id: over.id ?? 't1',
  date: over.date ?? '2026-07-01',
  categoryId: over.categoryId ?? '',
  amount: over.amount ?? 10,
  description: over.description ?? 'desc',
  nome: over.nome,
  repoePoupanca: false,
  reposto: false,
  ...over,
})

describe('isUncategorized', () => {
  const cats = [cat('c1', 'Alimentação')]
  it('marks empty categoryId as uncategorized', () => {
    expect(isUncategorized(tx({ categoryId: '' }), cats)).toBe(true)
  })
  it('marks orphan/archived categoryId as uncategorized', () => {
    expect(isUncategorized(tx({ categoryId: 'gone' }), cats)).toBe(true)
  })
  it('accepts a valid categoryId', () => {
    expect(isUncategorized(tx({ categoryId: 'c1' }), cats)).toBe(false)
  })
})

describe('rowsToStatementText', () => {
  it('produces lines the existing parser can read back', () => {
    const rows: ExtractedRow[] = [
      { date: '2026-07-03', nome: 'Pingo Doce', categoria: 'Alimentação', valor: -42.1, descricao: 'PINGO DOCE LISBOA' },
      { date: '2026-07-04', nome: 'Ordenado', categoria: '', valor: 1500, descricao: 'TRF CR SEPA' }, // crédito → ignorado
    ]
    const text = rowsToStatementText(rows)
    const parsed = parseBankStatement(text)
    expect(parsed).toHaveLength(1) // só a saída (negativa)
    expect(parsed[0]).toMatchObject({
      date: '2026-07-03',
      nome: 'Pingo Doce',
      categoriaText: 'Alimentação',
      description: 'PINGO DOCE LISBOA',
      amount: 42.1,
    })
  })

  it('sanitizes separators in name/category so columns stay aligned', () => {
    const rows: ExtractedRow[] = [
      { date: '2026-07-05', nome: 'A;B', categoria: 'X;Y', valor: -5, descricao: 'DESC; COM ; PONTOS' },
    ]
    const parsed = parseBankStatement(rowsToStatementText(rows))
    expect(parsed).toHaveLength(1)
    expect(parsed[0].nome).toBe('A B')
    expect(parsed[0].description).toBe('DESC; COM ; PONTOS') // ';' preservado só na descrição
  })
})

describe('buildStatementHistory', () => {
  const cats = [cat('c1', 'Alimentação')]
  it('dedupes by descriptor keeping the most recent and maps category names', () => {
    const txs = [
      tx({ id: 'a', date: '2026-07-01', description: 'PINGO DOCE', categoryId: 'c1', nome: 'Super' }),
      tx({ id: 'b', date: '2026-06-15', description: 'PINGO DOCE', categoryId: 'c1', nome: 'Antigo' }),
    ]
    const hist = buildStatementHistory(txs, cats, '2026-07-10')
    expect(hist).toHaveLength(1)
    expect(hist[0]).toMatchObject({ descritivo: 'PINGO DOCE', nome: 'Super', categoria: 'Alimentação' })
  })
  it('excludes transactions older than ~2 months', () => {
    const txs = [tx({ id: 'old', date: '2026-01-01', description: 'ANTIGO', categoryId: 'c1' })]
    expect(buildStatementHistory(txs, cats, '2026-07-10')).toHaveLength(0)
  })
})

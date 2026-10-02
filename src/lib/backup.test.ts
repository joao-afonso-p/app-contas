import { describe, expect, it } from 'vitest'
import { emptyDataSet } from '../types'
import type { DataSet } from '../types'
import { BACKUP_VERSION, backupFileName, backupSummary, parseBackup, serializeBackup } from './backup'

const sample = (): DataSet => ({
  ...emptyDataSet(),
  savingsBuckets: [{ id: 'b1', name: 'Geral', kind: 'fixed', archived: false, order: 0 }],
  transactions: [
    { id: 't1', date: '2026-07-01', categoryId: 'c', amount: 5, description: 'x', repoePoupanca: false, reposto: false },
  ],
  meta: [{ id: 'meta', onboardingDone: true }],
})

describe('backup', () => {
  it('round-trip mantém os dados', () => {
    const data = sample()
    expect(parseBackup(serializeBackup(data))).toEqual(data)
  })

  it('só tem as chaves de topo esperadas (sem chave OpenAI, espaço ou tema)', () => {
    const file = JSON.parse(serializeBackup(sample(), new Date('2026-07-01T10:00:00Z')))
    expect(Object.keys(file).sort()).toEqual(['app', 'data', 'exportedAt', 'version'])
    expect(file.version).toBe(BACKUP_VERSION)
    expect(file.exportedAt).toBe('2026-07-01T10:00:00.000Z')
    expect(Object.keys(file.data)).toHaveLength(14)
  })

  it('rejeita texto que não é JSON', () => {
    expect(() => parseBackup('isto não é json')).toThrow(/não é uma cópia de segurança válida/)
  })

  it('rejeita ficheiros de outra app', () => {
    expect(() => parseBackup(JSON.stringify({ app: 'outra', version: 1, data: {} }))).toThrow(/Contas/)
    expect(() => parseBackup('[]')).toThrow(/Contas/)
  })

  it('rejeita versões mais recentes', () => {
    const text = JSON.stringify({ app: 'contas', version: BACKUP_VERSION + 1, data: {} })
    expect(() => parseBackup(text)).toThrow(/versão mais recente/)
  })

  it('coleções em falta ficam vazias e chaves desconhecidas são ignoradas', () => {
    const text = JSON.stringify({
      app: 'contas',
      version: 1,
      data: { savingsBuckets: sample().savingsBuckets, futura: [{ id: 'x' }] },
    })
    const out = parseBackup(text)
    expect(out.savingsBuckets).toHaveLength(1)
    expect(out.transactions).toEqual([])
    expect(out).not.toHaveProperty('futura')
  })

  it('rejeita documentos mal formados', () => {
    const bad = (data: unknown) => JSON.stringify({ app: 'contas', version: 1, data })
    expect(() => parseBackup(bad({ transactions: {} }))).toThrow(/danificada/)
    expect(() => parseBackup(bad({ transactions: [{ amount: 1 }] }))).toThrow(/danificada/)
    expect(() => parseBackup(bad({ transactions: [{ id: 3 }] }))).toThrow(/danificada/)
    expect(() => parseBackup(bad({ transactions: [null] }))).toThrow(/danificada/)
    expect(() => parseBackup(JSON.stringify({ app: 'contas', version: 1 }))).toThrow(/danificada/)
  })

  it('nome do ficheiro', () => {
    expect(backupFileName(new Date(2026, 6, 5))).toBe('contas-backup-2026-07-05.json')
  })

  it('resumo', () => {
    const s = backupSummary(sample())
    expect(s.buckets).toBe(1)
    expect(s.transactions).toBe(1)
    expect(s.monthsPlanned).toBe(0)
  })
})

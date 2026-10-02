// Cópia de segurança dos dados locais: exportar/importar tudo num ficheiro.
// Funções puras (sem DOM). Só contém o DataSet — a chave da OpenAI, o código
// de espaço e o tema vivem em localStorage e ficam de fora de propósito.
import type { DataSet } from '../types'
import { COLLECTIONS, emptyDataSet } from '../types'

export const BACKUP_VERSION = 1

export interface BackupFile {
  app: 'contas'
  version: number
  exportedAt: string
  data: DataSet
}

export function serializeBackup(data: DataSet, now: Date = new Date()): string {
  const file: BackupFile = {
    app: 'contas',
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    data,
  }
  return JSON.stringify(file, null, 2)
}

export function backupFileName(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `contas-backup-${y}-${m}-${d}.json`
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export function parseBackup(text: string): DataSet {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('Este ficheiro não é uma cópia de segurança válida. Escolhe o ficheiro contas-backup-….json exportado pela app.')
  }
  if (!isObject(raw) || raw.app !== 'contas') {
    throw new Error('Este ficheiro não é uma cópia de segurança da app Contas.')
  }
  if (typeof raw.version !== 'number' || !Number.isFinite(raw.version) || raw.version < 1) {
    throw new Error('A cópia de segurança está danificada (versão em falta).')
  }
  if (raw.version > BACKUP_VERSION) {
    throw new Error('Esta cópia de segurança foi criada numa versão mais recente da app — atualiza a página e tenta outra vez.')
  }
  if (!isObject(raw.data)) {
    throw new Error('A cópia de segurança está danificada (sem dados).')
  }
  const out = emptyDataSet()
  for (const name of COLLECTIONS) {
    const list = raw.data[name]
    if (list === undefined) continue // coleção em falta -> vazia
    if (!Array.isArray(list) || !list.every((d) => isObject(d) && typeof d.id === 'string')) {
      throw new Error(`A cópia de segurança está danificada (dados inválidos em "${name}").`)
    }
    out[name] = list as never
  }
  return out
}

export interface BackupSummary {
  monthsPlanned: number
  savingsMovements: number
  transactions: number
  buckets: number
  categories: number // despesas do planeamento + categorias de gastos
  incomeSources: number
  vehicles: number
}

export function backupSummary(data: DataSet): BackupSummary {
  return {
    monthsPlanned: data.monthlyPlans.length,
    savingsMovements: data.savingsMovements.length,
    transactions: data.transactions.length,
    buckets: data.savingsBuckets.length,
    categories: data.expenseCategories.length + data.transactionCategories.length,
    incomeSources: data.incomeSources.length,
    vehicles: data.investmentVehicles.length,
  }
}

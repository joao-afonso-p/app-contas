import type { Transaction } from '../types'

// Exporta gastos para CSV no formato da importação, com subcategoria:
// data;nome;categoria;subcategoria;valor;descrição
// Valores negativos (saídas), vírgula decimal. Cabeçalho na 1.ª linha (a
// importação ignora-o). BOM no início para o Excel reconhecer UTF-8.
export interface ExportLabels {
  categoria: string
  subcategoria: string
}

export function transactionsToCsv(
  transactions: Transaction[],
  labelsOf: (t: Transaction) => ExportLabels,
  from?: string, // YYYY-MM-DD inclusive
  to?: string,
): { csv: string; count: number } {
  const clean = (s: string | undefined) => (s ?? '').replace(/[;\t\n\r]+/g, ' ').trim()
  const rows = transactions
    .filter((t) => (!from || t.date >= from) && (!to || t.date <= to))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
  const lines = rows.map((t) => {
    const l = labelsOf(t)
    const valor = (-t.amount).toFixed(2).replace('.', ',')
    return [t.date, clean(t.nome), clean(l.categoria), clean(l.subcategoria), valor, clean(t.description)].join(';')
  })
  return { csv: '﻿' + ['data;nome;categoria;subcategoria;valor;descrição', ...lines].join('\n') + '\n', count: rows.length }
}

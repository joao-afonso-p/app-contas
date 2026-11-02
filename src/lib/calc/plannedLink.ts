// Ligação entre um movimento real de poupança (saída) e um movimento previsto
// das Projeções. Serve para orçamentos que se gastam aos poucos (ex.: "Prendas
// de Natal"): cada compra reduz o previsto, ou fecha-o com o valor real.
//
// Invariante: previsto.amount = valor original + soma dos `delta` das ligações.
// Por isso o valor original nunca precisa de ser guardado: deriva-se.

import type { MonthKey, PlannedLink, PlannedMovement, SavingsMovement } from '../../types'
import { addMonths } from '../format'
import { plannedMovementCounts } from './projections'

const round2 = (n: number): number => Math.round(n * 100) / 100

export type LinkEffect = PlannedLink['effect']

// Quantos previstos se mostram à partida (o resto fica em "Mostrar mais").
export const DEFAULT_VISIBLE_PLANNED = 5

// Só saídas simples: sem transferências entre baldes e sem entradas.
export function isLinkablePlanned(m: PlannedMovement): boolean {
  return m.amount < 0 && !m.transferGroupId
}

export interface PlannedOptions {
  // Por defeito: deste mês e do seguinte, por fazer.
  main: PlannedMovement[]
  // Meses seguintes (atrás de "Mostrar mais").
  later: PlannedMovement[]
}

export function plannedOptions(
  all: PlannedMovement[],
  baseMonth: MonthKey,
  keepId?: string, // o previsto já ligado ao editar, mesmo que entretanto esteja fechado
): PlannedOptions {
  const sorted = all
    .filter((m) => isLinkablePlanned(m) && (m.id === keepId || plannedMovementCounts(m, baseMonth)))
    .slice()
    .sort((a, b) => a.month.localeCompare(b.month) || a.description.localeCompare(b.description))
  const limit = addMonths(baseMonth, 1)
  const main = sorted.filter((m) => m.month <= limit || m.id === keepId)
  const later = sorted.filter((m) => !main.includes(m))
  return { main, later }
}

export interface LinkOutcome {
  planned: PlannedMovement // como fica o previsto
  delta: number
  closed: boolean
  // O gasto é maior do que o que restava no previsto (só em 'part').
  clamped: boolean
}

// `spent` = valor gasto (positivo). O previsto é uma saída (amount negativo).
export function applyPlannedLink(pm: PlannedMovement, spent: number, effect: LinkEffect): LinkOutcome {
  const value = Math.abs(spent)
  if (effect === 'close') {
    const amount = round2(-value)
    return { planned: { ...pm, amount, done: true }, delta: round2(amount - pm.amount), closed: true, clamped: false }
  }
  const remaining = Math.abs(pm.amount)
  const reduce = Math.min(value, remaining)
  return {
    planned: { ...pm, amount: round2(pm.amount + reduce) },
    delta: round2(reduce),
    closed: false,
    clamped: value > remaining,
  }
}

// Desfaz o efeito de uma ligação (ao apagar ou mudar o movimento).
export function revertPlannedLink(pm: PlannedMovement, link: PlannedLink): PlannedMovement {
  return {
    ...pm,
    amount: round2(pm.amount - link.delta),
    done: link.closed ? false : pm.done,
  }
}

export function linkedEntries(movements: SavingsMovement[], plannedId: string): SavingsMovement[] {
  return movements
    .filter((m) => m.plannedLink?.plannedMovementId === plannedId)
    .sort((a, b) => a.date.localeCompare(b.date))
}

// Valor original do previsto, antes de qualquer ligação (com sinal, negativo nas saídas).
export function plannedOriginalAmount(pm: PlannedMovement, entries: SavingsMovement[]): number {
  return round2(pm.amount - entries.reduce((acc, m) => acc + (m.plannedLink?.delta ?? 0), 0))
}

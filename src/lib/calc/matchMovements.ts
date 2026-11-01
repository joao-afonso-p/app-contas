// Sugestão de ligação entre uma linha do extrato e um movimento de poupança
// já registado à mão (ex.: tiraste 42,80 € da poupança para uma prenda e só
// importas o extrato uma semana depois).
//
// Só sugere: quem decide é sempre o utilizador. Critério: saída com exatamente
// o mesmo valor, ainda sem gasto ligado, a ≤ MATCH_WINDOW_DAYS dias da linha.

import type { SavingsMovement } from '../../types'

export const MATCH_WINDOW_DAYS = 7

const dayNumber = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round(Date.UTC(y, (m ?? 1) - 1, d ?? 1) / 86_400_000)
}

const cents = (n: number): number => Math.round(n * 100)

export interface MovementMatch {
  movement: SavingsMovement
  daysApart: number // distância absoluta em dias
}

// Um movimento só serve de candidato se for uma saída "simples": não faz parte
// de uma transferência entre baldes, não vai para um veículo de investimento,
// não vem de um resgate e ainda não está ligado a nenhum gasto.
export function isLinkableMovement(m: SavingsMovement): boolean {
  return m.amount < 0 && !m.transactionId && !m.transferGroupId && !m.vehicleId && !m.assetEntryId
}

export function findMovementMatches(
  row: { date: string; amount: number }, // amount do gasto, positivo
  movements: SavingsMovement[],
  excludeIds: ReadonlySet<string> = new Set(),
  windowDays: number = MATCH_WINDOW_DAYS,
): MovementMatch[] {
  const target = cents(row.amount)
  const day = dayNumber(row.date)
  return movements
    .filter((m) => isLinkableMovement(m) && !excludeIds.has(m.id) && cents(-m.amount) === target)
    .map((movement) => ({ movement, daysApart: Math.abs(dayNumber(movement.date) - day) }))
    .filter((c) => c.daysApart <= windowDays)
    .sort((a, b) => a.daysApart - b.daysApart || a.movement.date.localeCompare(b.movement.date))
}

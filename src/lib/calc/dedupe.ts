// Deteção de gastos duplicados na importação de extratos.
// Duplicado = mesmo valor e mesma descrição do banco e (data a ≤ 4 dias OU mesmo mês).
// A janela de 4 dias apanha gastos cuja data foi mudada à mão para o mês seguinte/anterior.

export const DUPLICATE_WINDOW_DAYS = 4

export interface DedupeItem {
  date: string // "YYYY-MM-DD"
  amount: number
  description: string
}

const dayNumber = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round(Date.UTC(y, (m ?? 1) - 1, d ?? 1) / 86_400_000)
}

export function datesAreClose(a: string, b: string): boolean {
  if (a.slice(0, 7) === b.slice(0, 7)) return true
  return Math.abs(dayNumber(a) - dayNumber(b)) <= DUPLICATE_WINDOW_DAYS
}

const keyOf = (amount: number, description: string): string => `${amount}|${description.trim()}`

// Devolve um detetor que se vai "alimentando": cada item novo é comparado com
// os já conhecidos (existentes + linhas anteriores do mesmo extrato).
export function makeDuplicateDetector(existing: DedupeItem[]) {
  const byKey = new Map<string, string[]>()
  const add = (it: DedupeItem) => {
    const k = keyOf(it.amount, it.description)
    const list = byKey.get(k)
    if (list) list.push(it.date)
    else byKey.set(k, [it.date])
  }
  for (const it of existing) add(it)
  return {
    // Marca o item como conhecido e diz se já havia um parecido.
    check(it: DedupeItem): boolean {
      const dates = byKey.get(keyOf(it.amount, it.description))
      const duplicate = Boolean(dates?.some((d) => datesAreClose(d, it.date)))
      if (!duplicate) add(it)
      return duplicate
    },
  }
}

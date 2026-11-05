// Tags livres nos gastos. Iguais se só diferirem em maiúsculas, acentos ou espaços.
import type { Transaction } from '../../types'

export const MAX_TAG_LENGTH = 30

// "  #Férias  2026 " -> "Férias 2026"
export function normalizeTag(raw: string): string {
  return raw.replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH).trim()
}

export function tagKey(tag: string): string {
  return normalizeTag(tag).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

// Junta tags novas às existentes, sem repetir (mantém a grafia da primeira).
export function addTags(current: string[] | undefined, extra: string[]): string[] {
  const out = [...(current ?? [])]
  const keys = new Set(out.map(tagKey))
  for (const raw of extra) {
    const t = normalizeTag(raw)
    const k = tagKey(t)
    if (!t || keys.has(k)) continue
    keys.add(k)
    out.push(t)
  }
  return out
}

export function removeTags(current: string[] | undefined, drop: string[]): string[] {
  const gone = new Set(drop.map(tagKey))
  return (current ?? []).filter((t) => !gone.has(tagKey(t)))
}

// Todas as tags usadas, com contagem, da mais usada para a menos usada.
export function allTags(transactions: Pick<Transaction, 'tags'>[]): { tag: string; count: number }[] {
  const map = new Map<string, { tag: string; count: number }>()
  for (const t of transactions) {
    for (const tag of t.tags ?? []) {
      const k = tagKey(tag)
      const cur = map.get(k)
      if (cur) cur.count += 1
      else map.set(k, { tag, count: 1 })
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'pt'))
}

// Filtro "qualquer uma": sem tags escolhidas passa tudo.
export function matchesAnyTag(t: Pick<Transaction, 'tags'>, selected: string[]): boolean {
  if (selected.length === 0) return true
  const keys = new Set(selected.map(tagKey))
  return (t.tags ?? []).some((x) => keys.has(tagKey(x)))
}

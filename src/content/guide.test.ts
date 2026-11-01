import { describe, expect, it } from 'vitest'
import { FAQ, GLOSSARY, GUIDE } from './guide'

describe('guia', () => {
  const all = JSON.stringify({ GUIDE, FAQ, GLOSSARY })

  it('não usa travessões longos', () => {
    expect(all.includes('—')).toBe(false)
  })

  it('tem secções com ids únicos e conteúdo', () => {
    const ids = GUIDE.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of GUIDE) expect(s.blocks.length).toBeGreaterThan(0)
  })

  it('FAQ e glossário não têm entradas vazias', () => {
    for (const f of FAQ) expect(f.q && f.a).toBeTruthy()
    for (const g of GLOSSARY) expect(g.id && g.term && g.def).toBeTruthy()
  })

  it('todas as palavras sublinhadas [[...]] existem no glossário', () => {
    const ids = new Set(GLOSSARY.map((g) => g.id))
    const missing = [...all.matchAll(/\[\[([^\]]+)\]\]/g)]
      .map((m) => (m[1].split('|')[1] ?? m[1]).toLowerCase())
      .filter((k) => !ids.has(k))
    expect(missing).toEqual([])
  })
})

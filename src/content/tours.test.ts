import { describe, expect, it } from 'vitest'
import { SCREEN_IDS } from '../lib/route'
import { TOURS } from './tours'

describe('visitas guiadas', () => {
  it('ids únicos e passos com título e texto', () => {
    const ids = TOURS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of TOURS) {
      expect(t.steps.length).toBeGreaterThan(0)
      for (const s of t.steps) expect(s.title && s.text).toBeTruthy()
    }
  })

  it('ecrãs e alvos do menu existem', () => {
    const screens = new Set<string>(SCREEN_IDS)
    for (const t of TOURS) {
      for (const s of t.steps) {
        if (s.screen) expect(screens.has(s.screen)).toBe(true)
        const targets = s.target ? (Array.isArray(s.target) ? s.target : [s.target]) : []
        for (const key of targets) if (key.startsWith('nav-')) expect(screens.has(key.slice(4))).toBe(true)
      }
    }
  })

  it('só há uma visita por ecrã e não usa travessões longos', () => {
    const offers = TOURS.filter((t) => t.offerOn).map((t) => t.offerOn)
    expect(new Set(offers).size).toBe(offers.length)
    expect(JSON.stringify(TOURS).includes('—')).toBe(false)
  })
})

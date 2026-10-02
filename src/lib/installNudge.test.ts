import { describe, expect, it } from 'vitest'
import { MAX_SNOOZES, SNOOZE_DAYS, hasAppliedPlan, shouldShowNudge, snoozeNudge } from './installNudge'
import type { MonthlyPlan } from '../types'

const NOW = new Date('2026-10-02T10:00:00Z')
const base = { state: {}, hasAppliedPlan: true, standalone: false, now: NOW }
const plan = (closed?: boolean): MonthlyPlan => ({ id: '2026-10', income: {}, expenses: {}, savings: {}, closed })

describe('hasAppliedPlan', () => {
  it('só conta planos aplicados (undefined = aplicado)', () => {
    expect(hasAppliedPlan([])).toBe(false)
    expect(hasAppliedPlan([plan(false)])).toBe(false)
    expect(hasAppliedPlan([plan(false), plan(true)])).toBe(true)
    expect(hasAppliedPlan([plan(undefined)])).toBe(true)
  })
})

describe('shouldShowNudge', () => {
  it('aparece depois do primeiro plano aplicado', () => {
    expect(shouldShowNudge(base)).toBe(true)
    expect(shouldShowNudge({ ...base, hasAppliedPlan: false })).toBe(false)
  })
  it('nunca aparece na app instalada nem depois de "Já guardei"', () => {
    expect(shouldShowNudge({ ...base, standalone: true })).toBe(false)
    expect(shouldShowNudge({ ...base, state: { done: true } })).toBe(false)
  })
  it('"Agora não" adia e, ao fim de MAX_SNOOZES, deixa de aparecer', () => {
    const once = snoozeNudge({}, NOW)
    expect(once.snoozes).toBe(1)
    expect(shouldShowNudge({ ...base, state: once })).toBe(false)
    const later = new Date(NOW.getTime() + (SNOOZE_DAYS + 1) * 86_400_000)
    expect(shouldShowNudge({ ...base, state: once, now: later })).toBe(true)

    let s = {}
    for (let i = 0; i < MAX_SNOOZES; i++) s = snoozeNudge(s, NOW)
    const muchLater = new Date(NOW.getTime() + 365 * 86_400_000)
    expect(shouldShowNudge({ ...base, state: s, now: muchLater })).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import type { AppMeta } from '../types'
import { featureStatus, pendingUnlockNotices, UNLOCK_DAYS } from './unlock'

const meta = (patch: Partial<AppMeta> = {}): AppMeta => ({ id: 'meta', onboardedAt: '2026-01-10', ...patch })

describe('desbloqueio progressivo', () => {
  it('contas sem onboardedAt (antigas ou importadas) nunca ficam bloqueadas', () => {
    expect(featureStatus(undefined, 'budgets', '2026-01-11').locked).toBe(false)
    expect(featureStatus({ id: 'meta' }, 'projecoes', '2026-01-11').locked).toBe(false)
  })

  it('bloqueia até ao fim dos dias de cada parte', () => {
    const m = meta()
    expect(featureStatus(m, 'investimentos', '2026-01-10')).toMatchObject({ locked: true, unlockDate: '2026-02-09', daysLeft: 30 })
    expect(featureStatus(m, 'investimentos', '2026-02-08').locked).toBe(true)
    expect(featureStatus(m, 'investimentos', '2026-02-09').locked).toBe(false)
    expect(featureStatus(m, 'budgets', '2026-03-10').locked).toBe(true)
    expect(featureStatus(m, 'budgets', '2026-03-11').locked).toBe(false)
    expect(featureStatus(m, 'projecoes', '2026-04-09').locked).toBe(true)
    expect(featureStatus(m, 'projecoes', '2026-04-10').locked).toBe(false)
  })

  it('a ordem é Investimento, depois Analytics, depois Projeções', () => {
    expect(UNLOCK_DAYS.investimentos).toBeLessThan(UNLOCK_DAYS.budgets)
    expect(UNLOCK_DAYS.budgets).toBeLessThan(UNLOCK_DAYS.projecoes)
  })

  it('"desbloquear já" abre só essa parte', () => {
    const m = meta({ unlockedFeatures: ['budgets'] })
    expect(featureStatus(m, 'budgets', '2026-01-11').locked).toBe(false)
    expect(featureStatus(m, 'projecoes', '2026-01-11').locked).toBe(true)
  })

  it('desativar o desbloqueio progressivo abre tudo', () => {
    const m = meta({ progressiveUnlock: false })
    for (const f of ['investimentos', 'budgets', 'projecoes'] as const) {
      expect(featureStatus(m, f, '2026-01-11').locked).toBe(false)
    }
  })

  it('avisa quando uma parte abre por tempo, uma só vez', () => {
    expect(pendingUnlockNotices(meta(), '2026-01-20')).toEqual([])
    expect(pendingUnlockNotices(meta(), '2026-02-10')).toEqual(['investimentos'])
    expect(pendingUnlockNotices(meta({ unlockNoticesSeen: ['investimentos'] }), '2026-02-10')).toEqual([])
    expect(pendingUnlockNotices(meta(), '2026-03-12')).toEqual(['investimentos', 'budgets'])
  })

  it('não avisa de partes que a pessoa desbloqueou à mão nem em contas antigas', () => {
    expect(pendingUnlockNotices(meta({ unlockedFeatures: ['investimentos'] }), '2026-02-10')).toEqual([])
    expect(pendingUnlockNotices({ id: 'meta' }, '2026-12-01')).toEqual([])
    expect(pendingUnlockNotices(meta({ progressiveUnlock: false }), '2026-12-01')).toEqual([])
  })
})

import type { AppMeta } from '../types'
import { addDaysISO } from './financialMonth'

// Desbloqueio progressivo: numa conta nova, as partes mais avançadas só abrem passado
// algum tempo de uso, para a pessoa se habituar primeiro ao essencial. Há sempre uma
// saída: "Desbloquear já" por parte, ou desativar tudo em Definições.
// Contas sem `onboardedAt` (antigas ou importadas) nunca ficam bloqueadas.

export type LockedFeature = 'investimentos' | 'budgets' | 'projecoes'

export const LOCKED_FEATURES: readonly LockedFeature[] = ['investimentos', 'budgets', 'projecoes']

// Dias de uso até abrir: Investimento ~1 mês, Analytics ~2, Projeções ~3.
export const UNLOCK_DAYS: Record<LockedFeature, number> = {
  investimentos: 30,
  budgets: 60,
  projecoes: 90,
}

export const FEATURE_LABEL: Record<LockedFeature, string> = {
  investimentos: 'Investimento',
  budgets: 'Analytics',
  projecoes: 'Projeções',
}

export const isLockedFeature = (screen: string): screen is LockedFeature =>
  (LOCKED_FEATURES as readonly string[]).includes(screen)

export interface FeatureStatus {
  locked: boolean
  // Data em que abre sozinho (YYYY-MM-DD). null se não há bloqueio.
  unlockDate: string | null
  daysLeft: number
}

const dayDiff = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)

const OPEN: FeatureStatus = { locked: false, unlockDate: null, daysLeft: 0 }

export function featureStatus(meta: AppMeta | undefined, feature: LockedFeature, today: string): FeatureStatus {
  if (!meta?.onboardedAt) return OPEN
  if (meta.progressiveUnlock === false) return OPEN
  if (meta.unlockedFeatures?.includes(feature)) return OPEN
  const unlockDate = addDaysISO(meta.onboardedAt, UNLOCK_DAYS[feature])
  const daysLeft = dayDiff(today, unlockDate)
  return daysLeft > 0 ? { locked: true, unlockDate, daysLeft } : { locked: false, unlockDate, daysLeft: 0 }
}

// Partes que abriram (por tempo ou manualmente) e cujo aviso ainda não foi visto.
// Só para contas com desbloqueio ativo.
export function pendingUnlockNotices(meta: AppMeta | undefined, today: string): LockedFeature[] {
  if (!meta?.onboardedAt || meta.progressiveUnlock === false) return []
  const seen = new Set(meta.unlockNoticesSeen ?? [])
  return LOCKED_FEATURES.filter((f) => !seen.has(f) && !featureStatus(meta, f, today).locked)
    .filter((f) => meta.unlockedFeatures?.includes(f) !== true)
}

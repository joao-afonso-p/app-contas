import type { MonthlyPlan } from '../types'

// Lembrete "ter a app sempre à mão" (favoritos no computador, ecrã principal
// no telemóvel). Só aparece depois do primeiro plano aplicado — aí a pessoa
// já decidiu usar a app a sério. "Agora não" adia SNOOZE_DAYS; depois de
// MAX_SNOOZES adiamentos não volta a aparecer. "Já guardei" / instalar
// encerra para sempre. Continua sempre disponível em Definições.

export const SNOOZE_DAYS = 14
export const MAX_SNOOZES = 2

export interface NudgeState {
  done?: boolean
  snoozes?: number
  snoozedUntil?: string // ISO
}

const LS_KEY = 'contas.installNudge'
// Faixa antiga (sempre visível até ser fechada): quem já a fechou não volta
// a ser incomodado.
const LS_LEGACY_DISMISSED = 'contas.installBannerDismissed'

export function loadNudgeState(): NudgeState {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as NudgeState
  } catch {
    // estado corrompido: recomeça
  }
  return localStorage.getItem(LS_LEGACY_DISMISSED) === '1' ? { done: true } : {}
}

export function saveNudgeState(state: NudgeState) {
  localStorage.setItem(LS_KEY, JSON.stringify(state))
}

// `closed === undefined` (planos anteriores ao campo) conta como aplicado,
// tal como em computeBalances.
export const hasAppliedPlan = (plans: MonthlyPlan[]): boolean => plans.some((p) => p.closed !== false)

export function shouldShowNudge(p: {
  state: NudgeState
  hasAppliedPlan: boolean
  standalone: boolean
  now: Date
}): boolean {
  const { state } = p
  if (p.standalone || !p.hasAppliedPlan || state.done) return false
  if ((state.snoozes ?? 0) >= MAX_SNOOZES) return false
  if (state.snoozedUntil && p.now < new Date(state.snoozedUntil)) return false
  return true
}

export function snoozeNudge(state: NudgeState, now: Date): NudgeState {
  const until = new Date(now.getTime() + SNOOZE_DAYS * 24 * 60 * 60 * 1000)
  return { ...state, snoozes: (state.snoozes ?? 0) + 1, snoozedUntil: until.toISOString() }
}

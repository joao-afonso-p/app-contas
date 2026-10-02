import { useSyncExternalStore } from 'react'
import { trackEvent } from './analytics'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

// Chamar uma vez no arranque (main.tsx), antes de o React montar.
export function registerInstallPrompt() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    emit()
  })
}

// Devolve true se o utilizador aceitou instalar.
export async function promptInstall(): Promise<boolean> {
  const ev = deferred
  if (!ev) return false
  deferred = null
  emit()
  try {
    await ev.prompt()
    const { outcome } = await ev.userChoice
    if (outcome === 'accepted') trackEvent('install-prompt-accepted')
    return outcome === 'accepted'
  } catch {
    return false
  }
}

export function useInstallPrompt(): { canPrompt: boolean; promptInstall: () => Promise<boolean> } {
  const canPrompt = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => deferred !== null,
    () => false,
  )
  return { canPrompt, promptInstall }
}

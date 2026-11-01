import { create } from 'zustand'

// Estado do coach (visitas guiadas): qual a visita ativa e em que passo está.
// As visitas já vistas ficam em localStorage (por dispositivo): ver uma visita
// no telemóvel não impede de a ver também no computador.

const LS_SEEN = 'contas.coach.seen'

function readSeen(): string[] {
  try {
    const raw = localStorage.getItem(LS_SEEN)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export const hasSeenTour = (id: string): boolean => readSeen().includes(id)

export function markTourSeen(id: string): void {
  try {
    const seen = readSeen()
    if (!seen.includes(id)) localStorage.setItem(LS_SEEN, JSON.stringify([...seen, id]))
  } catch {
    // sem localStorage (modo privado): a visita pode voltar a ser oferecida, sem problema
  }
}

export function resetSeenTours(): void {
  try {
    localStorage.removeItem(LS_SEEN)
  } catch {
    // ignorar
  }
}

interface CoachState {
  tourId: string | null
  step: number
  start: (id: string) => void
  goto: (step: number) => void
  stop: () => void
}

export const useCoach = create<CoachState>((set) => ({
  tourId: null,
  step: 0,
  start: (id) => set({ tourId: id, step: 0 }),
  goto: (step) => set({ step: Math.max(0, step) }),
  stop: () => set({ tourId: null, step: 0 }),
}))

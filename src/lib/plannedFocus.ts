import { create } from 'zustand'

// Pedido para "abrir as Projeções centradas num movimento previsto" (vindo de
// um movimento real ligado a ele). As Projeções leem-no ao abrir e limpam-no.
interface PlannedFocus {
  plannedId: string | null
  request: (id: string) => void
  clear: () => void
}

export const usePlannedFocus = create<PlannedFocus>((set) => ({
  plannedId: null,
  request: (id) => set({ plannedId: id }),
  clear: () => set({ plannedId: null }),
}))

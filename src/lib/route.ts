import type { Screen } from '../store/useStore'

// O ecrã ativo vive no hash do URL ("#/gastos"): o refresh volta ao mesmo
// ecrã e o botão "voltar" do browser/telemóvel navega entre ecrãs.
export const SCREEN_IDS: readonly Screen[] = [
  'planeamento', 'movimentos', 'gastos', 'budgets', 'investimentos', 'projecoes', 'overview', 'definicoes', 'historico',
]

export function screenFromHash(hash: string): Screen | null {
  const id = hash.replace(/^#\/?/, '')
  return (SCREEN_IDS as readonly string[]).includes(id) ? (id as Screen) : null
}

export function initialScreen(): Screen {
  if (typeof location === 'undefined') return 'overview'
  return screenFromHash(location.hash) ?? 'overview'
}

// Acrescenta uma entrada ao histórico (só se o ecrã mudou).
export function pushScreen(screen: Screen): void {
  if (typeof history === 'undefined' || typeof location === 'undefined') return
  if (screenFromHash(location.hash) === screen) return
  history.pushState(null, '', `#/${screen}`)
}

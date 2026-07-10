import { useEffect } from 'react'
import { needsOnboarding, useStore, type Screen } from './store/useStore'
import { cx } from './components/ui'
import { Welcome } from './screens/Welcome'
import { Onboarding } from './screens/Onboarding'
import { Planeamento } from './screens/Planeamento'
import { Movimentos } from './screens/Movimentos'
import { Gastos } from './screens/Gastos'
import { Budgets } from './screens/Budgets'
import { Projecoes } from './screens/Projecoes'
import { Overview } from './screens/Overview'
import { Definicoes } from './screens/Definicoes'
import { Historico } from './screens/Historico'

const NAV: { id: Screen; label: string; icon: string; mobile: boolean }[] = [
  { id: 'overview', label: 'Overview', icon: '📊', mobile: true },
  { id: 'planeamento', label: 'Planeamento', icon: '📅', mobile: true },
  { id: 'movimentos', label: 'Movimentos', icon: '↔️', mobile: true },
  { id: 'gastos', label: 'Gastos', icon: '🧾', mobile: true },
  { id: 'budgets', label: 'Budgets', icon: '🎯', mobile: false },
  { id: 'projecoes', label: 'Projeções', icon: '📈', mobile: false },
  { id: 'definicoes', label: 'Definições', icon: '⚙️', mobile: true },
]

const SCREENS: Record<Screen, () => React.JSX.Element> = {
  planeamento: Planeamento,
  movimentos: Movimentos,
  gastos: Gastos,
  budgets: Budgets,
  projecoes: Projecoes,
  overview: Overview,
  definicoes: Definicoes,
  historico: Historico,
}

export function App() {
  const status = useStore((s) => s.status)
  const error = useStore((s) => s.error)
  const screen = useStore((s) => s.screen)
  const setScreen = useStore((s) => s.setScreen)
  const theme = useStore((s) => s.theme)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const mode = useStore((s) => s.mode)
  const init = useStore((s) => s.init)
  const data = useStore((s) => s.data)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  if (status === 'boot') {
    return <div className="flex h-dvh items-center justify-center text-muted">A carregar…</div>
  }
  if (status === 'error') {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="text-lg font-bold">Algo correu mal</div>
        <div className="max-w-md text-sm text-muted">{error}</div>
        <button
          className="rounded-xl bg-accent-strong px-4 py-2 text-sm font-semibold text-white"
          onClick={() => {
            localStorage.removeItem('contas.mode')
            location.reload()
          }}
        >
          Recomeçar
        </button>
      </div>
    )
  }
  if (status === 'welcome') return <Welcome />
  if (needsOnboarding(data)) return <Onboarding />

  const Active = SCREENS[screen]

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar desktop */}
      <aside className="pt-safe sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-border bg-surface p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-strong text-lg font-black text-white">
            €
          </div>
          <div>
            <div className="text-base font-black leading-tight">Contas</div>
            <div className="text-[11px] text-muted">{mode === 'space' ? 'Sincronizado' : 'Local'}</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setScreen(item.id)}
              className={cx(
                'flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors',
                screen === item.id
                  ? 'bg-accent-soft font-semibold text-accent-strong'
                  : 'text-muted hover:bg-surface-2 hover:text-text',
              )}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <button
          onClick={toggleTheme}
          className="mt-auto rounded-xl border border-border px-3 py-2 text-sm text-muted hover:bg-surface-2"
        >
          {theme === 'dark' ? '☀️ Tema claro' : '🌙 Tema escuro'}
        </button>
      </aside>

      {/* Conteúdo */}
      <main className="min-w-0 flex-1 pb-24 md:pb-6">
        <div className="pt-safe mx-auto max-w-6xl px-4 pb-4 md:px-6 md:pb-6">
          <Active />
        </div>
      </main>

      {/* Tab bar mobile */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur md:hidden">
        <div className="flex justify-around">
          {NAV.filter((i) => i.mobile).map((item) => (
            <button
              key={item.id}
              onClick={() => setScreen(item.id)}
              className={cx(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium',
                screen === item.id ? 'text-accent-strong' : 'text-muted',
              )}
            >
              <span className="text-xl leading-none">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

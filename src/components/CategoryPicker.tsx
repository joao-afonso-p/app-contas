import { useEffect, useRef, useState } from 'react'
import type { TransactionCategory } from '../types'
import { Badge, cx } from './ui'

// Seletor rápido de categoria: um clique no badge abre uma grelha com todas as
// categorias; escolher grava logo (o onSelect faz o put) e fecha. Sem botão de
// guardar. Quando não há categoria mostra um "+" em tom de aviso.
export function CategoryPicker({
  categories,
  value,
  onSelect,
}: {
  categories: TransactionCategory[]
  value: string
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = categories.find((c) => c.id === value)

  const pick = (id: string) => {
    if (id !== value) onSelect(id)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={current ? `Categoria: ${current.name}` : 'Atribuir categoria'}
        className="rounded-full transition-opacity hover:opacity-80"
      >
        {current ? (
          <Badge>{current.name}</Badge>
        ) : (
          <Badge tone="warn">+ categoria</Badge>
        )}
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-40 mt-1 w-[min(20rem,80vw)] rounded-xl border border-border bg-surface p-2 shadow-xl"
          role="listbox"
        >
          {categories.length === 0 ? (
            <p className="p-2 text-xs text-muted">Sem categorias. Cria-as nas Definições.</p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pick(c.id)}
                  className={cx(
                    'truncate rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors',
                    c.id === value
                      ? 'bg-accent-soft text-accent-strong'
                      : 'bg-surface-2 text-text hover:bg-accent-soft hover:text-accent-strong',
                  )}
                  title={c.name}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

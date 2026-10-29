import { useEffect, useRef, useState } from 'react'
import type { Subcategory } from '../types'
import { subcategoriesOf, type Group, type Resolved } from '../lib/calc/categories'
import { Badge, cx } from './ui'

// Seletor rápido de categoria em 2 níveis: categoria principal (despesa do
// planeamento ou balde de poupança) + subcategoria opcional. Escolher grava
// logo (o onSelect faz o put) e fecha. Sem subcategorias, um clique chega.
export function CategoryPicker({
  groups,
  subcategories,
  value,
  fallbackLabel,
  onSelect,
  onCreateSubcategory,
}: {
  groups: Group[]
  subcategories: Subcategory[]
  value: Resolved
  // Nome da categoria antiga, mostrado a aviso quando o gasto ainda não tem categoria do plano.
  fallbackLabel?: string
  onSelect: (groupId: string, subcategoryId?: string) => void
  // Cria uma subcategoria nova e devolve o id (para a selecionar logo).
  onCreateSubcategory?: (parentId: string, name: string) => string
}) {
  const [open, setOpen] = useState(false)
  const [parent, setParent] = useState<Group | null>(null)
  const [newName, setNewName] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const close = () => {
    setOpen(false)
    setParent(null)
    setNewName('')
  }

  const current = groups.find((g) => g.id === value.groupId)
  const currentSub = subcategories.find((s) => s.id === value.subcategoryId)
  const label = current ? (currentSub ? `${current.name} › ${currentSub.name}` : current.name) : ''

  const pick = (groupId: string, subId?: string) => {
    if (groupId !== value.groupId || subId !== value.subcategoryId) onSelect(groupId, subId)
    close()
  }

  const clickGroup = (g: Group) => {
    if (subcategoriesOf(subcategories, g.id).length > 0) setParent(g)
    else pick(g.id)
  }

  const createAndPick = () => {
    const name = newName.trim()
    if (!parent || !name || !onCreateSubcategory) return
    const id = onCreateSubcategory(parent.id, name)
    pick(parent.id, id)
  }

  const expenses = groups.filter((g) => g.kind === 'expense')
  const buckets = groups.filter((g) => g.kind === 'bucket')

  const chip = (g: Group) => (
    <button
      key={g.id}
      type="button"
      onClick={() => clickGroup(g)}
      className={cx(
        'truncate rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors',
        g.id === value.groupId
          ? 'bg-accent-soft text-accent-strong'
          : 'bg-surface-2 text-text hover:bg-accent-soft hover:text-accent-strong',
      )}
      title={g.name}
    >
      {g.name}
    </button>
  )

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={current ? `Categoria: ${label}` : 'Atribuir categoria'}
        className="rounded-full transition-opacity hover:opacity-80"
      >
        {current ? (
          <Badge tone={current.kind === 'bucket' ? 'goal' : undefined}>{label}</Badge>
        ) : (
          <Badge tone="warn" >{fallbackLabel ? `${fallbackLabel} · associar` : '+ categoria'}</Badge>
        )}
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-40 mt-1 w-[min(22rem,85vw)] rounded-xl border border-border bg-surface p-2 shadow-xl"
          role="listbox"
        >
          {parent ? (
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => { setParent(null); setNewName('') }}
                className="self-start rounded px-1 text-xs font-semibold text-muted hover:text-text"
              >
                ← {parent.name}
              </button>
              <button
                type="button"
                onClick={() => pick(parent.id)}
                className="rounded-lg bg-surface-2 px-2.5 py-2 text-left text-xs font-medium text-text hover:bg-accent-soft hover:text-accent-strong"
              >
                Só “{parent.name}” (sem subcategoria)
              </button>
              <div className="grid grid-cols-2 gap-1.5">
                {subcategoriesOf(subcategories, parent.id).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => pick(parent.id, s.id)}
                    className={cx(
                      'truncate rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors',
                      s.id === value.subcategoryId
                        ? 'bg-accent-soft text-accent-strong'
                        : 'bg-surface-2 text-text hover:bg-accent-soft hover:text-accent-strong',
                    )}
                    title={s.name}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
              {onCreateSubcategory && (
                <div className="mt-1 flex gap-1.5">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createAndPick()}
                    placeholder="+ nova subcategoria"
                    className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-text focus:border-accent focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={createAndPick}
                    disabled={!newName.trim()}
                    className="rounded-lg bg-accent-soft px-2.5 text-xs font-semibold text-accent-strong disabled:opacity-40"
                  >
                    Criar
                  </button>
                </div>
              )}
            </div>
          ) : groups.length === 0 ? (
            <p className="p-2 text-xs text-muted">Sem categorias. Cria despesas do planeamento nas Definições.</p>
          ) : (
            <div className="flex flex-col gap-2">
              <div>
                <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Orçamento do mês</div>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">{expenses.map(chip)}</div>
              </div>
              {buckets.length > 0 && (
                <div>
                  <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Pago pela poupança (fora do orçamento)
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">{buckets.map(chip)}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { cx } from './ui'
import { MAX_TAG_LENGTH, addTags, normalizeTag, removeTags, tagKey } from '../lib/calc/tags'

type TagOption = { tag: string; count: number }

// Etiquetas pequenas. Com `onTagClick`, cada uma é um botão (usado para filtrar a lista).
// Com `max`, mostra só as primeiras e um "+N" (a lista completa fica no title).
export function TagChips({
  tags, onTagClick, className, max,
}: { tags?: string[]; onTagClick?: (tag: string) => void; className?: string; max?: number }) {
  if (!tags || tags.length === 0) return null
  const shown = max !== undefined && tags.length > max ? tags.slice(0, max) : tags
  const extra = tags.length - shown.length
  const chip = 'rounded-full bg-surface-2 px-1.5 py-px text-[10px] font-medium leading-4 text-muted'
  return (
    <span className={cx('flex flex-wrap items-center gap-1', className)} title={extra > 0 ? tags.join(', ') : undefined}>
      {shown.map((t) =>
        onTagClick ? (
          <button
            key={t}
            type="button"
            onClick={(e) => { e.stopPropagation(); onTagClick(t) }}
            title="Filtrar por esta tag"
            className={cx(chip, 'hover:bg-accent-soft hover:text-accent-strong')}
          >
            {t}
          </button>
        ) : (
          <span key={t} className={chip}>{t}</span>
        ),
      )}
      {extra > 0 && <span className={chip}>+{extra}</span>}
    </span>
  )
}

function useClickOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])
  return ref
}

// Campo para juntar várias tags: escreve e carrega Enter ou vírgula; sugere as já usadas.
export function TagInput({
  value, onChange, suggestions, placeholder = 'Escreve e carrega Enter',
}: { value: string[]; onChange: (tags: string[]) => void; suggestions: TagOption[]; placeholder?: string }) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useClickOutside(open, () => setOpen(false))
  const q = tagKey(text)
  const taken = new Set(value.map(tagKey))
  const options = suggestions.filter((s) => !taken.has(tagKey(s.tag)) && (!q || tagKey(s.tag).includes(q))).slice(0, 8)

  const commit = (raw: string) => {
    const next = addTags(value, [raw])
    if (next.length !== value.length) onChange(next)
    setText('')
  }

  return (
    <div ref={ref} className="relative">
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface px-2 py-1.5 focus-within:border-accent"
        onClick={() => setOpen(true)}
      >
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-strong">
            {t}
            <button type="button" aria-label={`Tirar ${t}`} onClick={() => onChange(removeTags(value, [t]))} className="hover:opacity-70">
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          value={text}
          maxLength={MAX_TAG_LENGTH + 1}
          onChange={(e) => {
            const v = e.target.value
            if (v.includes(',')) { v.split(',').slice(0, -1).forEach(commit); setText(v.split(',').pop() ?? '') } else setText(v)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); if (normalizeTag(text)) commit(text) }
            else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
          }}
          placeholder={value.length === 0 ? placeholder : ''}
          className="min-w-[6rem] flex-1 bg-transparent px-1 py-0.5 text-sm text-text placeholder:text-muted focus:outline-none"
        />
      </div>
      {open && options.length > 0 && (
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-44 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-xl">
          {options.map((o) => (
            <button
              key={o.tag}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(o.tag)}
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-surface-2"
            >
              <span>{o.tag}</span>
              <span className="text-xs text-muted">{o.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Filtro de tags: botão que abre uma lista com pesquisa e seleção múltipla ("qualquer uma").
export function TagFilter({
  selected, onChange, options,
}: { selected: string[]; onChange: (tags: string[]) => void; options: TagOption[] }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useClickOutside(open, () => setOpen(false))
  const chosen = new Set(selected.map(tagKey))
  const key = tagKey(q)
  const shown = options.filter((o) => !key || tagKey(o.tag).includes(key))
  const label = selected.length === 0 ? 'Todas' : selected.length === 1 ? selected[0] : `${selected.length} tags`

  const toggle = (tag: string) => onChange(chosen.has(tagKey(tag)) ? removeTags(selected, [tag]) : addTags(selected, [tag]))

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setQ('') }}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-left text-sm text-text hover:bg-surface-2 focus:border-accent focus:outline-none md:min-w-[9rem]"
      >
        <span className="truncate">{label}</span>
        <ChevronDown size={14} className="shrink-0 text-muted" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface p-2 shadow-xl">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pesquisar tag"
            autoFocus
            className="mb-2 w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <div className="max-h-56 overflow-y-auto">
            {options.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted">Ainda não há tags. Adiciona-as ao editar um gasto.</p>
            ) : shown.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted">Nenhuma tag encontrada.</p>
            ) : (
              shown.map((o) => (
                <label key={o.tag} className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <input type="checkbox" checked={chosen.has(tagKey(o.tag))} onChange={() => toggle(o.tag)} />
                    <span className="truncate">{o.tag}</span>
                  </span>
                  <span className="text-xs text-muted">{o.count}</span>
                </label>
              ))
            )}
          </div>
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-accent-strong hover:bg-accent-soft">
              Limpar seleção
            </button>
          )}
        </div>
      )}
    </div>
  )
}

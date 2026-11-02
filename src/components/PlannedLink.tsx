import { useState } from 'react'
import { InfoHint, cx } from './ui'
import { fmtEUR, monthShort } from '../lib/format'
import { applyPlannedLink, type LinkEffect } from '../lib/calc/plannedLink'
import { usePlannedFocus } from '../lib/plannedFocus'
import { useStore } from '../store/useStore'
import type { PlannedMovement, SavingsMovement } from '../types'
import { ChevronDown, Search, TrendingUp } from 'lucide-react'

// "2026-11" -> "11/26"
const monthNumeric = (key: string): string => `${key.slice(5, 7)}/${key.slice(2, 4)}`
// Valor arredondado, sem cêntimos: 249,6 -> "250€".
const wholeEUR = (n: number): string => `${Math.round(n).toLocaleString('pt-PT', { maximumFractionDigits: 0 })}€`
const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

// ---------- Campo dentro do formulário de movimento ----------
// Mesmo padrão de "Saída para investimento": caixa por ativar e, quando ativa,
// uma lista simples (com pesquisa) dos movimentos previstos. Ao escolher um,
// aparece por baixo o que a saída é para o previsto: só uma parte, ou o total.

interface FieldProps {
  options: PlannedMovement[] // por ordem: este mês e o seguinte primeiro, depois os restantes
  checked: boolean
  onCheck: (checked: boolean) => void
  selectedId: string
  onSelect: (plannedId: string) => void
  effect: LinkEffect | '' // '' = ainda não escolheu
  onEffect: (effect: LinkEffect) => void
  spent: number | null // valor da saída já escrito (positivo)
  bucketName: (id: string) => string
}

export function PlannedLinkField({
  options, checked, onCheck, selectedId, onSelect, effect, onEffect, spent, bucketName,
}: FieldProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const active = checked
  const selected = options.find((m) => m.id === selectedId)
  const q = norm(query.trim())
  const list = q ? options.filter((m) => norm(`${m.description} ${bucketName(m.bucketId)}`).includes(q)) : options

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface-2 p-2.5">
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => { onCheck(e.target.checked); setOpen(false) }}
        />
        <span
          aria-hidden="true"
          className={cx(
            'h-3.5 w-3.5 shrink-0 rounded-full border-2 peer-focus-visible:ring-2 peer-focus-visible:ring-accent',
            active ? 'border-accent-strong bg-accent-strong' : 'border-border',
          )}
        />
        Ligar a um movimento previsto nas Projeções
      </label>

      {active && (
        <>
          {/* Mesmo aspeto do <Select> de "Saída para investimento". */}
          <div className="relative">
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface py-2 pl-3 pr-9 text-left text-sm text-text focus:border-accent focus:outline-none"
            >
              {selected ? (
                <PlannedRowContent m={selected} bucketName={bucketName} large />
              ) : (
                <span className="flex-1 truncate text-text">Escolhe o movimento previsto…</span>
              )}
            </button>
            <ChevronDown
              size={16}
              strokeWidth={2.5}
              aria-hidden="true"
              style={{ color: '#94a3b8' }}
              className="pointer-events-none absolute right-[0.7rem] top-1/2 -translate-y-1/2"
            />
          </div>

          {open && (
            <div className="rounded-xl border border-border bg-surface p-1.5">
              <div className="relative">
                <Search size={12} strokeWidth={2} aria-hidden="true" className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Procurar…"
                  aria-label="Procurar movimento previsto"
                  className="w-full rounded-lg border border-border bg-surface py-1 pl-6 pr-2 text-xs text-text placeholder:text-muted focus:border-accent focus:outline-none"
                />
              </div>
              <div role="listbox" aria-label="Movimentos previstos" className="thin-scroll mt-1 flex max-h-44 flex-col gap-0.5 overflow-y-auto">
                {list.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="option"
                    aria-selected={m.id === selectedId}
                    onClick={() => { onSelect(m.id); setOpen(false); setQuery('') }}
                    className={cx(
                      'flex w-full items-center rounded-lg px-2 py-1.5 text-left transition-colors',
                      m.id === selectedId ? 'bg-accent-soft' : 'hover:bg-surface-2',
                    )}
                  >
                    <PlannedRowContent m={m} bucketName={bucketName} />
                  </button>
                ))}
                {list.length === 0 && <p className="px-2 py-1.5 text-[11px] text-muted">Nenhum movimento previsto encontrado.</p>}
              </div>
            </div>
          )}

          {selected && (
            <EffectChoice planned={selected} spent={spent} effect={effect} onEffect={onEffect} />
          )}
        </>
      )}
    </div>
  )
}

// Uma linha só: título (corta com «…»), «(11/26 · Geral)» mais pequeno e valor arredondado.
function PlannedRowContent({ m, bucketName, large }: { m: PlannedMovement; bucketName: (id: string) => string; large?: boolean }) {
  return (
    <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
      <span className={cx('min-w-0 truncate text-text', large ? 'text-sm' : 'text-xs')}>{m.description || 'Sem descrição'}</span>
      <span className="max-w-[55%] shrink-0 truncate text-[10px] text-muted">{`(${monthNumeric(m.month)} · ${bucketName(m.bucketId)})`}</span>
      <span className={cx('tnum ml-auto shrink-0 font-medium text-text', large ? 'text-sm' : 'text-xs')}>{wholeEUR(Math.abs(m.amount))}</span>
    </span>
  )
}

// Duas opções lado a lado, minimalistas. A explicação da escolhida (com os números) aparece por baixo.
function EffectChoice({
  planned, spent, effect, onEffect,
}: { planned: PlannedMovement; spent: number | null; effect: LinkEffect | ''; onEffect: (e: LinkEffect) => void }) {
  const before = Math.abs(planned.amount)
  const part = spent ? applyPlannedLink(planned, spent, 'part') : null
  const total = spent ? applyPlannedLink(planned, spent, 'close') : null

  let help = 'Toca numa opção para veres o que acontece ao previsto.'
  if (effect === 'part') {
    help = part
      ? `O previsto desce de ${fmtEUR(before)} para ${fmtEUR(Math.abs(part.planned.amount))} e continua aberto, para as próximas compras.`
      : 'O previsto desce o valor da saída e continua aberto, para as próximas compras.'
  } else if (effect === 'close') {
    help = total
      ? `O previsto passa a ${fmtEUR(Math.abs(total.planned.amount))} e fica concluído.${before > (spent ?? 0) ? ` Os ${fmtEUR(before - (spent ?? 0))} que sobram deixam de contar nas projeções.` : ''}`
      : 'O previsto ajusta-se ao valor da saída e fica concluído. Já não conta nas projeções.'
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] text-muted">Esta saída é…</div>
      <div role="radiogroup" aria-label="O que esta saída é para o previsto" className="grid grid-cols-2 gap-1.5">
        {([['part', 'Só uma parte'], ['close', 'O valor total']] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={effect === id}
            onClick={() => onEffect(id)}
            className={cx(
              'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors',
              effect === id ? 'border-accent bg-accent-soft text-text' : 'border-border bg-surface text-text hover:bg-surface-2',
            )}
          >
            <span
              aria-hidden="true"
              className={cx('h-3.5 w-3.5 shrink-0 rounded-full border-2', effect === id ? 'border-accent-strong bg-accent-strong' : 'border-border')}
            />
            {label}
          </button>
        ))}
      </div>
      <p className="text-[11px] leading-snug text-muted">{help}</p>
      {effect === 'part' && part?.clamped && (
        <p className="text-[11px] text-warn">
          Gastaste mais do que restava no previsto, por isso ele fica a 0 €. Se esta era a última compra, escolhe «O valor total».
        </p>
      )}
    </div>
  )
}

// ---------- Ícone + balão nas listas de movimentos ----------

// Pequeno ícone (o das Projeções) em movimentos ligados a um previsto. Ao tocar,
// abre um balão. No computador há atalho para as Projeções; no telemóvel não
// existem Projeções, por isso só informa.
export function PlannedLinkBadge({ movement }: { movement: SavingsMovement }) {
  const planned = useStore((s) => s.data.plannedMovements.find((p) => p.id === movement.plannedLink?.plannedMovementId))
  const setScreen = useStore((s) => s.setScreen)
  const request = usePlannedFocus((s) => s.request)
  const link = movement.plannedLink
  if (!link || !planned) return null

  const effectText = link.effect === 'close'
    ? `Fechou o previsto, que ficou com ${fmtEUR(Math.abs(planned.amount))}.`
    : `Reduziu o previsto em ${fmtEUR(link.delta)}.`

  return (
    <InfoHint
      label="Ligado a um movimento previsto nas Projeções"
      icon={<TrendingUp size={15} strokeWidth={1.75} aria-hidden="true" />}
    >
      <div className="font-semibold">Ligado às Projeções</div>
      <p className="mt-1 text-muted">
        {`Movimento previsto «${planned.description || 'Sem descrição'}» (${monthShort(planned.month)}).`} {effectText}
      </p>
      <button
        type="button"
        onClick={() => { request(planned.id); setScreen('projecoes') }}
        className="mt-2 hidden rounded-lg bg-accent-strong px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 md:inline-block"
      >
        Ver nas Projeções
      </button>
      <p className="mt-2 text-muted md:hidden">Vê os detalhes no computador, em Projeções.</p>
    </InfoHint>
  )
}

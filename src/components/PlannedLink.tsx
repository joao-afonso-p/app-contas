import { useState } from 'react'
import { InfoHint, Modal, Button, cx } from './ui'
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
// uma lista simples (com pesquisa) dos movimentos previstos.

interface FieldProps {
  options: PlannedMovement[] // por ordem: este mês e o seguinte primeiro, depois os restantes
  checked: boolean
  onCheck: (checked: boolean) => void
  selectedId: string
  onSelect: (plannedId: string) => void
  bucketName: (id: string) => string
}

export function PlannedLinkField({ options, checked, onCheck, selectedId, onSelect, bucketName }: FieldProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
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
            checked ? 'border-accent-strong bg-accent-strong' : 'border-border',
          )}
        />
        Ligar a um movimento previsto nas Projeções
      </label>

      {checked && (
        <>
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-left text-sm text-text focus:border-accent focus:outline-none"
          >
            {selected ? (
              <PlannedRowContent m={selected} bucketName={bucketName} />
            ) : (
              <span className="flex-1 text-muted">Escolher o movimento previsto…</span>
            )}
            <ChevronDown size={14} strokeWidth={2} aria-hidden="true" className={cx('shrink-0 text-muted transition-transform', open && 'rotate-180')} />
          </button>

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
                      'flex w-full items-center rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
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
        </>
      )}
    </div>
  )
}

// Uma linha só: título (corta com «…»), «(11/26 · Geral)» mais pequeno e valor arredondado.
function PlannedRowContent({ m, bucketName }: { m: PlannedMovement; bucketName: (id: string) => string }) {
  return (
    <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
      <span className="min-w-0 truncate text-xs text-text">{m.description || 'Sem descrição'}</span>
      <span className="max-w-[55%] shrink-0 truncate text-[10px] text-muted">{`(${monthNumeric(m.month)} · ${bucketName(m.bucketId)})`}</span>
      <span className="tnum ml-auto shrink-0 text-xs font-medium text-text">{wholeEUR(Math.abs(m.amount))}</span>
    </span>
  )
}

// ---------- Pop-up mínimo: o que é este movimento para o previsto? ----------
// Abre ao guardar um movimento ligado. Mostra o resultado e só então confirma.

interface ConfirmProps {
  planned: PlannedMovement
  spent: number // valor da saída (positivo)
  initialEffect: LinkEffect
  bucketName: (id: string) => string
  onCancel: () => void
  onConfirm: (effect: LinkEffect) => void
}

// Monta-se só quando é preciso (ver Movimentos), por isso a escolha começa sempre em `initialEffect`.
export function PlannedLinkConfirm({ planned, spent, initialEffect, bucketName, onCancel, onConfirm }: ConfirmProps) {
  const [effect, setEffect] = useState<LinkEffect>(initialEffect)

  const before = Math.abs(planned.amount)
  const part = applyPlannedLink(planned, spent, 'part')
  const total = applyPlannedLink(planned, spent, 'close')

  return (
    <Modal open onClose={onCancel} title="Ligar ao movimento previsto">
      <div className="flex flex-col gap-3">
        <div className="rounded-xl bg-surface-2 px-3 py-2">
          <PlannedRowContent m={planned} bucketName={bucketName} />
          <div className="mt-0.5 text-[11px] text-muted">{`Esta saída: ${fmtEUR(spent)}`}</div>
        </div>

        <div className="text-xs font-medium text-text">Esta saída corresponde a…</div>
        <div role="radiogroup" className="flex flex-col gap-1.5">
          <EffectOption
            checked={effect === 'part'}
            onClick={() => setEffect('part')}
            title="Só uma parte do previsto"
            text={`O previsto desce de ${fmtEUR(before)} para ${fmtEUR(Math.abs(part.planned.amount))} e continua aberto, para as próximas compras.`}
          />
          <EffectOption
            checked={effect === 'close'}
            onClick={() => setEffect('close')}
            title="O valor total do previsto"
            text={`O previsto passa a ${fmtEUR(Math.abs(total.planned.amount))} e fica concluído.${before > spent ? ` Os ${fmtEUR(before - spent)} que sobram deixam de contar nas projeções.` : ''}`}
          />
        </div>
        {effect === 'part' && part.clamped && (
          <p className="text-[11px] text-warn">
            Gastaste mais do que restava no previsto, por isso ele fica a 0 €. Se esta era a última compra, escolhe «O valor total».
          </p>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Voltar</Button>
          <Button onClick={() => onConfirm(effect)}>Confirmar e guardar</Button>
        </div>
      </div>
    </Modal>
  )
}

function EffectOption({
  checked, onClick, title, text,
}: { checked: boolean; onClick: () => void; title: string; text: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={cx(
        'flex w-full items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors',
        checked ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:bg-surface-2',
      )}
    >
      <span
        aria-hidden="true"
        className={cx('mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2', checked ? 'border-accent-strong bg-accent-strong' : 'border-border')}
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium leading-tight text-text">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-muted">{text}</span>
      </span>
    </button>
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

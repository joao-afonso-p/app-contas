import { useState } from 'react'
import { InfoHint, cx } from './ui'
import { fmtEUR, monthShort } from '../lib/format'
import { applyPlannedLink, type LinkEffect } from '../lib/calc/plannedLink'
import { usePlannedFocus } from '../lib/plannedFocus'
import { useStore } from '../store/useStore'
import type { PlannedMovement, SavingsMovement } from '../types'
import { TrendingUp } from 'lucide-react'

// ---------- Seletor dentro do formulário de movimento ----------

interface PickerProps {
  main: PlannedMovement[]
  later: PlannedMovement[]
  selectedId: string
  effect: LinkEffect
  spent: number | null // valor da saída já escrito (positivo), ou null se ainda não há
  bucketName: (id: string) => string
  onChange: (plannedId: string, effect: LinkEffect) => void
}

export function PlannedLinkPicker({ main, later, selectedId, effect, spent, bucketName, onChange }: PickerProps) {
  const [more, setMore] = useState(false)
  const showLater = more || later.some((m) => m.id === selectedId)
  const list = showLater ? [...main, ...later] : main
  const selected = [...main, ...later].find((m) => m.id === selectedId)

  const outcome = selected && spent ? applyPlannedLink(selected, spent, effect) : null
  const before = selected ? Math.abs(selected.amount) : 0

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-2 p-3">
      <div>
        <div className="text-xs font-semibold text-text">Ligar a um movimento previsto nas Projeções (opcional)</div>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">
          Usa isto se esta saída faz parte de um orçamento que criaste nas Projeções, como «Prendas de Natal». Assim o
          previsto acompanha o que já gastaste.
        </p>
      </div>

      <div role="radiogroup" aria-label="Movimento previsto" className="flex flex-col gap-1.5">
        <PlannedOption
          selected={selectedId === ''}
          onClick={() => onChange('', effect)}
          title="Não ligar a nenhum"
        />
        {list.map((m) => (
          <PlannedOption
            key={m.id}
            selected={selectedId === m.id}
            onClick={() => onChange(m.id, effect)}
            title={m.description || 'Sem descrição'}
            meta={`${monthShort(m.month)} · ${bucketName(m.bucketId)}`}
            amount={fmtEUR(Math.abs(m.amount))}
          />
        ))}
      </div>

      {!showLater && later.length > 0 && (
        <button type="button" onClick={() => setMore(true)} className="self-start text-xs font-semibold text-accent-strong hover:underline">
          {`Mostrar mais (${later.length})`}
        </button>
      )}

      {selected && (
        <div className="mt-1 flex flex-col gap-2 border-t border-border pt-3">
          <div className="text-xs font-semibold text-text">Este movimento corresponde a…</div>
          <EffectOption
            checked={effect === 'part'}
            onClick={() => onChange(selectedId, 'part')}
            title="Só uma parte do previsto"
            text={
              spent
                ? `O previsto desce ${fmtEUR(Math.min(spent, before))}: de ${fmtEUR(before)} para ${fmtEUR(Math.max(before - spent, 0))}. Continua aberto, para as próximas compras.`
                : 'O previsto desce o valor que gastaste e continua aberto, para as próximas compras.'
            }
          />
          <EffectOption
            checked={effect === 'close'}
            onClick={() => onChange(selectedId, 'close')}
            title="O valor total do previsto"
            text={
              spent
                ? `O previsto passa a ${fmtEUR(spent)} e fica concluído.${before > spent ? ` Os ${fmtEUR(before - spent)} que sobram deixam de contar nas projeções.` : ''}`
                : 'O previsto ajusta-se ao valor que gastaste e fica concluído. Já não conta nas projeções.'
            }
          />
          {!spent && <p className="text-xs text-muted">Indica o valor da saída acima para veres o resultado.</p>}
          {outcome?.clamped && (
            <p className="text-xs text-warn">
              Gastaste mais do que restava no previsto. Ele fica a 0 €. Se esta era a última compra, escolhe «O valor total».
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function PlannedOption({
  selected, onClick, title, meta, amount,
}: { selected: boolean; onClick: () => void; title: string; meta?: string; amount?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
        selected ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:bg-surface-2',
      )}
    >
      <span
        aria-hidden="true"
        className={cx('h-3.5 w-3.5 shrink-0 rounded-full border-2', selected ? 'border-accent-strong bg-accent-strong' : 'border-border')}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text">{title}</span>
        {meta && <span className="block truncate text-xs text-muted">{meta}</span>}
      </span>
      {amount && <span className="tnum shrink-0 text-sm font-semibold text-text">{amount}</span>}
    </button>
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
        'flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
        checked ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:bg-surface-2',
      )}
    >
      <span
        aria-hidden="true"
        className={cx('mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2', checked ? 'border-accent-strong bg-accent-strong' : 'border-border')}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted">{text}</span>
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

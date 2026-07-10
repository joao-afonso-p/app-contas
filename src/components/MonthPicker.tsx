import { addMonths, currentMonthKey, monthLabel } from '../lib/format'
import type { MonthKey } from '../types'
import { cx } from './ui'

export function MonthPicker({
  month, onChange, minMonth,
}: {
  month: MonthKey
  onChange: (m: MonthKey) => void
  minMonth?: MonthKey
}) {
  const isCurrent = month === currentMonthKey()
  const atMin = minMonth !== undefined && month <= minMonth
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(addMonths(month, -1))}
        disabled={atMin}
        className="rounded-xl border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface"
        aria-label="Mês anterior"
      >
        ‹
      </button>
      <button
        onClick={() => onChange(currentMonthKey())}
        className={cx(
          'min-w-36 rounded-xl border px-3 py-1.5 text-center text-sm font-semibold capitalize',
          isCurrent ? 'border-accent bg-accent-soft text-accent-strong' : 'border-border bg-surface hover:bg-surface-2',
        )}
        title="Voltar ao mês atual"
      >
        {monthLabel(month, true)}
      </button>
      <button
        onClick={() => onChange(addMonths(month, 1))}
        className="rounded-xl border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
        aria-label="Mês seguinte"
      >
        ›
      </button>
    </div>
  )
}

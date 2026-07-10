import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { fmtEUR, parseAmount } from '../lib/format'

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-2xl border border-border bg-surface p-4 shadow-sm', className)}>
      {children}
    </div>
  )
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{children}</h2>
      {right}
    </div>
  )
}

export function MetricCard({
  label, value, hint, tone = 'default', title,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'positive' | 'negative' | 'warn' | 'accent'
  title?: string
}) {
  const tones = {
    default: 'text-text',
    positive: 'text-positive',
    negative: 'text-negative',
    warn: 'text-warn',
    accent: 'text-accent-strong',
  }
  return (
    <Card className="min-w-0" >
      <div className="text-xs font-medium text-muted" title={title}>{label}</div>
      <div className={cx('tnum mt-1 truncate text-2xl font-bold', tones[tone])} title={title}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </Card>
  )
}

export function Button({
  children, onClick, variant = 'primary', size = 'md', disabled, type = 'button', className, 'aria-label': ariaLabel,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger' | 'soft'
  size?: 'sm' | 'md'
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
  'aria-label'?: string
}) {
  const variants = {
    primary: 'bg-accent-strong text-white hover:opacity-90',
    soft: 'bg-accent-soft text-accent-strong hover:opacity-80',
    ghost: 'border border-border bg-surface text-text hover:bg-surface-2',
    danger: 'bg-negative/10 text-negative hover:bg-negative/20',
  }
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-4 py-2 text-sm' }
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      className={cx(
        'rounded-xl font-semibold transition-all active:scale-[0.98] disabled:opacity-40',
        variants[variant], sizes[size], className,
      )}
    >
      {children}
    </button>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        'w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text',
        'placeholder:text-muted focus:border-accent focus:outline-none',
        props.className,
      )}
    />
  )
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(
        'rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none',
        props.className,
      )}
    />
  )
}

export function Badge({
  children, tone = 'neutral',
}: { children: ReactNode; tone?: 'neutral' | 'accent' | 'goal' | 'warn' | 'negative' }) {
  const tones = {
    neutral: 'bg-surface-2 text-muted',
    accent: 'bg-accent-soft text-accent-strong',
    goal: 'bg-goal-soft text-goal',
    warn: 'bg-warn-soft text-warn',
    negative: 'bg-negative/10 text-negative',
  }
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', tones[tone])}>
      {children}
    </span>
  )
}

export function ProgressBar({
  pct, tone = 'accent', className,
}: { pct: number; tone?: 'accent' | 'goal' | 'warn' | 'negative'; className?: string }) {
  const tones = {
    accent: 'bg-accent-strong',
    goal: 'bg-goal',
    warn: 'bg-warn',
    negative: 'bg-negative',
  }
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-surface-2', className)}>
      <div
        className={cx('h-full rounded-full transition-all duration-500', tones[tone])}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  )
}

export function Modal({
  open, onClose, title, children, wide,
}: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className={cx(
          'fade-up max-h-[80vh] w-full overflow-y-auto rounded-2xl bg-surface p-5 shadow-xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-md',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-surface-2" aria-label="Fechar">✕</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border py-10 text-center">
      <div className="text-sm font-semibold text-muted">{title}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  )
}

// Valor monetário com sinal/cor
export function Money({ value, className, compact }: { value: number; className?: string; compact?: boolean }) {
  return (
    <span className={cx('tnum', value < 0 ? 'text-negative' : '', className)}>
      {fmtEUR(value, compact)}
    </span>
  )
}

// Célula de edição inline de valores €: mostra formatado, edita em texto livre
// (aceita vírgula decimal), grava em blur/Enter, Esc cancela.
export function MoneyCell({
  value, onChange, className, placeholder = '—', disabled,
}: {
  value: number | undefined
  onChange: (v: number) => void
  className?: string
  placeholder?: string
  disabled?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) ref.current?.select()
  }, [editing])

  const commit = () => {
    setEditing(false)
    const parsed = parseAmount(draft)
    if (parsed !== null && parsed !== value) onChange(parsed)
  }

  if (editing) {
    return (
      <input
        ref={ref}
        inputMode="decimal"
        className={cx('tnum w-24 rounded-lg border border-accent bg-surface px-2 py-1 text-right text-sm focus:outline-none', className)}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }
  return (
    <button
      disabled={disabled}
      onClick={() => {
        setDraft(value ? String(value).replace('.', ',') : '')
        setEditing(true)
      }}
      className={cx(
        'tnum rounded-lg px-2 py-1 text-right text-sm transition-colors',
        disabled ? 'cursor-default' : 'hover:bg-surface-2',
        !value && 'text-muted',
        className,
      )}
    >
      {value ? fmtEUR(value) : placeholder}
    </button>
  )
}

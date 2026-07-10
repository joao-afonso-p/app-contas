import type { ReactNode } from 'react'
import { Money, MoneyCell } from './ui'
import type { MonthKey } from '../types'

export function SpacerRow({ span }: { span: number }) {
  return (
    <tr aria-hidden="true">
      <td colSpan={span} className="h-3" />
    </tr>
  )
}

export function GroupHeader({ label, span }: { label: string; span: number }) {
  return (
    <tr>
      <td colSpan={span} className="bg-surface-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
        {label}
      </td>
    </tr>
  )
}

export function EditableRow({
  label, badge, months, getValue, onChange,
}: {
  label: ReactNode
  badge?: ReactNode
  months: MonthKey[]
  getValue: (m: MonthKey) => number
  onChange: (m: MonthKey, v: number) => void
}) {
  return (
    <tr className="border-t border-border">
      <td className="sticky left-0 z-10 bg-surface px-3 py-1.5 text-xs font-medium text-text">
        <span className="flex items-center gap-1.5">{label}{badge}</span>
      </td>
      {months.map((m) => (
        <td key={m} className="px-1 py-1 text-right">
          <MoneyCell value={getValue(m)} onChange={(v) => onChange(m, v)} />
        </td>
      ))}
    </tr>
  )
}

// Igual ao EditableRow mas sem edição — para tabelas de histórico/consulta.
export function StaticRow({
  label, badge, months, getValue,
}: {
  label: ReactNode
  badge?: ReactNode
  months: MonthKey[]
  getValue: (m: MonthKey) => number
}) {
  return (
    <tr className="border-t border-border">
      <td className="sticky left-0 z-10 bg-surface px-3 py-1.5 text-xs font-medium text-text">
        <span className="flex items-center gap-1.5">{label}{badge}</span>
      </td>
      {months.map((m) => (
        <td key={m} className="tnum px-3 py-1.5 text-right text-xs">
          <Money value={getValue(m)} />
        </td>
      ))}
    </tr>
  )
}

export function TotalRow({
  label, months, getValue,
}: {
  label: string
  months: MonthKey[]
  getValue: (m: MonthKey) => number
}) {
  return (
    <tr className="border-t border-border bg-surface-2 font-bold">
      <td className="sticky left-0 z-10 bg-surface-2 px-3 py-1.5 text-xs">{label}</td>
      {months.map((m) => (
        <td key={m} className="px-3 py-1.5 text-right">
          <Money value={getValue(m)} className="text-xs" />
        </td>
      ))}
    </tr>
  )
}

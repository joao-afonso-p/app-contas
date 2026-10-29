import { fmtEUR } from '../lib/format'

// Peças partilhadas dos gráficos: tooltip e legenda compactas, na linguagem
// visual da app (em vez das predefinições do recharts, que pintam o texto com
// a cor de cada série e ocupam muito espaço).

interface Entry {
  name?: string | number
  value?: number | string | null
  color?: string
  stroke?: string
  fill?: string
  dataKey?: string | number
}

export function ChartTooltip({
  active, payload, label, format = fmtEUR, total = false,
}: {
  active?: boolean
  payload?: Entry[]
  label?: string | number
  format?: (v: number) => string
  // Mostra a soma no fim (para gráficos empilhados).
  total?: boolean
}) {
  if (!active || !payload?.length) return null
  const rows = payload
    .filter((p) => typeof p.value === 'number' && (total ? Math.abs(p.value as number) > 0.004 : true))
    .map((p) => ({
      name: String(p.name ?? p.dataKey ?? ''),
      value: p.value as number,
      color: p.color ?? p.stroke ?? p.fill ?? 'var(--muted)',
    }))
  if (total) rows.sort((a, b) => b.value - a.value)
  if (rows.length === 0) return null
  const sum = rows.reduce((s, r) => s + r.value, 0)
  return (
    <div className="min-w-44 max-w-64 rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1.5 font-semibold capitalize text-text">{label}</div>
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center justify-between gap-4">
            <span className="flex min-w-0 items-center gap-1.5 text-muted">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
              <span className="truncate">{r.name}</span>
            </span>
            <span className="tnum shrink-0 font-medium text-text">{format(r.value)}</span>
          </li>
        ))}
      </ul>
      {total && rows.length > 1 && (
        <div className="mt-1.5 flex items-center justify-between gap-4 border-t border-border pt-1.5 font-semibold text-text">
          <span>Total</span>
          <span className="tnum">{format(sum)}</span>
        </div>
      )}
    </div>
  )
}

export function ChartLegend({ payload }: { payload?: { value?: string | number; color?: string }[] }) {
  if (!payload?.length) return null
  return (
    <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted">
      {payload.map((p) => (
        <li key={String(p.value)} className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
          {p.value}
        </li>
      ))}
    </ul>
  )
}

export const cursorStyle = { fill: 'var(--surface-2)', opacity: 0.7 }

// Eixo Y compacto: 1.200 € → "1,2k".
export const compactEUR = (v: number): string =>
  Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('pt-PT', { maximumFractionDigits: 1 })}k` : String(v)

// Etiqueta por cima de cada barra com a diferença face ao planeado: "+120 €"
// (gastou a mais) ou "−80 €" (gastou a menos). Usa-se em <LabelList content=…>.
export function diffLabelRenderer(data: { gasto: number; planeado: number | null }[]) {
  return function DiffLabel(props: { x?: number | string; y?: number | string; width?: number | string; index?: number }) {
    const d = data[props.index ?? -1]
    if (!d || d.planeado === null || d.planeado === undefined) return null
    const diff = Math.round((d.gasto - d.planeado) * 100) / 100
    if (Math.abs(diff) < 0.5) return null
    const x = Number(props.x ?? 0) + Number(props.width ?? 0) / 2
    const y = Number(props.y ?? 0) - 6
    return (
      <text
        x={x} y={y} textAnchor="middle" fontSize={11} fontWeight={700}
        fill="var(--text)" stroke="var(--surface)" strokeWidth={3} paintOrder="stroke"
      >
        {`${diff > 0 ? '+' : '−'}${fmtEUR(Math.abs(diff), true)}`}
      </text>
    )
  }
}

import { Badge, Button, Card, Money, SectionTitle } from './ui'
import { monthLabel } from '../lib/format'
import { useStore } from '../store/useStore'
import type { MonthKey } from '../types'

// Lembrete dos incomes "chega depois" (ex.: rendas) de um mês já aplicado:
// o que ainda falta transferir para a poupança quando o dinheiro entrar.
export function LateIncomeCard({ month, onlyPending = false }: { month: MonthKey; onlyPending?: boolean }) {
  const data = useStore((s) => s.data)
  const setLateTransferred = useStore((s) => s.setLateTransferred)

  const plan = data.monthlyPlans.find((p) => p.id === month)
  if (!plan || plan.closed === false) return null

  const items = data.incomeSources
    .filter((s) => s.isRent && (plan.income[s.id] || 0) > 0.004)
    .map((s) => ({ source: s, amount: plan.income[s.id] || 0, done: Boolean(plan.lateTransferred?.[s.id]) }))
    .filter((i) => !onlyPending || !i.done)
  if (items.length === 0) return null

  return (
    <Card>
      <SectionTitle>A transferir quando chegar · {monthLabel(month, true)}</SectionTitle>
      <ul className="divide-y divide-border">
        {items.map(({ source, amount, done }) => (
          <li key={source.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{source.name}</span>
                {done && <Badge tone="accent">✓ Transferido</Badge>}
              </div>
              <div className="text-xs text-muted">
                {done ? 'já passaste para a poupança' : source.expectedDay ? `previsto ~dia ${source.expectedDay}` : 'quando entrar'}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Money whole value={amount} className="text-sm font-semibold" />
              <Button
                size="sm"
                variant={done ? 'ghost' : 'soft'}
                onClick={() => void setLateTransferred(month, source.id, !done)}
              >
                {done ? 'Desfazer' : 'Já transferi'}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

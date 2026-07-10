import type {
  BalanceOverride,
  MonthKey,
  MonthlyPlan,
  SavingsBucket,
  SavingsMovement,
} from '../../types'
import { monthOfDate, monthRange } from '../format'
import { round2 } from './allocation'

// Saldo de cada balde, mês a mês. SEMPRE calculado:
// saldo(mês) = saldo(mês-1) + alocado no planeamento(mês) + movimentos(mês)
// Um override (month, bucketId, balance) fixa o saldo nesse mês e o cálculo
// continua a partir daí (usado nas projeções e em ajustes à realidade).

export type BalanceTable = Map<string, Map<MonthKey, number>> // bucketId -> month -> saldo

export interface BalanceInputs {
  buckets: SavingsBucket[]
  plans: Pick<MonthlyPlan, 'id' | 'savings' | 'closed'>[]
  movements: SavingsMovement[]
  overrides?: BalanceOverride[]
  from: MonthKey
  to: MonthKey
}

export function computeBalances({ buckets, plans, movements, overrides = [], from, to }: BalanceInputs): BalanceTable {
  const months = monthRange(from, to)
  const planByMonth = new Map(plans.map((p) => [p.id, p]))

  const movByBucketMonth = new Map<string, number>()
  for (const m of movements) {
    const key = `${m.bucketId}_${monthOfDate(m.date)}`
    movByBucketMonth.set(key, (movByBucketMonth.get(key) || 0) + m.amount)
  }

  const overrideByBucketMonth = new Map(overrides.map((o) => [`${o.bucketId}_${o.month}`, o.balance]))

  const table: BalanceTable = new Map()
  for (const bucket of buckets) {
    const row = new Map<MonthKey, number>()
    let running = 0
    for (const month of months) {
      const override = overrideByBucketMonth.get(`${bucket.id}_${month}`)
      if (override !== undefined) {
        running = override
      } else {
        const monthPlan = planByMonth.get(month)
        // Rascunho (closed === false) ainda não conta para os saldos — só depois
        // de o utilizador aplicar o plano (ver `applyPlan`/`Planeamento.tsx`).
        if (!monthPlan || monthPlan.closed !== false) {
          running += monthPlan?.savings[bucket.id] || 0
        }
        running += movByBucketMonth.get(`${bucket.id}_${month}`) || 0
      }
      row.set(month, round2(running))
    }
    table.set(bucket.id, row)
  }
  return table
}

export function bucketBalance(table: BalanceTable, bucketId: string, month: MonthKey): number {
  return table.get(bucketId)?.get(month) ?? 0
}

export function totalBalance(table: BalanceTable, month: MonthKey): number {
  let total = 0
  for (const row of table.values()) total += row.get(month) ?? 0
  return round2(total)
}

// Progresso de um objetivo: usa o saldo atual do balde
export function goalProgress(current: number, target: number): number {
  if (target <= 0) return 100
  return Math.min(100, Math.max(0, (current / target) * 100))
}

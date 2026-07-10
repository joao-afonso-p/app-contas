import { useMemo } from 'react'
import { Badge, Button, Card, SectionTitle, cx } from '../components/ui'
import { GroupHeader, SpacerRow, StaticRow, TotalRow } from '../components/PlanTable'
import { allocationSummary } from '../lib/calc/allocation'
import { bucketBalance, computeBalances, totalBalance, type BalanceTable } from '../lib/calc/balances'
import { currentMonthKey, fmtEUR, monthRange, monthShort } from '../lib/format'
import {
  activeBuckets, activeExpenseCategories, activeIncomeSources, activeVehicles, firstPlanMonth, useStore,
} from '../store/useStore'

export function Historico() {
  const data = useStore((s) => s.data)
  const setScreen = useStore((s) => s.setScreen)

  const currentMonth = currentMonthKey()
  const months = useMemo(
    () => monthRange(firstPlanMonth(data), currentMonth),
    [data, currentMonth],
  )

  const incomeSources = activeIncomeSources(data)
  const expenseCategories = activeExpenseCategories(data)
  const buckets = activeBuckets(data)
  const vehicles = activeVehicles(data)

  const planByMonth = useMemo(
    () => new Map(data.monthlyPlans.map((p) => [p.id, p])),
    [data.monthlyPlans],
  )

  const balanceTable: BalanceTable = useMemo(
    () =>
      computeBalances({
        buckets,
        plans: data.monthlyPlans,
        movements: data.savingsMovements,
        overrides: data.balanceOverrides,
        from: firstPlanMonth(data),
        to: currentMonth,
      }),
    [data, buckets, currentMonth],
  )

  return (
    <div className="fade-up flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setScreen('planeamento')}>‹ Voltar</Button>
          <h1 className="text-xl font-black">Histórico</h1>
        </div>
      </div>

      <section>
        <SectionTitle>Saldos reais</SectionTitle>
        <Card className="p-0">
          <div className="max-h-[70vh] overflow-auto thin-scroll">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 bg-surface px-3 py-2 text-left align-bottom text-xs font-semibold text-muted">
                    Categoria
                  </th>
                  {months.map((m) => (
                    <th
                      key={m}
                      className="sticky top-0 z-20 whitespace-nowrap bg-surface px-3 py-2 text-right align-bottom"
                    >
                      <div className={cx('tnum text-xs font-semibold', m === currentMonth ? 'text-accent-strong' : 'text-muted')}>
                        {monthShort(m)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <GroupHeader label="Income" span={months.length + 1} />
                {incomeSources.map((s) => (
                  <StaticRow
                    key={s.id}
                    label={s.name}
                    months={months}
                    getValue={(m) => planByMonth.get(m)?.income[s.id] ?? 0}
                  />
                ))}
                <TotalRow
                  label="Total Income"
                  months={months}
                  getValue={(m) => allocationSummary(planByMonth.get(m), incomeSources).totalIncome}
                />

                <SpacerRow span={months.length + 1} />
                <GroupHeader label="Despesas" span={months.length + 1} />
                {expenseCategories.map((c) => (
                  <StaticRow
                    key={c.id}
                    label={c.name}
                    months={months}
                    getValue={(m) => planByMonth.get(m)?.expenses[c.id] ?? 0}
                  />
                ))}
                <TotalRow
                  label="Total Despesas"
                  months={months}
                  getValue={(m) => allocationSummary(planByMonth.get(m), incomeSources).totalExpenses}
                />

                <SpacerRow span={months.length + 1} />
                <GroupHeader label="Poupanças" span={months.length + 1} />
                {buckets.map((b) => (
                  <StaticRow
                    key={b.id}
                    label={b.name}
                    badge={b.kind === 'goal' ? <Badge tone="goal">Objetivo</Badge> : undefined}
                    months={months}
                    getValue={(m) => planByMonth.get(m)?.savings[b.id] ?? 0}
                  />
                ))}
                <SpacerRow span={months.length + 1} />
                <TotalRow
                  label="Total Poupanças"
                  months={months}
                  getValue={(m) => allocationSummary(planByMonth.get(m), incomeSources).totalSavings}
                />

                {vehicles.length > 0 && (
                  <>
                    <SpacerRow span={months.length + 1} />
                    <GroupHeader label="Débitos automáticos" span={months.length + 1} />
                    {vehicles.map((v) => (
                      <StaticRow
                        key={v.id}
                        label={v.name}
                        months={months}
                        getValue={(m) => planByMonth.get(m)?.autoInvestments?.[v.id] ?? 0}
                      />
                    ))}
                    <TotalRow
                      label="Total Débitos automáticos"
                      months={months}
                      getValue={(m) => allocationSummary(planByMonth.get(m), incomeSources).totalAutoInvestments}
                    />
                  </>
                )}

                <SpacerRow span={months.length + 1} />
                <GroupHeader label="Saldos" span={months.length + 1} />
                {buckets.map((b) => (
                  <tr key={b.id} className="border-t border-border">
                    <td className="sticky left-0 z-10 bg-surface px-3 py-1.5 text-xs font-medium text-text">
                      <span className="flex items-center gap-1.5">
                        {b.name}
                        {b.kind === 'goal' && <Badge tone="goal">Objetivo</Badge>}
                      </span>
                    </td>
                    {months.map((m) => (
                      <td key={m} className="tnum px-3 py-1.5 text-right text-xs">
                        {fmtEUR(bucketBalance(balanceTable, b.id, m))}
                      </td>
                    ))}
                  </tr>
                ))}
                <TotalRow label="Total" months={months} getValue={(m) => totalBalance(balanceTable, m)} />
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <p className="text-xs text-muted">
        Valores reais registados nos planeamentos mensais e nos movimentos de poupança até {monthShort(currentMonth)}.
        Consulta apenas — para editar, usa o Planeamento.
      </p>
    </div>
  )
}

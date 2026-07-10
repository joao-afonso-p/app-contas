import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge, Card, MetricCard, MoneyCell, SectionTitle, Select, cx } from '../components/ui'
import { budgetStatus, capFor, computeSpend, monthTotals } from '../lib/calc/budgets'
import { addMonths, currentMonthKey, fmtEUR, monthRange, monthShort } from '../lib/format'
import { useStore } from '../store/useStore'

export function Budgets() {
  const data = useStore((s) => s.data)
  const put = useStore((s) => s.put)
  const remove = useStore((s) => s.remove)

  const currentMonth = currentMonthKey()
  const months = useMemo(() => monthRange(addMonths(currentMonth, -5), currentMonth), [currentMonth])

  const spend = useMemo(() => computeSpend(data.transactions), [data.transactions])
  const totals = useMemo(() => monthTotals(data.transactions), [data.transactions])

  const categories = useMemo(
    () => data.transactionCategories.filter((c) => !c.archived).sort((a, b) => a.order - b.order),
    [data.transactionCategories],
  )

  const categoriesWithData = useMemo(
    () =>
      categories.filter((c) => {
        const hasSpend = months.some((m) => (spend.get(c.id)?.get(m) ?? 0) > 0)
        const hasCap = capFor(data.budgets, c.id) !== undefined
        return hasSpend || hasCap
      }),
    [categories, months, spend, data.budgets],
  )

  const categoriesWithSpend = useMemo(
    () => categories.filter((c) => months.some((m) => (spend.get(c.id)?.get(m) ?? 0) > 0)),
    [categories, months, spend],
  )

  const currentTotal = totals.get(currentMonth)?.total ?? 0
  const currentSemPoupanca = totals.get(currentMonth)?.semPoupanca ?? 0

  const chartData = months.map((m) => ({
    month: monthShort(m),
    total: totals.get(m)?.total ?? 0,
    semPoupanca: totals.get(m)?.semPoupanca ?? 0,
  }))

  const alerts = categoriesWithSpend
    .map((c) => {
      const cap = capFor(data.budgets, c.id)
      if (cap === undefined) return null
      const spent = spend.get(c.id)?.get(currentMonth) ?? 0
      const status = budgetStatus(spent, cap)
      if (status === 'ok') return null
      return { category: c, cap, spent, status }
    })
    .filter((a): a is { category: (typeof categoriesWithSpend)[number]; cap: number; spent: number; status: 'warn' | 'over' } => a !== null)

  const [selectedId, setSelectedId] = useState<string>('')
  const selected = categoriesWithSpend.find((c) => c.id === selectedId) ?? categoriesWithSpend[0]
  const selectedCap = selected ? capFor(data.budgets, selected.id) : undefined
  const selectedChartData = selected
    ? months.map((m) => ({ month: monthShort(m), gasto: spend.get(selected.id)?.get(m) ?? 0 }))
    : []

  return (
    <div className="fade-up flex flex-col gap-6">
      <h1 className="text-xl font-black">Budgets</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricCard label="Gasto este mês" value={fmtEUR(currentTotal)} />
        <MetricCard
          label="Sem reposições de poupança"
          value={fmtEUR(currentSemPoupanca)}
          hint="exclui gastos repostos de baldes"
        />
      </div>

      <section>
        <SectionTitle>Total por mês</SectionTitle>
        <Card>
          <ResponsiveContainer height={280}>
            <BarChart data={chartData}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)' }}
                formatter={(value: number) => fmtEUR(value)}
              />
              <Legend />
              <Bar dataKey="total" name="Total" fill="var(--accent-strong)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="semPoupanca" name="Sem poupança" fill="var(--goal)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </section>

      <section>
        <SectionTitle>Por categoria</SectionTitle>
        <Card className="overflow-x-auto thin-scroll">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-muted">
                <th className="py-1.5 pr-3">Categoria</th>
                {months.map((m) => (
                  <th key={m} className={cx('px-2 py-1.5 text-right', m === currentMonth && 'font-semibold text-text')}>
                    {monthShort(m)}
                  </th>
                ))}
                <th className="px-2 py-1.5 text-right">Teto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {categoriesWithData.map((c) => {
                const cap = capFor(data.budgets, c.id)
                return (
                  <tr key={c.id}>
                    <td className="py-2 pr-3 font-medium">{c.name}</td>
                    {months.map((m) => {
                      const spent = spend.get(c.id)?.get(m) ?? 0
                      const status = cap !== undefined ? budgetStatus(spent, cap) : 'ok'
                      return (
                        <td
                          key={m}
                          className={cx(
                            'tnum px-2 py-2 text-right',
                            m === currentMonth && 'bg-surface-2',
                            status === 'over' && 'font-semibold text-negative',
                            status === 'warn' && 'text-warn',
                          )}
                        >
                          {spent ? fmtEUR(spent) : '—'}
                        </td>
                      )
                    })}
                    <td className="px-2 py-2 text-right">
                      <MoneyCell
                        value={cap}
                        onChange={(v) => {
                          if (v <= 0) void remove('budgets', c.id)
                          else void put('budgets', { id: c.id, cap: v })
                        }}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-semibold">
                <td className="py-2 pr-3">Total</td>
                {months.map((m) => (
                  <td key={m} className={cx('tnum px-2 py-2 text-right', m === currentMonth && 'bg-surface-2')}>
                    {fmtEUR(totals.get(m)?.total ?? 0)}
                  </td>
                ))}
                <td className="px-2 py-2" />
              </tr>
            </tfoot>
          </table>
        </Card>
      </section>

      <section>
        <SectionTitle>Alertas do mês</SectionTitle>
        <Card>
          {alerts.length === 0 ? (
            <p className="text-sm text-positive">Tudo dentro dos tetos ✓</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {alerts.map((a) => (
                <li key={a.category.id} className="flex items-center gap-2 text-sm">
                  <span>⚠️</span>
                  <span className="flex-1">
                    {a.category.name}: {fmtEUR(a.spent)} de {fmtEUR(a.cap)}
                    {a.status === 'over' ? ' (ultrapassado)' : ''}
                  </span>
                  <Badge tone={a.status === 'over' ? 'negative' : 'warn'}>
                    {a.status === 'over' ? 'Ultrapassado' : 'Atenção'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle
          right={
            <Select value={selected?.id ?? ''} onChange={(e) => setSelectedId(e.target.value)}>
              {categoriesWithSpend.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          }
        >
          Evolução por categoria
        </SectionTitle>
        <Card>
          {selected ? (
            <ResponsiveContainer height={280}>
              <BarChart data={selectedChartData}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)' }}
                  formatter={(value: number) => fmtEUR(value)}
                />
                {selectedCap !== undefined && (
                  <ReferenceLine y={selectedCap} stroke="var(--warn)" strokeDasharray="4 4" />
                )}
                <Bar dataKey="gasto" name="Gasto" fill="var(--accent-strong)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted">Sem categorias com gastos nesta janela.</p>
          )}
        </Card>
      </section>
    </div>
  )
}

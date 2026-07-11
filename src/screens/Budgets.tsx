import { useEffect, useMemo, useRef, useState } from 'react'
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
import { Badge, Button, Card, MetricCard, SectionTitle, cx } from '../components/ui'
import { round2 } from '../lib/calc/allocation'
import { capFor, computeSpend, isUncategorized, monthTotals, normalizeDesc } from '../lib/calc/budgets'
import { addMonths, currentMonthKey, fmtEUR, monthRange, monthShort } from '../lib/format'
import { useStore } from '../store/useStore'

// Cor da célula do heatmap de tetos: sem gasto = cinza; dentro do teto = verde
// leve; ultrapassado = vermelho cada vez mais escuro conforme o excesso relativo
// ao próprio teto da categoria.
function tetoHeatCell(spent: number, cap: number): { bg: string; fg: string } {
  if (spent <= 0 || cap <= 0) return { bg: 'var(--surface-2)', fg: 'var(--muted)' }
  if (spent <= cap) {
    const alpha = 0.15 + 0.2 * (spent / cap) // 0.15 → 0.35
    return { bg: `rgba(16, 185, 129, ${alpha.toFixed(2)})`, fg: 'var(--text)' }
  }
  const over = Math.min(1, (spent - cap) / cap) // 0 → 1
  const alpha = 0.4 + 0.5 * over // 0.4 → 0.9
  return { bg: `rgba(220, 38, 38, ${alpha.toFixed(2)})`, fg: over > 0.35 ? '#fff' : 'var(--text)' }
}

// Dropdown de seleção múltipla de categorias: o painel fica aberto entre
// cliques (ao contrário de um <select>) para o utilizador ir marcando várias
// categorias e ver a soma a atualizar dinamicamente no gráfico.
function CategoryMultiSelect({
  categories, selectedIds, onToggle,
}: { categories: { id: string; name: string }[]; selectedIds: string[]; onToggle: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const label = selectedIds.length === 1
    ? (categories.find((c) => c.id === selectedIds[0])?.name ?? 'Escolher categorias')
    : selectedIds.length > 1
      ? `${selectedIds.length} categorias`
      : 'Escolher categorias'

  return (
    <div ref={ref} className="relative">
      <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
        {label} ▾
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 max-h-72 w-56 overflow-y-auto rounded-xl border border-border bg-surface p-2 shadow-xl">
          {categories.length === 0 ? (
            <p className="p-2 text-xs text-muted">Sem categorias com gastos.</p>
          ) : (
            categories.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                <input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => onToggle(c.id)} />
                {c.name}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function Budgets() {
  const data = useStore((s) => s.data)
  const setScreen = useStore((s) => s.setScreen)

  const currentMonth = currentMonthKey()
  // Janela fixa: últimos 12 meses (atual em último) para todos os gráficos/tabelas.
  const months = useMemo(() => monthRange(addMonths(currentMonth, -11), currentMonth), [currentMonth])

  const categories = useMemo(
    () => data.transactionCategories.filter((c) => !c.archived).sort((a, b) => a.order - b.order),
    [data.transactionCategories],
  )

  const casaCategoryId = useMemo(
    () => categories.find((c) => normalizeDesc(c.name) === 'casas')?.id,
    [categories],
  )

  const spend = useMemo(() => computeSpend(data.transactions), [data.transactions])
  // Gasto "discricionário": exclui despesas marcadas para repor da poupança —
  // são compras planeadas/financiadas pela poupança, não devem contar para o
  // teto mensal (o teto mede o que sai do cash-flow normal). Usado só na
  // heatmap de tetos; a tabela "Por categoria" e os gastos continuam a
  // mostrar o total real, incluindo essas compras.
  const discretionarySpend = useMemo(
    () => computeSpend(data.transactions, { excludeRepoePoupanca: true }),
    [data.transactions],
  )
  const totals = useMemo(() => monthTotals(data.transactions, casaCategoryId), [data.transactions, casaCategoryId])

  const uncategorized = useMemo(
    () => data.transactions.filter((t) => isUncategorized(t, categories)),
    [data.transactions, categories],
  )
  const uncategorizedTotal = uncategorized.reduce((sum, t) => sum + t.amount, 0)

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
  const currentSemReposto = totals.get(currentMonth)?.semReposto ?? 0

  const chartData = months.map((m) => ({
    month: monthShort(m),
    total: totals.get(m)?.total ?? 0,
    semReposto: totals.get(m)?.semReposto ?? 0,
    semRepostoSemCasa: totals.get(m)?.semRepostoSemCasa ?? 0,
  }))

  // Categorias com teto ativo (cap > 0), para o heatmap de tetos.
  const tetoCategories = useMemo(
    () => categories
      .map((c) => ({ category: c, cap: capFor(data.budgets, c.id) }))
      .filter((x): x is { category: (typeof categories)[number]; cap: number } => (x.cap ?? 0) > 0),
    [categories, data.budgets],
  )

  // Multi-seleção de categorias para o gráfico "Evolução": sem seleção do
  // utilizador ainda, assume-se a 1ª categoria com gastos (paridade com o
  // comportamento anterior de single-select).
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const effectiveIds = selectedIds.length > 0
    ? selectedIds
    : (categoriesWithSpend[0] ? [categoriesWithSpend[0].id] : [])
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const base = prev.length > 0 ? prev : effectiveIds
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id]
    })
  }
  const selectedCategories = categoriesWithSpend.filter((c) => effectiveIds.includes(c.id))
  // Teto de referência: soma dos tetos das categorias selecionadas que tiverem um definido.
  const selectedCapSum = selectedCategories.reduce((sum, c) => sum + (capFor(data.budgets, c.id) ?? 0), 0)
  const selectedCap = selectedCapSum > 0 ? selectedCapSum : undefined
  const selectedChartData = selectedCategories.length > 0
    ? months.map((m) => ({
        month: monthShort(m),
        gasto: selectedCategories.reduce((sum, c) => sum + (spend.get(c.id)?.get(m) ?? 0), 0),
      }))
    : []

  return (
    <div className="fade-up flex flex-col gap-6">
      <h1 className="text-xl font-black">Budgets</h1>

      {uncategorized.length > 0 && (
        <Card className="flex flex-wrap items-center gap-2 border-warn/40 bg-warn-soft/40">
          <span>⚠️</span>
          <span className="flex-1 text-sm text-text">
            {`${uncategorized.length} gasto${uncategorized.length === 1 ? '' : 's'} sem categoria (${fmtEUR(uncategorizedTotal)}) não estão a contar em nenhum budget. Atribui-lhes categoria na página de Gastos.`}
          </span>
          <Badge tone="warn">Sem categoria</Badge>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricCard label="Gasto este mês" value={fmtEUR(currentTotal)} />
        <MetricCard
          label="Sem reposições de poupança"
          value={fmtEUR(currentSemReposto)}
          hint="exclui gastos com a tag Reposto"
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
              <Bar dataKey="semReposto" name="Sem poupanças" fill="var(--goal)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="semRepostoSemCasa" name="Sem poupanças e sem casa" fill="var(--warn)" radius={[6, 6, 0, 0]} />
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
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {categoriesWithData.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 pr-3 font-medium">{c.name}</td>
                  {months.map((m) => {
                    const spent = spend.get(c.id)?.get(m) ?? 0
                    return (
                      <td
                        key={m}
                        className={cx('tnum px-2 py-2 text-right', m === currentMonth && 'bg-surface-2')}
                      >
                        {spent ? fmtEUR(spent) : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-semibold">
                <td className="py-2 pr-3">Total</td>
                {months.map((m) => (
                  <td key={m} className={cx('tnum px-2 py-2 text-right', m === currentMonth && 'bg-surface-2')}>
                    {fmtEUR(totals.get(m)?.total ?? 0)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </Card>
      </section>

      <section>
        <SectionTitle right={<Button variant="ghost" size="sm" onClick={() => setScreen('definicoes')}>Editar tetos</Button>}>
          Tetos
        </SectionTitle>
        <Card className="overflow-x-auto thin-scroll">
          {tetoCategories.length === 0 ? (
            <p className="text-sm text-muted">
              Ainda sem tetos definidos. Define tetos por categoria nas Definições.
            </p>
          ) : (
            <table className="w-full min-w-[720px] border-separate border-spacing-1 text-xs">
              <thead>
                <tr className="text-left font-medium text-muted">
                  <th className="pr-3">Categoria</th>
                  {months.map((m) => (
                    <th key={m} className={cx('px-1 text-center', m === currentMonth && 'font-semibold text-text')}>
                      {monthShort(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tetoCategories.map(({ category: c, cap }) => (
                  <tr key={c.id}>
                    <td className="whitespace-nowrap pr-3 font-medium text-text">
                      {c.name} <span className="text-muted">({fmtEUR(cap)})</span>
                    </td>
                    {months.map((m) => {
                      const spent = discretionarySpend.get(c.id)?.get(m) ?? 0
                      const total = spend.get(c.id)?.get(m) ?? 0
                      const reposto = round2(total - spent)
                      const cell = tetoHeatCell(spent, cap)
                      const title = reposto > 0
                        ? `${c.name} • ${monthShort(m)}: ${fmtEUR(spent)} de ${fmtEUR(cap)} (+ ${fmtEUR(reposto)} repostos da poupança, não contam para o teto)`
                        : `${c.name} • ${monthShort(m)}: ${fmtEUR(spent)} de ${fmtEUR(cap)}`
                      return (
                        <td
                          key={m}
                          className="h-8 rounded text-center align-middle tnum"
                          style={{ backgroundColor: cell.bg, color: cell.fg }}
                          title={title}
                        >
                          {spent > 0 ? fmtEUR(spent, true) : ''}
                          {reposto > 0 && <span className="ml-0.5 align-top text-[9px]">*</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tetoCategories.length > 0 && (
            <p className="mt-2 text-[11px] text-muted">
              * há gastos "repor da poupança" nesse mês, não contados aqui (contam para o teto só as despesas do cash-flow normal). Passa o rato/toca na célula para ver o valor total.
            </p>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle
          right={
            <CategoryMultiSelect
              categories={categoriesWithSpend}
              selectedIds={effectiveIds}
              onToggle={toggleSelected}
            />
          }
        >
          Evolução por categoria
        </SectionTitle>
        <Card>
          {selectedCategories.length > 0 ? (
            <>
              {selectedCategories.length > 1 && (
                <p className="mb-2 text-xs text-muted">
                  Soma de: {selectedCategories.map((c) => c.name).join(', ')}
                </p>
              )}
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
            </>
          ) : (
            <p className="text-sm text-muted">Sem categorias com gastos nesta janela.</p>
          )}
        </Card>
      </section>
    </div>
  )
}

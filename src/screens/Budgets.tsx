import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useSessionState } from '../lib/sessionState'
import {
  Bar,
  Rectangle,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartLegend, ChartTooltip, compactEUR, cursorStyle, diffLabelRenderer } from '../components/ChartParts'
import { MonthPicker } from '../components/MonthPicker'
import { Badge, Button, Card, EmptyState, MacroTitle, MetricCard, ProgressBar, SectionTitle, cx } from '../components/ui'
import { allGroups, legacyNeedingMapping, makeResolver } from '../lib/calc/categories'
import { findOrphanExpenses } from '../lib/calc/mergeExpenses'
import {
  attentionInsights, buildMonthReport, computeInsights, detectFixedGroups, groupMonthTotals, sortByAttention,
  type CategoryRow, type MonthReport, type SubRow,
} from '../lib/calc/planVsActual'
import { SavingsAnalytics } from '../components/SavingsAnalytics'
import { SubcategoryAnalytics } from '../components/SubcategoryAnalytics'
import { addMonths, currentMonthKey, fmtDate, fmtEURWhole as fmtEUR, monthRange, monthShort, todayISO } from '../lib/format'
import { effectivePlan, monthStartConfigOf, useStore } from '../store/useStore'
import { daysUntilNextMonth, monthDayInfo, monthProgress } from '../lib/financialMonth'
import { activeAccountingMonth } from '../lib/calc/balances'
import type { MonthKey, Transaction } from '../types'

// Cor da célula do histórico: sem gasto = cinza; dentro do plano = verde leve;
// acima do plano = vermelho cada vez mais escuro conforme o excesso relativo.
function heatCell(spent: number, planned: number): { bg: string; fg: string } {
  if (spent <= 0) return { bg: 'var(--surface-2)', fg: 'var(--muted)' }
  if (planned <= 0) return { bg: 'rgba(217, 119, 6, 0.25)', fg: 'var(--text)' } // gasto sem plano
  if (spent <= planned) {
    const alpha = 0.15 + 0.2 * (spent / planned)
    return { bg: `rgba(16, 185, 129, ${alpha.toFixed(2)})`, fg: 'var(--text)' }
  }
  const over = Math.min(1, (spent - planned) / planned)
  const alpha = 0.4 + 0.5 * over
  return { bg: `rgba(220, 38, 38, ${alpha.toFixed(2)})`, fg: over > 0.35 ? '#fff' : 'var(--text)' }
}

// Dropdown de seleção múltipla: o painel fica aberto entre cliques para ir
// marcando várias categorias e ver a soma a atualizar no gráfico.
function CategoryMultiSelect({
  categories, selectedIds, onToggle, defaultId, onSetDefault,
}: {
  categories: { id: string; name: string }[]; selectedIds: string[]; onToggle: (id: string) => void
  defaultId?: string; onSetDefault: (id: string | null) => void
}) {
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
              <div key={c.id} className="flex items-center rounded-lg hover:bg-surface-2">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-2 py-1.5 text-sm">
                  <input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => onToggle(c.id)} />
                  <span className="truncate">{c.name}</span>
                </label>
                <button
                  type="button"
                  onClick={() => onSetDefault(defaultId === c.id ? null : c.id)}
                  title={defaultId === c.id ? 'É a categoria padrão do gráfico (tocar para tirar)' : 'Definir como categoria padrão do gráfico'}
                  aria-label={defaultId === c.id ? `Tirar ${c.name} como padrão` : `Definir ${c.name} como padrão`}
                  className={cx('shrink-0 px-2 py-1.5 text-sm', defaultId === c.id ? 'text-warn' : 'text-muted hover:text-text')}
                >
                  {defaultId === c.id ? '★' : '☆'}
                </button>
              </div>
            ))
          )}
          {categories.length > 0 && <p className="mt-1 px-2 text-[11px] text-muted">★ abre por defeito neste gráfico</p>}
        </div>
      )}
    </div>
  )
}


export function Budgets() {
  const data = useStore((s) => s.data)
  const setScreen = useStore((s) => s.setScreen)
  const put = useStore((s) => s.put)

  const currentMonth = currentMonthKey()
  const startCfg = monthStartConfigOf(data.meta[0])
  // Sem mês escolhido segue o mês financeiro atual (também depois de um refresh,
  // quando os dados e o início do mês só chegam depois do primeiro render).
  const [pickedMonth, setPickedMonth] = useSessionState<MonthKey | null>('analytics.month', null)
  const month = pickedMonth ?? currentMonth
  const setMonth = (m: MonthKey) => setPickedMonth(m === currentMonth ? null : m)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showSubs, setShowSubs] = useState(false)
  // Janela de 12 meses terminada no mês escolhido (para gráfico/histórico).
  const months = useMemo(() => monthRange(addMonths(month, -11), month), [month])

  const resolve = useMemo(() => makeResolver(data), [data])
  const groups = useMemo(() => allGroups(data), [data])

  // Plano de um mês: o gravado; para o mês atual/futuros, o "efetivo" (rascunho
  // ou cópia do último). Meses passados sem plano gravado ficam sem plano.
  const planFor = (m: MonthKey) => {
    const saved = data.monthlyPlans.find((p) => p.id === m)
    if (saved) return saved.expenses
    return m >= currentMonth ? effectivePlan(data, m).expenses : undefined
  }

  const reports = useMemo(() => {
    const map = new Map<MonthKey, MonthReport>()
    const totals = groupMonthTotals(data.transactions, resolve)
    for (const m of months) {
      const elapsed = m === currentMonth ? monthProgress(startCfg, m, todayISO()) : undefined
      map.set(m, buildMonthReport({
        month: m, transactions: data.transactions, resolve, groups,
        subcategories: data.subcategories, planExpenses: planFor(m), elapsed,
        fixedIds: detectFixedGroups(groups, totals, m),
      }))
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months, data, resolve, groups, currentMonth, startCfg])

  const report = reports.get(month)!
  const isCurrent = month === currentMonth
  const accountingMonth = activeAccountingMonth(data.monthlyPlans, currentMonth)
  const insights = useMemo(() => {
    const all = computeInsights(monthRange(addMonths(month, -3), month).map((m) => reports.get(m)).filter((r): r is MonthReport => Boolean(r)))
    // No mês atual só se mostra o que merece atenção agora (ver attentionInsights).
    return isCurrent
      ? attentionInsights(all, { currentMonth, accountingMonth, daysUntilNextMonth: daysUntilNextMonth(startCfg, currentMonth, todayISO()) })
      : all
  }, [reports, month, isCurrent, currentMonth, accountingMonth, startCfg])
  const rows = sortByAttention(report.rows.filter((r) => r.planned > 0 || r.spent > 0))
  const diff = report.plannedTotal - report.spentInPlan
  const pendingLegacy = legacyNeedingMapping(data)
  const orphanExpenses = useMemo(() => findOrphanExpenses(data).filter((o) => o.deleted), [data])

  // ----- Gráfico: planeado vs gasto por mês -----
  const chartData = months.map((m) => {
    const r = reports.get(m)!
    // Gasto total (no plano + sem categoria) para a diferença; as duas partes empilham-se na barra.
    return {
      month: monthShort(m), planeado: r.hasPlan ? r.plannedTotal : null, gasto: r.spentCash,
      noPlano: r.spentInPlan, semCategoria: r.unassignedTotal,
    }
  })

  // ----- Histórico por categoria (% do plano) -----
  const historyGroups = groups.filter((g) => g.kind === 'expense' && months.some((m) => {
    const row = reports.get(m)?.rows.find((x) => x.group.id === g.id)
    return row && (row.spent > 0 || row.planned > 0)
  })).sort((a, b) => a.order - b.order)

  // ----- Evolução por categoria (multi-seleção) -----
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const spendGroups = historyGroups
  // Sem padrão definido: a categoria com mais gasto na janela (não depende do nome).
  const spentInWindow = (id: string) =>
    months.reduce((sum, m) => sum + (reports.get(m)?.rows.find((x) => x.group.id === id)?.spent ?? 0), 0)
  const setMeta = useStore((s) => s.setMeta)
  const savedDefaultId = data.meta[0]?.analyticsDefaultGroupId
  // Padrão escolhido por ti (★); se não houver, ou já não existir, a categoria com mais gasto.
  const defaultGroup = spendGroups.find((g) => g.id === savedDefaultId)
    ?? [...spendGroups].sort((a, b) => spentInWindow(b.id) - spentInWindow(a.id))[0]
  const effectiveIds = selectedIds.length > 0 ? selectedIds : (defaultGroup ? [defaultGroup.id] : [])
  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => {
      const base = prev.length > 0 ? prev : effectiveIds
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id]
    })
  const selectedGroups = spendGroups.filter((g) => effectiveIds.includes(g.id))
  const evolutionData = selectedGroups.length > 0
    ? months.map((m) => {
        const rs = selectedGroups.map((g) => reports.get(m)!.rows.find((x) => x.group.id === g.id))
        const planned = rs.reduce((s, r) => s + (r?.planned ?? 0), 0)
        return {
          month: monthShort(m),
          gasto: rs.reduce((s, r) => s + (r?.spent ?? 0), 0),
          planeado: reports.get(m)!.hasPlan ? planned : null,
        }
      })
    : []

  // Subcategorias de uma categoria com gasto na janela (para as linhas expandidas do histórico).
  const subRowsOf = (groupId: string) => {
    const acc = new Map<string, { id: string; name: string; total: number }>()
    for (const m of months) {
      for (const sub of reports.get(m)!.rows.find((x) => x.group.id === groupId)?.subs ?? []) {
        if (sub.spent <= 0) continue
        const cur = acc.get(sub.id) ?? { id: sub.id, name: sub.name, total: 0 }
        cur.total += sub.spent
        acc.set(sub.id, cur)
      }
    }
    const list = [...acc.values()].sort((a, b) => b.total - a.total)
    // Só vale a pena expandir se houver subcategorias nomeadas.
    return list.some((x) => x.id !== '') ? list : []
  }

  const noPlanData = !report.hasPlan && report.spentInPlan === 0 && report.offPlanTotal === 0 && report.unassigned.length === 0

  return (
    <div className="fade-up flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black">Analytics</h1>
        <MonthPicker month={month} onChange={setMonth} />
      </div>

      {pendingLegacy.length > 0 && (
        <Card className="flex flex-wrap items-center gap-2 border-warn/40 bg-warn-soft/40">
          <span>🔗</span>
          <span className="flex-1 text-sm text-text">
            {`${pendingLegacy.length} categoria${pendingLegacy.length === 1 ? ' antiga' : 's antigas'} de gastos por associar às categorias do plano. Enquanto não o fizeres, esses gastos (${fmtEUR(pendingLegacy.reduce((s, p) => s + p.total, 0))}) não entram nesta análise por categoria.`}
          </span>
          <Button size="sm" variant="soft" onClick={() => setScreen('definicoes')}>Associar</Button>
        </Card>
      )}

      {orphanExpenses.length > 0 && (
        <Card className="flex flex-wrap items-center gap-2 border-warn/40 bg-warn-soft/40">
          <span>🔗</span>
          <span className="flex-1 text-sm text-text">
            {`${orphanExpenses.length} ${orphanExpenses.length === 1 ? 'despesa apagada ainda tem' : 'despesas apagadas ainda têm'} valor planeado em meses passados (${fmtEUR(orphanExpenses.reduce((s, o) => s + o.total, 0))}). Esse valor não entra nas comparações por categoria — junta-o a uma despesa ativa.`}
          </span>
          <Button size="sm" variant="soft" onClick={() => setScreen('definicoes')}>Corrigir</Button>
        </Card>
      )}

      {!report.hasPlan && (report.spentInPlan > 0 || !noPlanData) && (
        <Card className="flex flex-wrap items-center gap-2">
          <span className="flex-1 text-sm text-muted">
            Não há despesas planeadas para este mês — sem plano não há com o que comparar. Define-as em Planeamento.
          </span>
          <Button size="sm" variant="soft" onClick={() => setScreen('planeamento')}>Ir para Planeamento</Button>
        </Card>
      )}

      {insights.length > 0 && (
        <Card>
          <SectionTitle>Atenção</SectionTitle>
          <ul className="flex flex-col gap-2">
            {insights.map((i, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5">
                  {i.kind === 'over' ? '🔴' : i.kind === 'recurring' ? '🔁' : i.kind === 'unassigned' ? '⚠️' : '🟠'}
                </span>
                <span>{i.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Planeado" value={fmtEUR(report.plannedTotal)} hint="despesas do planeamento" />
        <MetricCard
          label="Gasto no plano"
          value={fmtEUR(report.spentInPlan)}
          hint={report.plannedTotal > 0 ? `${Math.round((report.spentInPlan / report.plannedTotal) * 100)}% do planeado` : undefined}
        />
        <MetricCard
          label={diff >= 0 ? 'Ainda disponível' : 'Acima do plano'}
          value={fmtEUR(Math.abs(diff))}
          tone={report.plannedTotal === 0 ? 'default' : diff >= 0 ? 'positive' : 'negative'}
          hint={isCurrent && report.plannedTotal > 0 ? `dia ${monthDayInfo(startCfg, month, todayISO()).day} de ${monthDayInfo(startCfg, month, todayISO()).total}` : undefined}
        />
        <MetricCard
          label="Fora do plano"
          value={fmtEUR(report.offPlanTotal + report.unassignedTotal)}
          hint="pago pela poupança ou sem categoria"
          info="Gastos cuja categoria é um balde de poupança (ex.: reparação do carro paga pela poupança) e gastos ainda sem categoria do plano. Não contam contra o orçamento do mês."
        />
      </div>

      <MacroTitle>Despesas</MacroTitle>

      <section>
        <SectionTitle>Plano vs. real</SectionTitle>
        <Card className="p-0">
          {rows.length === 0 ? (
            <div className="p-4">
              <EmptyState title="Sem despesas planeadas nem gastos neste mês" hint="Define as despesas em Planeamento e regista gastos em Gastos." />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <CategoryLine
                  key={r.group.id}
                  row={r}
                  open={expanded === r.group.id}
                  onToggle={() => setExpanded((cur) => (cur === r.group.id ? null : r.group.id))}
                  isCurrent={isCurrent}
                  onIgnoreAlerts={() => {
                    const cat = data.expenseCategories.find((c) => c.id === r.group.id)
                    if (!cat) return
                    if (!window.confirm(`Deixar de avisar "Quase no limite" em "${cat.name}"? Passa a contar como despesa fixa e só fica vermelha se ultrapassares o plano. Podes reverter em Definições → Despesas do planeamento.`)) return
                    void put('expenseCategories', { ...cat, fixed: true })
                  }}
                />
              ))}
              <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm font-semibold">
                <span>Total</span>
                <span className="tnum">{fmtEUR(report.spentInPlan)} / {fmtEUR(report.plannedTotal)}</span>
              </li>
            </ul>
          )}
        </Card>
      </section>

      {(report.offPlan.length > 0 || report.unassigned.length > 0) && (
        <section>
          <SectionTitle>Fora do plano</SectionTitle>
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {report.offPlan.map((o) => (
                <OffPlanLine key={o.group.id} name={o.group.name} badge="Pago pela poupança" total={o.spent} subs={o.subs} txs={o.txs} />
              ))}
              {report.unassigned.length > 0 && (
                <OffPlanLine
                  name="Sem categoria do plano"
                  badge="Por classificar"
                  tone="warn"
                  total={report.unassignedTotal}
                  subs={[]}
                  txs={[...report.unassigned].sort((a, b) => b.amount - a.amount)}
                  action={<Button size="sm" variant="soft" onClick={() => setScreen('gastos')}>Classificar em Gastos</Button>}
                />
              )}
              <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm font-semibold">
                <span>Total fora do plano</span>
                <span className="tnum">{fmtEUR(report.offPlanTotal + report.unassignedTotal)}</span>
              </li>
            </ul>
          </Card>
          <p className="mt-2 text-xs text-muted">
            Estes gastos não contam contra o orçamento do mês — são pagos pela poupança ou ainda não têm categoria.
          </p>
        </section>
      )}

      <section>
        <SectionTitle>Planeado vs. gasto por mês</SectionTitle>
        <Card>
          <ResponsiveContainer height={260}>
            <ComposedChart data={chartData} margin={{ top: 26, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={compactEUR} width={44} />
              <Tooltip content={<ChartTooltip format={fmtEUR} />} cursor={cursorStyle} isAnimationActive={false} />
              <Legend content={<ChartLegend />} />
              <Bar
                dataKey="noPlano" name="Gasto no plano" stackId="g" fill="var(--accent-strong)"
                shape={(props: unknown) => {
                  const p = props as React.ComponentProps<typeof Rectangle> & { payload?: { semCategoria?: number } }
                  return <Rectangle {...p} radius={(p.payload?.semCategoria ?? 0) > 0 ? 0 : [6, 6, 0, 0]} />
                }}
              />
              <Bar dataKey="semCategoria" name="Sem categoria" stackId="g" fill="#94a3b8" radius={[6, 6, 0, 0]}>
                <LabelList dataKey="semCategoria" content={diffLabelRenderer(chartData)} />
              </Bar>
              <Line type="monotone" dataKey="planeado" name="Planeado" stroke="var(--warn)" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="mt-2 text-[11px] text-muted">Valor sobre a barra = gasto total (no plano + sem categoria) face ao planeado (+ gastaste a mais, − gastaste a menos). A parte cinzenta são gastos que ainda não têm categoria do plano.</p>
        </Card>
      </section>

      <section>
        <SectionTitle
          right={
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted">
              <input type="checkbox" checked={showSubs} onChange={(e) => setShowSubs(e.target.checked)} />
              Mostrar subcategorias
            </label>
          }
        >
          Histórico por categoria
        </SectionTitle>
        <Card className="overflow-x-auto thin-scroll">
          {historyGroups.length === 0 ? (
            <p className="text-sm text-muted">Ainda sem gastos nem plano nesta janela.</p>
          ) : (
            <>
              <table className="w-full min-w-[720px] border-separate border-spacing-1 text-xs">
                <thead>
                  <tr className="text-left font-medium text-muted">
                    <th className="pr-3">Categoria</th>
                    {months.map((m) => (
                      <th key={m} className={cx('px-1 text-center', m === month && 'font-semibold text-text')}>{monthShort(m)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historyGroups.map((g) => (
                    <Fragment key={g.id}>
                    <tr>
                      <td className="whitespace-nowrap pr-3 font-medium text-text">{g.name}</td>
                      {months.map((m) => {
                        const row = reports.get(m)!.rows.find((x) => x.group.id === g.id)
                        const spent = row?.spent ?? 0
                        const planned = reports.get(m)!.hasPlan ? (row?.planned ?? 0) : 0
                        const cell = reports.get(m)!.hasPlan ? heatCell(spent, planned) : { bg: 'var(--surface-2)', fg: 'var(--muted)' }
                        return (
                          <td
                            key={m}
                            className="tnum h-10 rounded text-center align-middle leading-tight"
                            style={{ backgroundColor: cell.bg, color: cell.fg }}
                            title={`${g.name} • ${monthShort(m)}: ${fmtEUR(spent)}${planned > 0 ? ` de ${fmtEUR(planned)} planeados` : ''}`}
                          >
                            {spent > 0 ? fmtEUR(spent, true) : ''}
                            {planned > 0 && (spent > 0 || planned > 0) && Math.abs(spent - planned) >= 0.5 && (
                              <div className="text-[9px] font-normal opacity-55">
                                {spent - planned > 0 ? '+' : '−'}{fmtEUR(Math.abs(spent - planned), true)}
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                    {showSubs && subRowsOf(g.id).map((sub) => {
                      const vals = months.map((m) => reports.get(m)!.rows.find((x) => x.group.id === g.id)?.subs.find((x) => x.id === sub.id)?.spent ?? 0)
                      const max = Math.max(...vals, 1)
                      return (
                        <tr key={`${g.id}|${sub.id}`}>
                          <td className="whitespace-nowrap py-0.5 pl-4 pr-3 text-muted">↳ {sub.name}</td>
                          {months.map((m, mi) => {
                            const v = vals[mi]
                            return (
                              <td
                                key={m}
                                className="tnum h-6 rounded text-center align-middle text-[11px]"
                                style={{
                                  backgroundColor: v > 0 ? `rgba(99, 102, 241, ${(0.1 + 0.4 * (v / max)).toFixed(2)})` : 'transparent',
                                  color: v > 0 ? 'var(--text)' : 'var(--muted)',
                                }}
                                title={`${g.name} › ${sub.name} • ${monthShort(m)}: ${fmtEUR(v)}`}
                              >
                                {v > 0 ? fmtEUR(v, true) : ''}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-muted">
                Verde = dentro do plano, vermelho = acima do plano (mais escuro = mais acima), laranja = gasto sem plano.
                Meses sem plano gravado aparecem sem cor. Por baixo do valor: diferença face ao planeado (+ a mais, − a menos).
              </p>
            </>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle
          right={
            <CategoryMultiSelect
              categories={spendGroups}
              selectedIds={effectiveIds}
              onToggle={toggleSelected}
              defaultId={savedDefaultId}
              onSetDefault={(id) => void setMeta({ analyticsDefaultGroupId: id ?? undefined })}
            />
          }
        >
          Evolução por categoria
        </SectionTitle>
        <Card>
          {selectedGroups.length > 0 ? (
            <>
              {selectedGroups.length > 1 && (
                <p className="mb-2 text-xs text-muted">Soma de: {selectedGroups.map((g) => g.name).join(', ')}</p>
              )}
              <ResponsiveContainer height={260}>
                <ComposedChart data={evolutionData} margin={{ top: 26, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={compactEUR} width={44} />
                  <Tooltip content={<ChartTooltip format={fmtEUR} />} cursor={cursorStyle} isAnimationActive={false} />
                  <Legend content={<ChartLegend />} />
                  <Bar dataKey="gasto" name="Gasto" fill="var(--accent-strong)" radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="gasto" content={diffLabelRenderer(evolutionData)} />
                  </Bar>
                  <Line type="monotone" dataKey="planeado" name="Planeado" stroke="var(--warn)" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
              <p className="mt-2 text-[11px] text-muted">Valor sobre a barra = gasto face ao planeado (+ a mais, − a menos).</p>
            </>
          ) : (
            <p className="text-sm text-muted">Sem categorias com gastos nesta janela.</p>
          )}
        </Card>
      </section>

      <SubcategoryAnalytics month={month} months={months} reports={reports} />

      <SavingsAnalytics month={month} months={months} reports={reports} />
    </div>
  )
}

function TxList({ txs }: { txs: Transaction[] }) {
  const shown = txs.slice(0, 10)
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {shown.map((t) => (
        <li key={t.id} className="flex items-center justify-between gap-3 text-xs">
          <span className="min-w-0 truncate text-muted">
            <span className="tnum mr-2">{fmtDate(t.date)}</span>
            <span className="text-text">{t.nome || t.description || '—'}</span>
          </span>
          <span className="tnum shrink-0 font-medium">{fmtEUR(t.amount)}</span>
        </li>
      ))}
      {txs.length > shown.length && (
        <li className="text-xs text-muted">+ {txs.length - shown.length} gastos mais pequenos</li>
      )}
    </ul>
  )
}

function SubBreakdown({ subs }: { subs: SubRow[] }) {
  if (subs.length === 0 || (subs.length === 1 && subs[0].id === '')) return null
  const total = subs.reduce((s, x) => s + x.spent, 0)
  return (
    <ul className="mt-2 flex flex-col gap-1.5">
      {subs.map((s) => (
        <li key={s.id || 'none'} className="text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted">{s.name}</span>
            <span className="tnum font-medium">
              {fmtEUR(s.spent)}
              <span className="ml-1.5 text-muted">{total > 0 ? `${Math.round((s.spent / total) * 100)}%` : ''}</span>
            </span>
          </div>
          <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent-strong" style={{ width: `${total > 0 ? (s.spent / total) * 100 : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function CategoryLine({
  row, open, onToggle, isCurrent, onIgnoreAlerts,
}: { row: CategoryRow; open: boolean; onToggle: () => void; isCurrent: boolean; onIgnoreAlerts: () => void }) {
  const barTone = row.level === 'over' || row.level === 'unplanned' ? 'negative' : row.level === 'warn' || row.aheadOfPace ? 'warn' : 'accent'
  // "Quase no limite" / "Ritmo alto": o utilizador pode dizer que não interessa
  // (a categoria passa a ser tratada como fixa: só fica vermelha se passar do plano).
  const canIgnore = !row.fixed && (row.level === 'warn' || row.aheadOfPace)
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
        className="flex w-full cursor-pointer flex-col gap-1.5 px-4 py-3 text-left hover:bg-surface-2/60"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {row.group.name}
            {row.fixed && (
              <span title="Despesa fixa: sem alertas de 'quase no limite' nem projeção, só fica vermelha se passar do plano. Podes mudar isto em Definições → Despesas do planeamento.">
                <Badge>Fixa</Badge>
              </span>
            )}
            {row.level === 'over' && <Badge tone="negative">{`Acima +${fmtEUR(-row.remaining)}`}</Badge>}
            {row.level === 'unplanned' && <Badge tone="warn">Sem plano</Badge>}
            {row.level === 'warn' && !row.aheadOfPace && <Badge tone="warn">Quase no limite</Badge>}
            {row.aheadOfPace && <Badge tone="warn">Ritmo alto</Badge>}
            {canIgnore && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onIgnoreAlerts() }}
                title="Deixa de avisar 'quase no limite' nesta despesa: passa a contar como fixa e só fica vermelha se ultrapassar o plano. Podes reverter em Definições."
                className="text-[11px] font-medium text-muted underline decoration-dotted underline-offset-2 hover:text-text"
              >
                não me interessa
              </button>
            )}
          </span>
          <span className="tnum text-sm">
            <span className="font-semibold">{fmtEUR(row.spent)}</span>
            <span className="text-muted"> / {fmtEUR(row.planned)}</span>
          </span>
        </div>
        <ProgressBar pct={row.planned > 0 ? row.pct * 100 : row.spent > 0 ? 100 : 0} tone={barTone} />
        <div className="flex justify-between text-xs text-muted">
          <span>
            {row.planned > 0
              ? row.remaining >= 0 ? `Resta ${fmtEUR(row.remaining)}` : `Passaste ${fmtEUR(-row.remaining)}`
              : 'Nada planeado'}
          </span>
          {isCurrent && row.projected !== undefined && row.planned > 0 && (
            <span>{`Ao ritmo atual: ~${fmtEUR(row.projected, true)}`}</span>
          )}
        </div>
      </div>
      {open && (
        <div className="border-t border-border bg-surface-2/40 px-4 pb-3 pt-1">
          <SubBreakdown subs={row.subs} />
          {row.txs.length > 0 ? <TxList txs={row.txs} /> : <p className="mt-2 text-xs text-muted">Sem gastos neste mês.</p>}
        </div>
      )}
    </li>
  )
}

function OffPlanLine({
  name, badge, tone, total, subs, txs, action,
}: {
  name: string
  badge: string
  tone?: 'warn'
  total: number
  subs: SubRow[]
  txs: Transaction[]
  action?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <li>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-2/60">
        <span className="flex items-center gap-2 text-sm font-semibold">
          {name}
          <Badge tone={tone ?? 'goal'}>{badge}</Badge>
        </span>
        <span className="tnum text-sm font-semibold">{fmtEUR(total)}</span>
      </button>
      {open && (
        <div className="border-t border-border bg-surface-2/40 px-4 pb-3 pt-1">
          <SubBreakdown subs={subs} />
          <TxList txs={txs} />
          {action && <div className="mt-3">{action}</div>}
        </div>
      )}
    </li>
  )
}

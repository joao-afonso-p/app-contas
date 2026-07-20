import { useMemo, useState, type ReactNode } from 'react'
import {
  Badge, Button, Card, EmptyState, Input, Modal, Money, ProgressBar, SectionTitle, Select, cx,
} from '../components/ui'
import { EditableRow, GroupHeader, SpacerRow, StaticRow, TotalRow } from '../components/PlanTable'
import {
  addMonths, currentMonthKey, fmtEUR, fmtPct, monthLabel, monthRange, monthShort, parseAmount, uid,
} from '../lib/format'
import { allocationSummary } from '../lib/calc/allocation'
import { bucketBalance, computeBalances, goalProgress, totalBalance, type BalanceTable } from '../lib/calc/balances'
import { requiredMonthlySaving, savingsRate } from '../lib/calc/projections'
import {
  activeBuckets, activeExpenseCategories, activeIncomeSources, activeVehicles, firstPlanMonth, useStore,
} from '../store/useStore'
import type { MonthKey, PlannedMovement, SavingsBucket, SavingsMovement } from '../types'

const HORIZONS = [12, 18, 24, 36]

type Section = 'income' | 'expenses' | 'savings' | 'autoInvestments'

export function Projecoes() {
  const data = useStore((s) => s.data)
  const setMeta = useStore((s) => s.setMeta)
  const setProjectionValue = useStore((s) => s.setProjectionValue)
  const setProjectionRange = useStore((s) => s.setProjectionRange)
  const syncProjectionToReality = useStore((s) => s.syncProjectionToReality)
  const addPlannedTransfer = useStore((s) => s.addPlannedTransfer)
  const put = useStore((s) => s.put)
  const remove = useStore((s) => s.remove)

  const bucketName = (id: string) => data.savingsBuckets.find((b) => b.id === id)?.name ?? '—'

  const horizon = data.meta[0]?.projectionHorizon ?? 18
  const currentMonth = currentMonthKey()
  const months = useMemo(
    () => monthRange(currentMonth, addMonths(currentMonth, horizon - 1)),
    [currentMonth, horizon],
  )

  const incomeSources = activeIncomeSources(data)
  const expenseCategories = activeExpenseCategories(data)
  const buckets = activeBuckets(data)
  const vehicles = activeVehicles(data)

  const planByMonth = useMemo(
    () => new Map(data.projectionPlans.map((p) => [p.id, p])),
    [data.projectionPlans],
  )

  // Saldos: passado + mês atual reais, futuro projetado, no mesmo motor de
  // cálculo. O real tem sempre prioridade até ao mês atual (inclusive) — o
  // mês atual pode existir nos dois (data.monthlyPlans e data.projectionPlans,
  // já que a tabela agora também o mostra), e só o plano real deve contar.
  const balanceTable: BalanceTable = useMemo(() => {
    const plansCombined = [
      ...data.projectionPlans.filter((p) => months.includes(p.id) && p.id > currentMonth),
      ...data.monthlyPlans.filter((p) => p.id <= currentMonth),
    ]
    const plannedMovs = [...data.plannedMovements]
    const plannedAsMovements: SavingsMovement[] = plannedMovs.map((m) => ({
      id: m.id,
      date: `${m.month}-15`,
      bucketId: m.bucketId,
      amount: m.amount,
      description: m.description,
    }))
    const to = months[months.length - 1] ?? currentMonth
    return computeBalances({
      buckets,
      plans: plansCombined,
      movements: [...data.savingsMovements, ...plannedAsMovements],
      overrides: data.balanceOverrides,
      from: firstPlanMonth(data),
      to,
    })
  }, [data, months, buckets, currentMonth])

  const [syncOpen, setSyncOpen] = useState(false)

  // ---------- Edição em bloco (intervalo de meses numa linha, ou linha toda) ----------
  const [selection, setSelection] = useState<{ section: Section; id: string; anchor: MonthKey; months: MonthKey[] } | null>(null)
  const [bulkValue, setBulkValue] = useState('')

  const selectMonth = (section: Section, id: string, month: MonthKey) => {
    setSelection((prev) => {
      if (!prev || prev.section !== section || prev.id !== id) {
        return { section, id, anchor: month, months: [month] }
      }
      const startIdx = months.indexOf(prev.anchor)
      const endIdx = months.indexOf(month)
      if (startIdx === -1 || endIdx === -1) return { section, id, anchor: month, months: [month] }
      const [lo, hi] = startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx]
      return { ...prev, months: months.slice(lo, hi + 1) }
    })
  }

  const clearSelection = () => setSelection(null)

  const applySelection = () => {
    if (!selection) return
    const parsed = parseAmount(bulkValue)
    if (parsed === null) return
    void setProjectionRange(selection.section, selection.id, selection.months, parsed)
    setSelection(null)
    setBulkValue('')
  }

  const rowSelectionProps = (section: Section, id: string) => ({
    selectedMonths: selection?.section === section && selection.id === id ? selection.months : undefined,
    onSelectMonth: (m: MonthKey) => selectMonth(section, id, m),
    onClearSelection: clearSelection,
    onApplyAll: () => setSelection({ section, id, anchor: months[0], months }),
  })

  // ---------- Criar/editar objetivo (balde) ----------
  const [goalModalOpen, setGoalModalOpen] = useState(false)
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)
  const [goalNameDraft, setGoalNameDraft] = useState('')
  const [goalTargetDraft, setGoalTargetDraft] = useState('')
  const [goalDateDraft, setGoalDateDraft] = useState('')

  const openNewGoal = () => {
    setEditingGoalId(null)
    setGoalNameDraft('')
    setGoalTargetDraft('')
    setGoalDateDraft('')
    setGoalModalOpen(true)
  }

  const openEditGoal = (bucket: SavingsBucket) => {
    setEditingGoalId(bucket.id)
    setGoalNameDraft(bucket.name)
    setGoalTargetDraft(String(bucket.targetAmount ?? 0).replace('.', ','))
    setGoalDateDraft(bucket.targetDate ?? '')
    setGoalModalOpen(true)
  }

  const closeGoalModal = () => {
    setGoalModalOpen(false)
    setEditingGoalId(null)
  }

  const saveGoal = () => {
    const name = goalNameDraft.trim()
    const target = parseAmount(goalTargetDraft)
    if (!name || target === null) return
    if (editingGoalId) {
      const existing = data.savingsBuckets.find((b) => b.id === editingGoalId)
      if (!existing) return
      void put('savingsBuckets', { ...existing, name, targetAmount: target, targetDate: goalDateDraft || undefined })
    } else {
      void put('savingsBuckets', {
        id: uid(),
        name,
        kind: 'goal',
        archived: false,
        order: data.savingsBuckets.length,
        targetAmount: target,
        targetDate: goalDateDraft || undefined,
        status: 'active',
      })
    }
    closeGoalModal()
  }

  // ---------- Criar/editar movimento previsto ----------
  type MovKind = 'entrada' | 'saida' | 'transferencia'
  const [movModalOpen, setMovModalOpen] = useState(false)
  const [editingMovId, setEditingMovId] = useState<string | null>(null)
  const [editingMovTransferGroupId, setEditingMovTransferGroupId] = useState<string | null>(null)
  const [movKind, setMovKind] = useState<MovKind>('saida')
  const [movMonth, setMovMonth] = useState('')
  const [movBucket, setMovBucket] = useState('')
  const [movToBucket, setMovToBucket] = useState('')
  const [movAmount, setMovAmount] = useState('')
  const [movDesc, setMovDesc] = useState('')

  // ---------- Toggles de visibilidade ----------
  const [showAllGoals, setShowAllGoals] = useState(false)
  const [showMovHistory, setShowMovHistory] = useState(false)

  const openNewMovement = () => {
    setEditingMovId(null)
    setEditingMovTransferGroupId(null)
    setMovKind('saida')
    setMovMonth('')
    setMovBucket('')
    setMovToBucket('')
    setMovAmount('')
    setMovDesc('')
    setMovModalOpen(true)
  }

  const openEditMovement = (m: PlannedMovement) => {
    if (m.transferGroupId) {
      const pair = data.plannedMovements.filter((x) => x.transferGroupId === m.transferGroupId)
      const fromLeg = pair.find((x) => x.amount < 0) ?? m
      const toLeg = pair.find((x) => x.amount > 0) ?? m
      setEditingMovId(null)
      setEditingMovTransferGroupId(m.transferGroupId)
      setMovKind('transferencia')
      setMovMonth(m.month)
      setMovBucket(fromLeg.bucketId)
      setMovToBucket(toLeg.bucketId)
      setMovAmount(String(Math.abs(m.amount)).replace('.', ','))
      setMovDesc(m.description)
    } else {
      setEditingMovId(m.id)
      setEditingMovTransferGroupId(null)
      setMovKind(m.amount >= 0 ? 'entrada' : 'saida')
      setMovMonth(m.month)
      setMovBucket(m.bucketId)
      setMovToBucket('')
      setMovAmount(String(Math.abs(m.amount)).replace('.', ','))
      setMovDesc(m.description)
    }
    setMovModalOpen(true)
  }

  const closeMovModal = () => {
    setMovModalOpen(false)
    setEditingMovId(null)
    setEditingMovTransferGroupId(null)
  }

  const movSaveDisabled = (() => {
    const parsed = parseAmount(movAmount)
    if (parsed === null || parsed <= 0 || !movMonth) return true
    if (movKind === 'transferencia') return !movBucket || !movToBucket || movBucket === movToBucket
    return !movBucket
  })()

  const saveMovement = () => {
    const parsed = parseAmount(movAmount)
    if (parsed === null || parsed <= 0 || !movMonth) return
    const desc = movDesc.trim()
    if (movKind === 'transferencia') {
      if (!movBucket || !movToBucket || movBucket === movToBucket) return
      if (editingMovTransferGroupId) {
        const pair = data.plannedMovements.filter((x) => x.transferGroupId === editingMovTransferGroupId)
        const fromLeg = pair.find((x) => x.amount < 0)
        const toLeg = pair.find((x) => x.amount > 0)
        const finalDesc = desc || `Transferência: ${bucketName(movBucket)} → ${bucketName(movToBucket)}`
        if (fromLeg) void put('plannedMovements', { ...fromLeg, month: movMonth, bucketId: movBucket, amount: -parsed, description: finalDesc })
        if (toLeg) void put('plannedMovements', { ...toLeg, month: movMonth, bucketId: movToBucket, amount: parsed, description: finalDesc })
      } else {
        void addPlannedTransfer({ month: movMonth, fromBucketId: movBucket, toBucketId: movToBucket, amount: parsed, description: desc })
      }
      closeMovModal()
      return
    }
    if (!movBucket) return
    const sign = movKind === 'entrada' ? 1 : -1
    void put('plannedMovements', {
      id: editingMovId ?? uid(),
      month: movMonth,
      bucketId: movBucket,
      amount: parsed * sign,
      description: desc,
    })
    closeMovModal()
  }

  // ---------- Analytics ----------
  const firstMonth = months[0] ?? currentMonth
  const lastMonth = months[months.length - 1] ?? currentMonth
  const firstSummary = allocationSummary(planByMonth.get(firstMonth), incomeSources)
  const rate = savingsRate(firstSummary.totalIncome, firstSummary.totalSavings)
  const growth = totalBalance(balanceTable, lastMonth) - totalBalance(balanceTable, firstMonth)

  const goalBuckets = buckets.filter((b) => b.kind === 'goal')
  const displayGoalBuckets = showAllGoals ? data.savingsBuckets.filter((b) => b.kind === 'goal') : goalBuckets
  const visibleMovements = (showMovHistory ? data.plannedMovements : data.plannedMovements.filter((m) => m.month >= currentMonth))
    .slice()
    .sort((a, b) => a.month.localeCompare(b.month))

  return (
    <div className="fade-up flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black">Projeções</h1>
        <div className="flex items-center gap-2">
          <Select
            value={horizon}
            onChange={(e) => void setMeta({ projectionHorizon: Number(e.target.value) })}
          >
            {HORIZONS.map((n) => (
              <option key={n} value={n}>{n} meses</option>
            ))}
          </Select>
          <Button variant="ghost" size="sm" onClick={() => setSyncOpen(true)}>
            Sincronizar com a realidade
          </Button>
        </div>
      </div>

      <section>
        <SectionTitle>Saldos projetados</SectionTitle>
        <Card className="p-0">
          <div className="max-h-[70vh] overflow-auto thin-scroll">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 bg-surface px-3 py-2 text-left align-bottom text-xs font-semibold text-muted">
                    Categoria
                  </th>
                  {months.map((m) => {
                    const summary = allocationSummary(planByMonth.get(m), incomeSources)
                    const isBalanced = Math.abs(summary.unallocated) < 0.005
                    return (
                      <th
                        key={m}
                        className="sticky top-0 z-20 whitespace-nowrap bg-surface px-3 py-2 text-right align-bottom"
                      >
                        <div className="tnum text-xs font-semibold text-muted">{monthShort(m)}</div>
                        <div className={cx('tnum mt-0.5 text-[11px] font-normal', isBalanced ? 'text-muted' : 'text-negative')}>
                          {fmtPct(summary.allocationPct)}
                        </div>
                        <div className={cx('tnum text-[11px] font-normal', isBalanced ? 'text-muted' : 'text-negative')}>
                          {fmtEUR(summary.unallocated)}
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                <GroupHeader label="Income" span={months.length + 1} />
                {incomeSources.map((s) => (
                  <EditableRow
                    key={s.id}
                    label={s.name}
                    months={months}
                    getValue={(m) => planByMonth.get(m)?.income[s.id] ?? 0}
                    onChange={(m, v) => void setProjectionValue(m, 'income', s.id, v)}
                    {...rowSelectionProps('income', s.id)}
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
                  <EditableRow
                    key={c.id}
                    label={c.name}
                    months={months}
                    getValue={(m) => planByMonth.get(m)?.expenses[c.id] ?? 0}
                    onChange={(m, v) => void setProjectionValue(m, 'expenses', c.id, v)}
                    {...rowSelectionProps('expenses', c.id)}
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
                  <EditableRow
                    key={b.id}
                    label={b.name}
                    badge={b.kind === 'goal' ? <Badge tone="goal">Objetivo</Badge> : undefined}
                    months={months}
                    getValue={(m) => planByMonth.get(m)?.savings[b.id] ?? 0}
                    onChange={(m, v) => void setProjectionValue(m, 'savings', b.id, v)}
                    {...rowSelectionProps('savings', b.id)}
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
                      <EditableRow
                        key={v.id}
                        label={v.name}
                        months={months}
                        getValue={(m) => planByMonth.get(m)?.autoInvestments?.[v.id] ?? 0}
                        onChange={(m, val) => void setProjectionValue(m, 'autoInvestments', v.id, val)}
                        {...rowSelectionProps('autoInvestments', v.id)}
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
                <GroupHeader label="Saldos" span={months.length + 1} dark />
                {buckets.map((b) => (
                  <StaticRow
                    key={b.id}
                    label={b.name}
                    badge={b.kind === 'goal' ? <Badge tone="goal">Objetivo</Badge> : undefined}
                    months={months}
                    getValue={(m) => bucketBalance(balanceTable, b.id, m)}
                    dark
                  />
                ))}
                <TotalRow label="Total" months={months} getValue={(m) => totalBalance(balanceTable, m)} dark />
              </tbody>
            </table>
          </div>
          {selection && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-2 px-3 py-2">
              <span className="text-xs font-medium text-muted">
                {selection.months.length} {selection.months.length === 1 ? 'mês selecionado' : 'meses selecionados'}
              </span>
              <Input
                inputMode="decimal"
                placeholder="Valor €"
                value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
                className="w-28"
              />
              <Button size="sm" onClick={applySelection} disabled={parseAmount(bulkValue) === null}>
                Aplicar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setSelection(null); setBulkValue('') }}>
                Cancelar
              </Button>
            </div>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle
          right={
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowAllGoals((v) => !v)}>
                {showAllGoals ? 'Mostrar só ativos' : 'Mostrar concluídos'}
              </Button>
              <Button size="sm" variant="soft" onClick={openNewGoal}>+ Objetivo</Button>
            </div>
          }
        >
          Objetivos
        </SectionTitle>
        <Card>
          {displayGoalBuckets.length === 0 ? (
            <EmptyState title="Sem objetivos ativos" hint="Usa o botão '+ Objetivo' para criar um." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {displayGoalBuckets.map((b) => {
                const isDone = b.status === 'done'
                const current = isDone ? (b.targetAmount ?? 0) : bucketBalance(balanceTable, b.id, currentMonth)
                const target = b.targetAmount ?? 0
                const pct = isDone ? 100 : goalProgress(current, target)
                return (
                  <div key={b.id} className="rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{b.name}</span>
                      <div className="flex items-center gap-1.5">
                        {isDone ? (
                          <Badge tone="accent">Concluído</Badge>
                        ) : (
                          <Badge tone="goal">{b.targetDate ? monthLabel(b.targetDate) : 'Sem prazo'}</Badge>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => openEditGoal(b)}>Editar</Button>
                      </div>
                    </div>
                    <div className="mt-2 flex items-baseline justify-between text-xs text-muted">
                      <span><Money value={current} /> de <Money value={target} /></span>
                      <span>{fmtPct(pct)}</span>
                    </div>
                    <ProgressBar pct={pct} tone="goal" className="mt-2" />
                    <p className="mt-2 text-xs text-muted">
                      {isDone
                        ? <span className="text-positive">Objetivo atingido ✓</span>
                        : b.targetDate
                          ? renderSuggestion(requiredMonthlySaving(current, target, currentMonth, b.targetDate), current, target, b.targetDate)
                          : 'Sem prazo definido.'}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle
          right={
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowMovHistory((v) => !v)}>
                {showMovHistory ? 'Ocultar histórico' : 'Mostrar histórico'}
              </Button>
              <Button size="sm" variant="soft" onClick={openNewMovement}>+ Movimento</Button>
            </div>
          }
        >
          Movimentos previstos
        </SectionTitle>
        <Card className={visibleMovements.length === 0 ? undefined : 'p-0'}>
          {visibleMovements.length === 0 ? (
            <EmptyState title="Sem movimentos previstos" />
          ) : (
            <div className="overflow-x-auto thin-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="px-3 py-2">Mês</th>
                    <th className="px-3 py-2">Balde</th>
                    <th className="px-3 py-2">Descrição</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                    <th className="w-8 px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visibleMovements.map((m) => {
                    const isTransfer = !!m.transferGroupId
                    return (
                      <tr key={m.id} className="odd:bg-surface-2/40">
                        <td className="tnum whitespace-nowrap px-3 py-1.5 text-xs text-muted">{monthShort(m.month)}</td>
                        <td className="px-3 py-1.5 text-sm font-medium text-text">{bucketName(m.bucketId)}</td>
                        <td className="max-w-[160px] px-3 py-1.5 text-xs text-muted" title={m.description}>
                          <span className="flex items-center gap-1.5">
                            <span className="min-w-0 truncate">{m.description || '—'}</span>
                            {isTransfer && <Badge tone="accent">Transferência</Badge>}
                          </span>
                        </td>
                        <td
                          className={cx(
                            'tnum whitespace-nowrap px-3 py-1.5 text-right font-semibold',
                            m.amount >= 0 ? 'text-positive' : 'text-negative',
                          )}
                        >
                          {m.amount >= 0 ? '+' : ''}
                          {fmtEUR(m.amount)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right">
                          <button
                            onClick={() => openEditMovement(m)}
                            className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-text"
                            aria-label="Editar movimento"
                          >
                            ✎
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm('Apagar este movimento previsto?')) void remove('plannedMovements', m.id)
                            }}
                            className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-negative"
                            aria-label="Apagar movimento"
                          >
                            🗑
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle>Analytics &amp; Notas</SectionTitle>
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs font-medium text-muted">Taxa de poupança projetada ({monthLabel(firstMonth)})</div>
              <div className="tnum mt-1 text-2xl font-bold text-accent-strong">{fmtPct(rate)}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted">
                Crescimento do saldo total ({monthShort(firstMonth)} → {monthShort(lastMonth)})
              </div>
              <Money value={growth} className="mt-1 block text-2xl font-bold" />
            </div>
          </div>
          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-muted">Notas</label>
            <textarea
              defaultValue={data.meta[0]?.notes ?? ''}
              onBlur={(e) => void setMeta({ notes: e.target.value })}
              rows={4}
              placeholder="Notas sobre o planeamento a longo prazo…"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>
        </Card>
      </section>

      <Modal open={syncOpen} onClose={() => setSyncOpen(false)} title="Sincronizar com a realidade">
        <p className="mb-4 text-sm text-muted">
          Fixa os saldos do mês atual das projeções nos saldos reais e recalcula o futuro a partir daí.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSyncOpen(false)}>Cancelar</Button>
          <Button
            size="sm"
            onClick={() => {
              void syncProjectionToReality()
              setSyncOpen(false)
            }}
          >
            Confirmar
          </Button>
        </div>
      </Modal>

      <Modal open={goalModalOpen} onClose={closeGoalModal} title={editingGoalId ? 'Editar objetivo' : 'Novo objetivo'}>
        <div className="flex flex-col gap-3">
          <Input placeholder="Nome" value={goalNameDraft} onChange={(e) => setGoalNameDraft(e.target.value)} />
          <Input
            placeholder="Objetivo total (€)"
            inputMode="decimal"
            value={goalTargetDraft}
            onChange={(e) => setGoalTargetDraft(e.target.value)}
          />
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">Prazo (opcional)</span>
            <Input type="month" value={goalDateDraft} onChange={(e) => setGoalDateDraft(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeGoalModal}>Cancelar</Button>
            <Button
              size="sm"
              onClick={saveGoal}
              disabled={!goalNameDraft.trim() || parseAmount(goalTargetDraft) === null}
            >
              Guardar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={movModalOpen}
        onClose={closeMovModal}
        title={editingMovId || editingMovTransferGroupId ? 'Editar movimento previsto' : 'Novo movimento previsto'}
      >
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Mês</label>
            <Input type="month" value={movMonth} onChange={(e) => setMovMonth(e.target.value)} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Tipo</label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { kind: 'entrada' as const, label: 'Entrada', tone: 'text-positive border-positive bg-positive/10' },
                  { kind: 'saida' as const, label: 'Saída', tone: 'text-negative border-negative bg-negative/10' },
                  { kind: 'transferencia' as const, label: 'Transferência', tone: 'text-accent-strong border-accent bg-accent-soft' },
                ]
              ).map((opt) => (
                <button
                  key={opt.kind}
                  type="button"
                  onClick={() => setMovKind(opt.kind)}
                  className={cx(
                    'rounded-xl border py-2.5 text-xs font-bold transition-colors',
                    movKind === opt.kind ? opt.tone : 'border-border bg-surface text-muted',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {movKind === 'transferencia' ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">De</label>
                <Select value={movBucket} onChange={(e) => setMovBucket(e.target.value)} className="w-full">
                  <option value="">Escolhe…</option>
                  {buckets.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Para</label>
                <Select value={movToBucket} onChange={(e) => setMovToBucket(e.target.value)} className="w-full">
                  <option value="">Escolhe…</option>
                  {buckets.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </Select>
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Balde</label>
              <Select value={movBucket} onChange={(e) => setMovBucket(e.target.value)} className="w-full">
                <option value="">Escolhe um balde…</option>
                {buckets.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Valor</label>
            <Input
              placeholder="0,00"
              inputMode="decimal"
              value={movAmount}
              onChange={(e) => setMovAmount(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Descrição</label>
            <Input placeholder="Descrição" value={movDesc} onChange={(e) => setMovDesc(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeMovModal}>Cancelar</Button>
            <Button size="sm" onClick={saveMovement} disabled={movSaveDisabled}>Guardar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function renderSuggestion(suggestion: number | null, current: number, target: number, deadline: MonthKey): ReactNode {
  if (suggestion === null) {
    if (current >= target) return <span className="text-positive">Objetivo atingido ✓</span>
    return <span className="text-warn">Prazo passado ({monthLabel(deadline)}) — objetivo ainda não atingido.</span>
  }
  if (suggestion === 0) return <span className="text-positive">Objetivo atingido ✓</span>
  return (
    <span>
      Precisas de guardar ~<Money value={suggestion} className="font-semibold" />/mês até {monthLabel(deadline, true)}
    </span>
  )
}


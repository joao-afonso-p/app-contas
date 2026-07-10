import { useMemo, useState, type ReactNode } from 'react'
import {
  Badge, Button, Card, EmptyState, Input, Modal, Money, ProgressBar, SectionTitle, Select, cx,
} from '../components/ui'
import { EditableRow, GroupHeader, SpacerRow, TotalRow } from '../components/PlanTable'
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

export function Projecoes() {
  const data = useStore((s) => s.data)
  const setMeta = useStore((s) => s.setMeta)
  const setProjectionValue = useStore((s) => s.setProjectionValue)
  const syncProjectionToReality = useStore((s) => s.syncProjectionToReality)
  const put = useStore((s) => s.put)
  const remove = useStore((s) => s.remove)

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
  const [overrideTarget, setOverrideTarget] = useState<{ month: MonthKey; bucketId: string } | null>(null)
  const [overrideDraft, setOverrideDraft] = useState('')

  const openOverride = (month: MonthKey, bucketId: string) => {
    const existing = data.balanceOverrides.find((o) => o.id === `${month}_${bucketId}`)
    setOverrideDraft(existing ? String(existing.balance).replace('.', ',') : '')
    setOverrideTarget({ month, bucketId })
  }

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
  const [movModalOpen, setMovModalOpen] = useState(false)
  const [editingMovId, setEditingMovId] = useState<string | null>(null)
  const [movMonth, setMovMonth] = useState(currentMonth)
  const [movBucket, setMovBucket] = useState(buckets[0]?.id ?? '')
  const [movAmount, setMovAmount] = useState('')
  const [movDesc, setMovDesc] = useState('')

  // ---------- Toggles de visibilidade ----------
  const [showAllGoals, setShowAllGoals] = useState(false)
  const [showMovHistory, setShowMovHistory] = useState(false)

  const openNewMovement = () => {
    setEditingMovId(null)
    setMovMonth(currentMonth)
    setMovBucket(buckets[0]?.id ?? '')
    setMovAmount('')
    setMovDesc('')
    setMovModalOpen(true)
  }

  const openEditMovement = (m: PlannedMovement) => {
    setEditingMovId(m.id)
    setMovMonth(m.month)
    setMovBucket(m.bucketId)
    setMovAmount(String(m.amount).replace('.', ','))
    setMovDesc(m.description)
    setMovModalOpen(true)
  }

  const closeMovModal = () => {
    setMovModalOpen(false)
    setEditingMovId(null)
  }

  const saveMovement = () => {
    const amount = parseAmount(movAmount)
    if (amount === null || !movBucket) return
    void put('plannedMovements', {
      id: editingMovId ?? uid(),
      month: movMonth,
      bucketId: movBucket,
      amount,
      description: movDesc.trim(),
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
                    {months.map((m) => {
                      const hasOverride = data.balanceOverrides.some((o) => o.id === `${m}_${b.id}`)
                      return (
                        <td key={m} className="px-1 py-1 text-right">
                          <button
                            type="button"
                            onClick={() => openOverride(m, b.id)}
                            title={hasOverride ? 'Override' : undefined}
                            className={cx(
                              'tnum w-full rounded-lg px-2 py-1 text-right text-xs transition-colors hover:bg-surface-2',
                              hasOverride && 'bg-warn-soft',
                            )}
                          >
                            {fmtEUR(bucketBalance(balanceTable, b.id, m))}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
                <TotalRow label="Total" months={months} getValue={(m) => totalBalance(balanceTable, m)} />
              </tbody>
            </table>
          </div>
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
        <Card>
          {visibleMovements.length === 0 ? (
            <EmptyState title="Sem movimentos previstos" />
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {visibleMovements.map((m) => {
                const bucket = data.savingsBuckets.find((b) => b.id === m.bucketId)
                return (
                  <div key={m.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="tnum w-16 shrink-0 text-xs text-muted">{monthShort(m.month)}</span>
                      <span className="min-w-0 truncate text-sm font-medium text-text">{bucket?.name ?? '—'}</span>
                      {m.description && (
                        <span className="min-w-0 truncate text-xs text-muted" title={m.description}>{m.description}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                      <Money value={m.amount} className="w-20 shrink-0 text-right font-semibold" />
                      <button
                        onClick={() => openEditMovement(m)}
                        className="shrink-0 rounded-lg px-1.5 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text"
                        aria-label="Editar movimento"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm('Apagar este movimento previsto?')) void remove('plannedMovements', m.id)
                        }}
                        className="shrink-0 rounded-lg px-1.5 py-1 text-xs text-muted hover:bg-surface-2 hover:text-negative"
                        aria-label="Apagar movimento"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                )
              })}
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

      <Modal open={overrideTarget !== null} onClose={() => setOverrideTarget(null)} title="Override de saldo">
        {overrideTarget && (() => {
          const bucket = data.savingsBuckets.find((b) => b.id === overrideTarget.bucketId)
          const existing = data.balanceOverrides.find(
            (o) => o.id === `${overrideTarget.month}_${overrideTarget.bucketId}`,
          )
          return (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted">{bucket?.name} — {monthLabel(overrideTarget.month, true)}</p>
              <Input
                inputMode="decimal"
                placeholder="Saldo em €"
                value={overrideDraft}
                onChange={(e) => setOverrideDraft(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                {existing && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      void remove('balanceOverrides', existing.id)
                      setOverrideTarget(null)
                    }}
                  >
                    Remover override
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => {
                    const parsed = parseAmount(overrideDraft)
                    if (parsed === null) return
                    void put('balanceOverrides', {
                      id: `${overrideTarget.month}_${overrideTarget.bucketId}`,
                      month: overrideTarget.month,
                      bucketId: overrideTarget.bucketId,
                      balance: parsed,
                    })
                    setOverrideTarget(null)
                  }}
                >
                  Guardar
                </Button>
              </div>
            </div>
          )
        })()}
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

      <Modal open={movModalOpen} onClose={closeMovModal} title={editingMovId ? 'Editar movimento previsto' : 'Novo movimento previsto'}>
        <div className="flex flex-col gap-3">
          <Input type="month" value={movMonth} onChange={(e) => setMovMonth(e.target.value)} />
          <Select value={movBucket} onChange={(e) => setMovBucket(e.target.value)}>
            {buckets.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
          <Input
            placeholder="Valor € (negativo = saída)"
            inputMode="decimal"
            value={movAmount}
            onChange={(e) => setMovAmount(e.target.value)}
          />
          <Input placeholder="Descrição" value={movDesc} onChange={(e) => setMovDesc(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeMovModal}>Cancelar</Button>
            <Button size="sm" onClick={saveMovement} disabled={parseAmount(movAmount) === null || !movBucket}>Guardar</Button>
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


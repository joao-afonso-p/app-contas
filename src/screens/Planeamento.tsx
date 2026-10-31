import { useMemo, useState } from 'react'
import { MonthPicker } from '../components/MonthPicker'
import { RentExplanation, TransferToSavingsExplanation } from '../components/RentInfo'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  InfoHint,
  Input,
  MetricCard,
  Modal,
  Money,
  MoneyCell,
  ProgressBar,
  SectionTitle,
  Select,
} from '../components/ui'
import { ArchiveBlockedModal } from '../components/ArchiveBlocked'
import { allocationState, allocationSummary } from '../lib/calc/allocation'
import { withResidual } from '../lib/calc/archive'
import { bucketBalance, computeBalances, goalProgress, type BalanceTable } from '../lib/calc/balances'
import { allGroups, makeResolver } from '../lib/calc/categories'
import { buildMonthReport, detectFixedGroups, groupMonthTotals, recurringOverruns, type Overrun } from '../lib/calc/planVsActual'
import { addMonths, currentMonthKey, fmtDayMonth, fmtEUR, fmtPct, monthDiff, monthLabel, monthRange, parseAmount, todayISO, uid } from '../lib/format'
import {
  activeBuckets,
  allocationBlock,
  effectivePlan,
  firstPlanMonth,
  monthStartConfigOf,
  useStore,
} from '../store/useStore'
import { useIsDesktop } from '../lib/useIsDesktop'
import { START_DAY_CHOICES, addDaysISO, defaultStartDay, earliestApplyDate, monthStartDate } from '../lib/financialMonth'
import { IncomeTiming, timingLabel } from '../components/IncomeTiming'
import { LateIncomeCard } from '../components/LateIncomeCard'
import type { MonthKey, MonthlyPlan, SavingsBucket } from '../types'
import { TriangleAlert } from 'lucide-react'

export function Planeamento() {
  const month = useStore((s) => s.month)
  const setMonth = useStore((s) => s.setMonth)
  const setScreen = useStore((s) => s.setScreen)
  const data = useStore((s) => s.data)
  const setPlanValue = useStore((s) => s.setPlanValue)
  const applyPlan = useStore((s) => s.applyPlan)
  const reopenPlan = useStore((s) => s.reopenPlan)

  // Despesas acima do plano nos 3 últimos meses (até ao mês atual, sem contar o mês planeado).
  const overruns = useMemo(() => {
    const cur = currentMonthKey()
    const end = month > cur ? cur : addMonths(month, -1)
    const resolve = makeResolver(data)
    const groups = allGroups(data)
    const totals = groupMonthTotals(data.transactions, resolve)
    const reports = monthRange(addMonths(end, -2), end).map((m) => {
      const saved = data.monthlyPlans.find((p) => p.id === m)
      const planExpenses = saved ? saved.expenses : m >= cur ? effectivePlan(data, m).expenses : undefined
      return buildMonthReport({
        month: m, transactions: data.transactions, resolve, groups, subcategories: data.subcategories,
        planExpenses, fixedIds: detectFixedGroups(groups, totals, m),
      })
    })
    return recurringOverruns(reports, 3)
  }, [data, month])

  const plan = effectivePlan(data, month)
  const isClosed = plan.closed === true
  // No telemóvel o plano é só de leitura (edita-se no computador); só se pode aplicar.
  const isDesktop = useIsDesktop()
  const readOnly = isClosed || !isDesktop
  const summary = allocationSummary(plan, data.incomeSources)
  const geral = data.savingsBuckets.find((b) => b.name.toLowerCase() === 'geral')
  const alloc = allocationState(summary.unallocated)

  const diff = monthDiff(currentMonthKey(), month)
  const isExact = Math.abs(summary.unallocated) < 0.001
  const startCfg = monthStartConfigOf(data.meta[0])
  const setMonthStartOverride = useStore((s) => s.setMonthStartOverride)
  const [startOpen, setStartOpen] = useState(false)
  const [startDraft, setStartDraft] = useState(1)
  const hasOverride = Boolean(startCfg.overrides[month])
  const startIso = monthStartDate(startCfg, month)
  const endIso = addDaysISO(monthStartDate(startCfg, addMonths(month, 1)), -1)
  const earliest = earliestApplyDate(startCfg, month)
  const dayOk = diff <= 0 || (diff === 1 && todayISO() >= earliest)
  const canApply = !isClosed && isExact && dayOk
  const applyBlockedReason = isClosed
    ? undefined
    : !isExact
      ? 'A alocação tem de estar em 100% (sem diferença) para aplicar o plano.'
      : !dayOk
        ? diff >= 2
          ? 'Aplica primeiro o plano dos meses anteriores.'
          : `Só podes aplicar o plano de ${monthLabel(month)} a partir de ${fmtDayMonth(earliest)}.`
        : undefined

  const balanceTable = useMemo(
    () =>
      computeBalances({
        buckets: activeBuckets(data),
        plans: data.monthlyPlans,
        movements: data.savingsMovements,
        overrides: data.balanceOverrides,
        from: firstPlanMonth(data),
        to: month,
      }),
    [data, month],
  )

  return (
    <div className="fade-up flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-black">Planeamento</h1>
          {isClosed && <Badge tone="accent">Plano aplicado</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden md:inline-flex">
            <Button variant="ghost" size="sm" onClick={() => setScreen('historico')}>Ver histórico</Button>
          </span>
          <MonthPicker month={month} onChange={setMonth} minMonth={addMonths(currentMonthKey(), -2)} />
          {isClosed ? (
            <span className="hidden md:inline-flex">
              <Button variant="ghost" size="sm" onClick={() => void reopenPlan(month)}>Editar plano</Button>
            </span>
          ) : (
            <span title={applyBlockedReason}>
              <Button size="sm" disabled={!canApply} onClick={() => void applyPlan(month)}>
                Aplicar plano
              </Button>
            </span>
          )}
        </div>
      </div>

      <div className="-mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="tnum">
          Mês financeiro: <strong className="font-semibold text-text">{fmtDayMonth(startIso)} → {fmtDayMonth(endIso)}</strong>
          {hasOverride && ' · ajustado'}
        </span>
        {isDesktop && (
          <button
            onClick={() => { setStartDraft(startCfg.overrides[month] ?? defaultStartDay(startCfg, month)); setStartOpen(true) }}
            className="rounded-full border border-border bg-surface px-2.5 py-0.5 font-medium text-text hover:bg-surface-2"
          >
            alterar
          </button>
        )}
      </div>

      <Modal open={startOpen} onClose={() => setStartOpen(false)} title={`Início de ${monthLabel(month, true)}`}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            Escolhe a data em que este mês financeiro começa. Só afeta {monthLabel(month, true)}: os outros meses
            seguem o padrão das Definições.
          </p>
          {(() => {
            const dateOf = (d: number) => monthStartDate({ rules: [], overrides: { [month]: d } }, month)
            const def = defaultStartDay(startCfg, month)
            const choices = START_DAY_CHOICES.includes(startDraft) ? START_DAY_CHOICES : [startDraft, ...START_DAY_CHOICES]
            const draftCfg = { ...startCfg, overrides: { ...startCfg.overrides, [month]: startDraft } }
            return (
              <div className="flex flex-wrap items-center gap-3">
                <Select value={String(startDraft)} onChange={(e) => setStartDraft(Number(e.target.value))}>
                  {choices.map((d) => (
                    <option key={d} value={d}>{fmtDayMonth(dateOf(d))}{d === def ? ' (padrão)' : ''}</option>
                  ))}
                </Select>
                <span className="tnum text-sm text-text">
                  {fmtDayMonth(monthStartDate(draftCfg, month))} → {fmtDayMonth(addDaysISO(monthStartDate(draftCfg, addMonths(month, 1)), -1))}
                </span>
              </div>
            )
          })()}
          <div className="mt-1 flex justify-end gap-2">
            {hasOverride && (
              <Button variant="ghost" className="mr-auto" onClick={() => { void setMonthStartOverride(month, null); setStartOpen(false) }}>
                Repor padrão
              </Button>
            )}
            <Button variant="ghost" onClick={() => setStartOpen(false)}>Cancelar</Button>
            <Button onClick={() => { void setMonthStartOverride(month, startDraft); setStartOpen(false) }}>Guardar</Button>
          </div>
        </div>
      </Modal>

      {!isClosed && applyBlockedReason && (
        <p className="-mt-3 text-right text-xs text-muted">{applyBlockedReason}</p>
      )}

      <p className="-mt-3 text-xs text-muted md:hidden">
        No telemóvel o plano é só de leitura — edita-o no computador.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4">
        <MetricCard
          label="Deixar na conta corrente"
          value={fmtEUR(summary.leaveInCurrent)}
          title="Total das despesas do mês — fica na conta corrente"
        />
        <MetricCard
          label="Transferir agora para a poupança"
          value={fmtEUR(summary.transferToSavings)}
          hint={summary.rentIncome > 0.004 ? `e mais ${fmtEUR(summary.rentIncome)} quando chegar` : undefined}
          info={
            <TransferToSavingsExplanation
              totalSavings={summary.totalSavings}
              rentIncome={summary.rentIncome}
              transferToSavings={summary.transferToSavings}
            />
          }
        />
        <div className="col-span-2 flex sm:col-span-1 [&>*]:flex-1">
          <MetricCard
            label={alloc.state === 'excesso' ? 'Excesso' : 'Por alocar'}
            value={fmtEUR(alloc.amount)}
            tone={alloc.state === 'certo' ? 'positive' : alloc.state === 'falta' ? 'warn' : 'negative'}
            hint={
              alloc.state === 'excesso'
                ? `${fmtPct(summary.allocationPct)} alocado, a mais do que o income`
                : `${fmtPct(summary.allocationPct)} alocado`
            }
          />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface px-5 py-4 shadow-sm md:sticky md:top-2 md:z-20">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold">
            {fmtPct(summary.allocationPct)} alocado
            <span className="ml-1.5 font-normal text-muted">
              {alloc.state === 'certo'
                ? '· tudo alocado'
                : alloc.state === 'falta'
                  ? `· faltam ${fmtEUR(alloc.amount)}`
                  : `· excesso de ${fmtEUR(alloc.amount)}`}
            </span>
          </div>
          {!readOnly && summary.unallocated > 0.005 && geral && (
            <Button
              size="sm"
              variant="soft"
              onClick={() =>
                void setPlanValue(month, 'savings', geral.id, (plan?.savings[geral.id] || 0) + summary.unallocated)
              }
            >
              Sobra para Geral
            </Button>
          )}
        </div>
        <ProgressBar
          pct={summary.allocationPct}
          tone={alloc.state === 'certo' ? 'accent' : alloc.state === 'falta' ? 'warn' : 'negative'}
          className="mt-3"
        />
      </div>

      <LateIncomeCard month={month} />

      <LineSection
        title="Income"
        section="income"
        collection="incomeSources"
        docs={withResidual(data.incomeSources, [plan], 'income')}
        month={month}
        plan={plan}
        locked={readOnly}
        footerLabel="Total"
        newPlaceholder="Nova fonte de income…"
        showRentBadge
      />

      <LineSection
        title="Despesas"
        section="expenses"
        collection="expenseCategories"
        docs={withResidual(data.expenseCategories, [plan], 'expenses')}
        month={month}
        plan={plan}
        locked={readOnly}
        footerLabel="Deixar na conta corrente"
        newPlaceholder="Nova despesa…"
        overruns={overruns}
      />

      <SavingsSection month={month} plan={plan} balanceTable={balanceTable} locked={readOnly} />

      <AutoInvestmentSection month={month} plan={plan} locked={readOnly} />
    </div>
  )
}

// ---------- Income / Despesas ----------

interface SimpleDoc {
  id: string
  name: string
  archived: boolean
  order: number
  isRent?: boolean
  expectedDay?: number
  // Arquivado mas ainda com valor neste mês: mostrado para poder ser corrigido.
  residual?: boolean
}

function LineSection({
  title,
  section,
  collection,
  docs,
  month,
  plan,
  locked,
  footerLabel,
  newPlaceholder,
  showRentBadge,
  overruns,
}: {
  title: string
  section: 'income' | 'expenses'
  collection: 'incomeSources' | 'expenseCategories'
  docs: SimpleDoc[]
  month: MonthKey
  plan: MonthlyPlan | undefined
  locked?: boolean
  footerLabel: string
  newPlaceholder: string
  showRentBadge?: boolean
  overruns?: Map<string, Overrun>
}) {
  const put = useStore((s) => s.put)
  const data = useStore((s) => s.data)
  const setPlanValue = useStore((s) => s.setPlanValue)
  const setScreen = useStore((s) => s.setScreen)
  const [newName, setNewName] = useState('')
  const [newTiming, setNewTiming] = useState<{ isRent: boolean; expectedDay?: number }>({ isRent: false })
  const [openWarn, setOpenWarn] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<{ name: string; planeamento: MonthKey[]; projecoes: MonthKey[] } | null>(null)

  const archive = (doc: SimpleDoc) => {
    const block = allocationBlock(data, collection, doc.id)
    if (block) {
      setBlocked({ name: doc.name, ...block })
      return
    }
    if (window.confirm(`Arquivar "${doc.name}"?`)) void put(collection, { ...doc, archived: true } as never)
  }

  const values = plan?.[section] ?? {}
  const total = docs.reduce((acc, d) => acc + (values[d.id] || 0), 0)

  const add = () => {
    const name = newName.trim()
    if (!name) return
    const doc: SimpleDoc = { id: uid(), name, archived: false, order: docs.length }
    if (collection === 'incomeSources') {
      doc.isRent = newTiming.isRent
      if (newTiming.isRent && newTiming.expectedDay) doc.expectedDay = newTiming.expectedDay
    }
    void put(collection, doc as never)
    setNewName('')
    setNewTiming({ isRent: false })
  }

  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      {docs.length === 0 ? (
        <EmptyState title="Ainda sem itens" hint="Adiciona o primeiro abaixo." />
      ) : (
        <ul className="divide-y divide-border">
          {docs.map((doc) => (
            <li key={doc.id} className="py-2">
             <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm">{doc.name}</span>
                {overruns?.has(doc.id) && (
                  <button
                    type="button"
                    onClick={() => setOpenWarn(openWarn === doc.id ? null : doc.id)}
                    aria-expanded={openWarn === doc.id}
                    aria-label={`${doc.name}: acima do plano há 3 meses — ver detalhes`}
                    title="Acima do plano há 3 meses — toca para ver"
                    className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn"
                  >
                    <TriangleAlert size={13} strokeWidth={2} className="mr-1 inline align-[-2px]" aria-hidden="true" />3 meses acima ▾
                  </button>
                )}
                {doc.residual && (
                  <span title="Arquivada, mas ainda com valor neste mês — põe a 0 (ou passa para outra linha). Podes reativá-la em Definições.">
                    <Badge tone="warn">Arquivada</Badge>
                  </span>
                )}
                {showRentBadge && doc.isRent && (
                  <span title="Chega depois da transferência do mês — transfere-se quando entrar">
                    <Badge>{timingLabel(doc.expectedDay)}</Badge>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <MoneyCell
                  value={values[doc.id]}
                  onChange={(v) => void setPlanValue(month, section, doc.id, v)}
                  disabled={locked}
                />
                {doc.residual ? (
                  <button
                    onClick={() => void put(collection, { ...doc, residual: undefined, archived: false } as never)}
                    className="hidden rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text md:block"
                    title="Reativar"
                  >
                    ↺
                  </button>
                ) : (
                  <button
                    onClick={() => archive(doc)}
                    className="hidden rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-negative md:block"
                    aria-label={`Arquivar ${doc.name}`}
                    title="Arquivar"
                  >
                    ×
                  </button>
                )}
              </div>
             </div>
             {overruns?.has(doc.id) && openWarn === doc.id && (() => {
               const o = overruns.get(doc.id)!
               return (
                 <div className="mt-2 rounded-xl bg-warn-soft/60 p-3 text-xs text-text">
                   <p className="mb-1.5 font-semibold">Acima do plano há 3 meses seguidos</p>
                   <ul className="mb-2 flex flex-col gap-0.5 text-muted">
                     {o.months.map((m) => (
                       <li key={m.month} className="tnum">
                         {monthLabel(m.month)}: {fmtEUR(m.spent)} gastos de {fmtEUR(m.planned)} planeados
                         {' '}(<span className="text-negative">+{fmtEUR(m.spent - m.planned)}</span>)
                       </li>
                     ))}
                   </ul>
                   <p className="mb-2 text-muted">
                     Em média {fmtEUR(o.avgExcess)} acima por mês. Pode justificar subir o valor, mas não
                     subas tudo de uma vez: vê primeiro no Analytics se há gastos que podes cortar e ajusta
                     só o que fizer sentido.
                   </p>
                   {/* O Analytics só existe no computador */}
                   <span className="hidden md:inline-block">
                     <Button size="sm" variant="soft" onClick={() => setScreen('budgets')}>Ver no Analytics</Button>
                   </span>
                 </div>
               )
             })()}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{footerLabel}</span>
        <Money value={total} className="text-sm font-bold" />
      </div>
      <div className="mt-3 hidden flex-wrap items-center gap-2 md:flex">
        <Input
          placeholder={newPlaceholder}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          className="min-w-0 flex-1"
        />
        {collection === 'incomeSources' && (
          <>
            <IncomeTiming {...newTiming} onChange={setNewTiming} />
            <InfoHint label="Quando chega?"><RentExplanation /></InfoHint>
          </>
        )}
        <Button variant="soft" onClick={add} disabled={!newName.trim()}>
          Adicionar
        </Button>
      </div>
      {blocked && (
        <ArchiveBlockedModal
          name={blocked.name}
          action="arquivar"
          planeamento={blocked.planeamento}
          projecoes={blocked.projecoes}
          onClose={() => setBlocked(null)}
          onGo={(screen) => { setBlocked(null); setScreen(screen) }}
        />
      )}
    </Card>
  )
}

// ---------- Poupanças ----------

type GoalAction = 'partial' | 'full' | 'postpone'

function SavingsSection({
  month,
  plan,
  balanceTable,
  locked,
}: {
  month: MonthKey
  plan: MonthlyPlan | undefined
  balanceTable: BalanceTable
  locked?: boolean
}) {
  const data = useStore((s) => s.data)
  const put = useStore((s) => s.put)
  const setPlanValue = useStore((s) => s.setPlanValue)
  const goalPartialPayment = useStore((s) => s.goalPartialPayment)
  const goalComplete = useStore((s) => s.goalComplete)

  const setScreen = useStore((s) => s.setScreen)

  const active = withResidual(data.savingsBuckets, plan ? [plan] : [], 'savings')
  const total = active.reduce((acc, b) => acc + (plan?.savings[b.id] || 0), 0)

  const [actionBucket, setActionBucket] = useState<SavingsBucket | null>(null)
  const [actionType, setActionType] = useState<GoalAction | null>(null)
  const [amountDraft, setAmountDraft] = useState('')
  const [descDraft, setDescDraft] = useState('')
  const [dateDraft, setDateDraft] = useState('')

  const openAction = (bucket: SavingsBucket, type: GoalAction) => {
    setActionBucket(bucket)
    setActionType(type)
    setAmountDraft('')
    setDescDraft('')
    setDateDraft(bucket.targetDate || '')
  }

  const closeAction = () => {
    setActionBucket(null)
    setActionType(null)
  }

  const submitAction = () => {
    if (!actionBucket || !actionType) return
    if (actionType === 'partial') {
      const amount = parseAmount(amountDraft)
      if (amount === null || amount <= 0) return
      void goalPartialPayment(actionBucket.id, amount, descDraft.trim())
    } else if (actionType === 'full') {
      const saldo = bucketBalance(balanceTable, actionBucket.id, month)
      void (async () => {
        await goalPartialPayment(actionBucket.id, saldo, descDraft.trim() || `Pagamento total — ${actionBucket.name}`)
        await goalComplete(actionBucket.id)
      })()
    } else if (actionType === 'postpone') {
      if (!dateDraft) return
      void put('savingsBuckets', { ...actionBucket, targetDate: dateDraft })
    }
    closeAction()
  }

  const actionTitle =
    actionType === 'partial' ? 'Pagamento parcial' : actionType === 'full' ? 'Pagamento total' : 'Adiar prazo'

  return (
    <Card>
      <SectionTitle
        right={
          <span className="hidden md:inline-flex">
            <Button variant="ghost" size="sm" onClick={() => setScreen('definicoes')}>
              Gerir baldes
            </Button>
          </span>
        }
      >
        Poupanças
      </SectionTitle>
      {active.length === 0 ? (
        <EmptyState title="Ainda sem baldes de poupança" hint="Cria o primeiro em Definições → Poupanças." />
      ) : (
        <ul className="divide-y divide-border">
          {active.map((bucket) => {
            const isGoal = bucket.kind === 'goal' && !bucket.residual
            const saldo = isGoal ? bucketBalance(balanceTable, bucket.id, month) : 0
            const pct = isGoal ? goalProgress(saldo, bucket.targetAmount ?? 0) : 0
            return (
              <li key={bucket.id} className="flex flex-col gap-2 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm">{bucket.name}</span>
                    {isGoal && <Badge tone="goal">Objetivo</Badge>}
                    {bucket.residual && (
                      <span title="Balde arquivado/concluído, mas ainda com valor neste mês — põe a 0 para deixar de contar.">
                        <Badge tone="warn">Arquivado</Badge>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <MoneyCell
                      value={plan?.savings[bucket.id]}
                      onChange={(v) => void setPlanValue(month, 'savings', bucket.id, v)}
                      disabled={locked}
                    />
                  </div>
                </div>
                {isGoal && (
                  <div className="flex flex-col gap-1">
                    <ProgressBar pct={pct} tone="goal" />
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="tnum text-muted">
                        {fmtEUR(saldo)} / {fmtEUR(bucket.targetAmount ?? 0)}
                        {bucket.targetDate && ` · até ${monthLabel(bucket.targetDate)}`}
                      </span>
                      <div className="hidden flex-wrap gap-1 md:flex">
                        <button
                          className="rounded-lg px-2 py-1 font-medium text-accent-strong hover:bg-accent-soft"
                          onClick={() => openAction(bucket, 'partial')}
                        >
                          Pagamento parcial
                        </button>
                        <button
                          className="rounded-lg px-2 py-1 font-medium text-accent-strong hover:bg-accent-soft"
                          onClick={() => openAction(bucket, 'full')}
                        >
                          Pagamento total
                        </button>
                        <button
                          className="rounded-lg px-2 py-1 font-medium text-accent-strong hover:bg-accent-soft"
                          onClick={() => void goalComplete(bucket.id)}
                        >
                          Concluir
                        </button>
                        <button
                          className="rounded-lg px-2 py-1 font-medium text-accent-strong hover:bg-accent-soft"
                          onClick={() => openAction(bucket, 'postpone')}
                        >
                          Adiar prazo
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Total alocado</span>
        <Money value={total} className="text-sm font-bold" />
      </div>

      <Modal open={actionType !== null} onClose={closeAction} title={actionTitle}>
        {actionType === 'partial' && (
          <div className="flex flex-col gap-3">
            <Input placeholder="Valor €" inputMode="decimal" value={amountDraft} onChange={(e) => setAmountDraft(e.target.value)} />
            <Input placeholder="Descrição (opcional)" value={descDraft} onChange={(e) => setDescDraft(e.target.value)} />
            <Button onClick={submitAction} disabled={parseAmount(amountDraft) === null}>
              Confirmar
            </Button>
          </div>
        )}
        {actionType === 'full' && actionBucket && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">
              Vai registar um pagamento de {fmtEUR(bucketBalance(balanceTable, actionBucket.id, month))} e concluir o
              objetivo.
            </p>
            <Input placeholder="Descrição (opcional)" value={descDraft} onChange={(e) => setDescDraft(e.target.value)} />
            <Button onClick={submitAction}>Confirmar</Button>
          </div>
        )}
        {actionType === 'postpone' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">Novo prazo</span>
              <Input type="month" value={dateDraft} onChange={(e) => setDateDraft(e.target.value)} />
            </div>
            <Button onClick={submitAction} disabled={!dateDraft}>
              Confirmar
            </Button>
          </div>
        )}
      </Modal>
    </Card>
  )
}

// ---------- Débitos automáticos (veículos) ----------

function AutoInvestmentSection({
  month,
  plan,
  locked,
}: {
  month: MonthKey
  plan: MonthlyPlan | undefined
  locked?: boolean
}) {
  const data = useStore((s) => s.data)
  const setPlanValue = useStore((s) => s.setPlanValue)
  const setScreen = useStore((s) => s.setScreen)

  const vehicles = withResidual(data.investmentVehicles, plan ? [plan] : [], 'autoInvestments')
  const values = plan?.autoInvestments ?? {}
  const total = vehicles.reduce((acc, v) => acc + (values[v.id] || 0), 0)

  if (vehicles.length === 0) return null

  return (
    <Card>
      <SectionTitle
        right={
          <span className="hidden md:inline-flex">
            <Button variant="ghost" size="sm" onClick={() => setScreen('definicoes')}>
              Gerir veículos
            </Button>
          </span>
        }
      >
        Débitos automáticos
      </SectionTitle>
      <p className="mb-2 text-xs text-muted">
        Dinheiro debitado automaticamente da conta direto para um veículo de investimento (ex. PPR) — não passa pela poupança partilhada.
      </p>
      <ul className="divide-y divide-border">
        {vehicles.map((vehicle) => (
          <li key={vehicle.id} className="flex items-center justify-between gap-2 py-2">
            <span className="flex items-center gap-2 truncate text-sm">
              {vehicle.name}
              {vehicle.residual && <Badge tone="warn">Arquivado</Badge>}
            </span>
            <MoneyCell
              value={values[vehicle.id]}
              onChange={(v) => void setPlanValue(month, 'autoInvestments', vehicle.id, v)}
              disabled={locked}
            />
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Total débitos automáticos</span>
        <Money value={total} className="text-sm font-bold" />
      </div>
    </Card>
  )
}


import { useMemo, useState } from 'react'
import { MonthPicker } from '../components/MonthPicker'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  MetricCard,
  Modal,
  Money,
  MoneyCell,
  ProgressBar,
  SectionTitle,
} from '../components/ui'
import { allocationSummary } from '../lib/calc/allocation'
import { bucketBalance, computeBalances, goalProgress, type BalanceTable } from '../lib/calc/balances'
import { addMonths, currentMonthKey, dayOfMonth, fmtEUR, fmtPct, monthDiff, monthLabel, parseAmount, uid } from '../lib/format'
import {
  activeBuckets,
  activeExpenseCategories,
  activeIncomeSources,
  activeVehicles,
  effectivePlan,
  firstPlanMonth,
  useStore,
} from '../store/useStore'
import type { MonthKey, MonthlyPlan, SavingsBucket } from '../types'

export function Planeamento() {
  const month = useStore((s) => s.month)
  const setMonth = useStore((s) => s.setMonth)
  const setScreen = useStore((s) => s.setScreen)
  const data = useStore((s) => s.data)
  const setPlanValue = useStore((s) => s.setPlanValue)
  const applyPlan = useStore((s) => s.applyPlan)
  const reopenPlan = useStore((s) => s.reopenPlan)

  const plan = effectivePlan(data, month)
  const isClosed = plan.closed === true
  const summary = allocationSummary(plan, data.incomeSources)
  const geral = data.savingsBuckets.find((b) => b.name.toLowerCase() === 'geral')
  const isBalanced = Math.abs(summary.unallocated) < 0.005

  const diff = monthDiff(currentMonthKey(), month)
  const isExact = Math.abs(summary.unallocated) < 0.001
  const dayOk = diff <= 0 || (diff === 1 && dayOfMonth() >= 25)
  const canApply = !isClosed && isExact && dayOk
  const applyBlockedReason = isClosed
    ? undefined
    : !isExact
      ? 'A alocação tem de estar em 100% (sem diferença) para aplicar o plano.'
      : !dayOk
        ? diff >= 2
          ? 'Aplica primeiro o plano dos meses anteriores.'
          : `Só podes aplicar o plano de ${monthLabel(month)} a partir do dia 25 de ${monthLabel(currentMonthKey())}.`
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
          <Button variant="ghost" size="sm" onClick={() => setScreen('historico')}>Ver histórico</Button>
          <MonthPicker month={month} onChange={setMonth} minMonth={addMonths(currentMonthKey(), -2)} />
          {isClosed ? (
            <Button variant="ghost" size="sm" onClick={() => void reopenPlan(month)}>Editar plano</Button>
          ) : (
            <span title={applyBlockedReason}>
              <Button size="sm" disabled={!canApply} onClick={() => void applyPlan(month)}>
                Aplicar plano
              </Button>
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Deixar na conta corrente"
          value={fmtEUR(summary.leaveInCurrent)}
          title="Total das despesas do mês — fica na conta corrente"
        />
        <MetricCard
          label="Transferir para a poupança"
          value={fmtEUR(summary.transferToSavings)}
          hint={`já descontadas rendas de ${fmtEUR(summary.rentIncome)}`}
          title="Poupanças menos rendas: transfere-se logo com o salário; quando a renda chegar vai direta para a poupança"
        />
        <MetricCard
          label="Por alocar"
          value={fmtEUR(summary.unallocated)}
          tone={isBalanced ? 'positive' : summary.unallocated > 0 ? 'warn' : 'negative'}
          hint={`${fmtPct(summary.allocationPct)} alocado`}
        />
      </div>

      <Card className="sticky top-2 z-20 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold">
            {fmtPct(summary.allocationPct)} alocado
            <span className="ml-2 font-normal text-muted">
              {isBalanced
                ? '— tudo alocado'
                : summary.unallocated > 0.005
                  ? `— faltam ${fmtEUR(summary.unallocated)}`
                  : `— excesso de ${fmtEUR(Math.abs(summary.unallocated))}`}
            </span>
          </div>
          {!isClosed && summary.unallocated > 0.005 && geral && (
            <Button
              size="sm"
              variant="soft"
              onClick={() =>
                void setPlanValue(month, 'savings', geral.id, (plan?.savings[geral.id] || 0) + summary.unallocated)
              }
            >
              Transferir sobra para Geral
            </Button>
          )}
        </div>
        <ProgressBar pct={summary.allocationPct} tone={isBalanced ? 'accent' : 'warn'} className="mt-3" />
      </Card>

      <LineSection
        title="Income"
        section="income"
        collection="incomeSources"
        docs={activeIncomeSources(data)}
        month={month}
        plan={plan}
        locked={isClosed}
        footerLabel="Total"
        newPlaceholder="Nova fonte de income…"
        showRentBadge
      />

      <LineSection
        title="Despesas"
        section="expenses"
        collection="expenseCategories"
        docs={activeExpenseCategories(data)}
        month={month}
        plan={plan}
        locked={isClosed}
        footerLabel="Deixar na conta corrente"
        newPlaceholder="Nova despesa…"
      />

      <SavingsSection month={month} plan={plan} balanceTable={balanceTable} locked={isClosed} />

      <AutoInvestmentSection month={month} plan={plan} locked={isClosed} />
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
}) {
  const put = useStore((s) => s.put)
  const setPlanValue = useStore((s) => s.setPlanValue)
  const [newName, setNewName] = useState('')
  const [newIsRent, setNewIsRent] = useState(false)

  const values = plan?.[section] ?? {}
  const total = docs.reduce((acc, d) => acc + (values[d.id] || 0), 0)

  const add = () => {
    const name = newName.trim()
    if (!name) return
    const doc: SimpleDoc = { id: uid(), name, archived: false, order: docs.length }
    if (collection === 'incomeSources') doc.isRent = newIsRent
    void put(collection, doc as never)
    setNewName('')
    setNewIsRent(false)
  }

  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      {docs.length === 0 ? (
        <EmptyState title="Ainda sem itens" hint="Adiciona o primeiro abaixo." />
      ) : (
        <ul className="divide-y divide-border">
          {docs.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-2 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm">{doc.name}</span>
                {showRentBadge && doc.isRent && <Badge>Renda</Badge>}
              </div>
              <div className="flex items-center gap-1">
                <MoneyCell
                  value={values[doc.id]}
                  onChange={(v) => void setPlanValue(month, section, doc.id, v)}
                  disabled={locked}
                />
                <button
                  onClick={() => {
                    if (window.confirm(`Arquivar "${doc.name}"?`)) void put(collection, { ...doc, archived: true } as never)
                  }}
                  className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-negative"
                  aria-label={`Arquivar ${doc.name}`}
                  title="Arquivar"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{footerLabel}</span>
        <Money value={total} className="text-sm font-bold" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          placeholder={newPlaceholder}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          className="min-w-0 flex-1"
        />
        {collection === 'incomeSources' && (
          <label className="flex items-center gap-1 text-xs text-muted">
            <input
              type="checkbox"
              checked={newIsRent}
              onChange={(e) => setNewIsRent(e.target.checked)}
            />
            É renda
          </label>
        )}
        <Button variant="soft" onClick={add} disabled={!newName.trim()}>
          Adicionar
        </Button>
      </div>
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

  const active = activeBuckets(data)
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
          <Button variant="ghost" size="sm" onClick={() => setScreen('definicoes')}>
            Gerir baldes
          </Button>
        }
      >
        Poupanças
      </SectionTitle>
      {active.length === 0 ? (
        <EmptyState title="Ainda sem baldes de poupança" hint="Cria o primeiro em Definições → Poupanças." />
      ) : (
        <ul className="divide-y divide-border">
          {active.map((bucket) => {
            const isGoal = bucket.kind === 'goal'
            const saldo = isGoal ? bucketBalance(balanceTable, bucket.id, month) : 0
            const pct = isGoal ? goalProgress(saldo, bucket.targetAmount ?? 0) : 0
            return (
              <li key={bucket.id} className="flex flex-col gap-2 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm">{bucket.name}</span>
                    {isGoal && <Badge tone="goal">Objetivo</Badge>}
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
                      <div className="flex flex-wrap gap-1">
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

  const vehicles = activeVehicles(data)
  const values = plan?.autoInvestments ?? {}
  const total = vehicles.reduce((acc, v) => acc + (values[v.id] || 0), 0)

  if (vehicles.length === 0) return null

  return (
    <Card>
      <SectionTitle
        right={
          <Button variant="ghost" size="sm" onClick={() => setScreen('definicoes')}>
            Gerir veículos
          </Button>
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
            <span className="truncate text-sm">{vehicle.name}</span>
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

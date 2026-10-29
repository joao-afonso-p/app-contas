import { Fragment, useMemo, useState } from 'react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArchiveBlockedModal } from '../components/ArchiveBlocked'
import { BackupSettings } from '../components/Backup'
import { InstallSettingsSection } from '../components/InstallGuide'
import { RentExplanation } from '../components/RentInfo'
import { Badge, Button, Card, InfoHint, Input, Modal, Money, MoneyCell, SectionTitle, Select, cx } from '../components/ui'
import { bucketBalance, computeBalances } from '../lib/calc/balances'
import {
  activeGroups, legacyNeedingMapping, makeResolver, newSubcategory, subcategoriesOf, suggestGroupForLegacy, type Group,
} from '../lib/calc/categories'
import { normalizeDesc } from '../lib/calc/budgets'
import { findOrphanExpenses, planMerge } from '../lib/calc/mergeExpenses'
import { currentMonthKey, fmtEUR, monthLabel, monthShort, uid } from '../lib/format'
import { allocationBlock, firstPlanMonth, isAutoBucketMovement, useStore } from '../store/useStore'
import { clearOpenAiKey, getOpenAiKey, setOpenAiKey } from '../lib/apiKey'
import type { BucketKind, CollectionName, MonthKey, SavingsBucket, TransactionCategory } from '../types'

type EditableList = {
  title: string
  collection: CollectionName
  hint?: string
}

const LISTS: EditableList[] = [
  { title: 'Fontes de income', collection: 'incomeSources', hint: 'Marca como renda o que chega a meio do mês' },
  {
    title: 'Despesas do planeamento',
    collection: 'expenseCategories',
    hint: 'São as categorias principais dos Gastos e do Analytics: o que planeias aqui compara-se com o que gastas. Os detalhes (ex.: eletricidade, água) são subcategorias — ver abaixo.',
  },
  {
    title: 'Veículos de investimento',
    collection: 'investmentVehicles',
    hint: 'Ex.: XTB, Certificados de Aforro, ETFs, Seguro de capitalização',
  },
]

export function Definicoes() {
  const { mode, spaceCode, firebaseAvailable, data } = useStore()
  const joinSpace = useStore((s) => s.joinSpace)
  const createPremiumSpace = useStore((s) => s.createPremiumSpace)
  const leaveSpace = useStore((s) => s.leaveSpace)
  const resetAccount = useStore((s) => s.resetAccount)

  const [joinOpen, setJoinOpen] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [premiumCode, setPremiumCode] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState('')

  const doJoin = async (c: string) => {
    setBusy(true)
    setError('')
    try {
      await joinSpace(c, true)
      setJoinOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao entrar no espaço')
    } finally {
      setBusy(false)
    }
  }

  const doCreate = async () => {
    setCreateBusy(true)
    setCreateError('')
    try {
      await createPremiumSpace(premiumCode)
      setCreateOpen(false)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Erro ao criar o espaço')
    } finally {
      setCreateBusy(false)
    }
  }

  return (
    <div className="fade-up flex flex-col gap-6">
      <h1 className="text-xl font-black">Definições</h1>

      <InstallSettingsSection />

      <section>
        <SectionTitle>Sincronização</SectionTitle>
        <Card>
          {mode === 'space' ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Badge tone="accent">Sincronizado</Badge>
                <span className="text-sm text-muted">Este dispositivo está ligado a um espaço partilhado.</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-semibold tracking-wide">{spaceCode}</code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void navigator.clipboard.writeText(spaceCode ?? '')
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1500)
                  }}
                >
                  {copied ? 'Copiado ✓' : 'Copiar'}
                </Button>
              </div>
              <p className="text-xs text-muted">
                Partilha este código com a outra pessoa: basta introduzi-lo noutro dispositivo para ver os mesmos dados.
              </p>
              <div className="flex gap-2">
                <Button variant="danger" size="sm" onClick={() => void leaveSpace()}>Sair do espaço (voltar a local)</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Badge>Local</Badge>
                <span className="text-sm text-muted">Os dados estão só neste dispositivo.</span>
              </div>
              {firebaseAvailable ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    Criar espaço novo (código de acesso)
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setJoinOpen(true)}>
                    Entrar com código existente
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-warn">
                  Para sincronizar entre dispositivos é preciso configurar o Firebase no ficheiro .env (ver README).
                </p>
              )}
              {error && <p className="text-sm text-negative">{error}</p>}
            </div>
          )}
        </Card>
      </section>

      {mode === 'local' && (
        <section>
          <SectionTitle>Dados</SectionTitle>
          <Card>
            <BackupSettings />
            <p className="mb-3 text-sm text-muted">
              Apaga tudo — categorias, baldes, objetivos, veículos e todo o histórico — e volta a
              mostrar o onboarding para configurares a conta outra vez do zero.
            </p>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (
                  window.confirm(
                    'Tens a certeza? Isto apaga definitivamente tudo (categorias, baldes, objetivos, veículos e histórico) e volta ao onboarding.',
                  )
                ) {
                  void resetAccount()
                }
              }}
            >
              Repor conta (recomeçar do zero)
            </Button>
          </Card>
        </section>
      )}

      <AutoMovementsSection />

      <SavingsSection />

      {LISTS.map((list) => (
        <Fragment key={list.collection}>
          <ListEditor {...list} />
          {list.collection === 'expenseCategories' && <SubcategoriesSection />}
          {list.collection === 'expenseCategories' && <OrphanExpensesSection />}
        </Fragment>
      ))}

      <LegacyCategoriesSection />

      <OpenAiSection />

      <section>
        <SectionTitle>Sobre</SectionTitle>
        <Card>
          <p className="text-sm text-muted">
            Contas — app privada de finanças pessoais. Os saldos são sempre calculados a partir do
            planeamento e dos movimentos; nada é escrito à mão. {data.savingsBuckets.length} baldes,{' '}
            {data.transactions.length} gastos registados.
          </p>
          <p className="mt-2 text-xs text-muted">
            Para sabermos quantas pessoas usam a app, contamos visitas de forma anónima com o GoatCounter
            (sem cookies e sem guardar o IP). Só é registado qual o ecrã aberto — nunca valores, nomes,
            categorias ou o código de espaço.
          </p>
        </Card>
      </section>

      <Modal open={joinOpen} onClose={() => setJoinOpen(false)} title="Entrar num espaço">
        <p className="mb-3 text-sm text-muted">
          Os dados locais são migrados para o espaço se este estiver vazio.
        </p>
        <div className="flex gap-2">
          <Input placeholder="k7m2-9xqa-4pl3-vn8w" value={code} onChange={(e) => setCode(e.target.value)} />
          <Button disabled={busy || !code.trim()} onClick={() => void doJoin(code)}>
            {busy ? '…' : 'Entrar'}
          </Button>
        </div>
        {error && <p className="mt-2 text-sm text-negative">{error}</p>}
      </Modal>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Criar um espaço novo">
        <p className="mb-3 text-sm text-muted">
          Precisas de um código de acesso premium para criar um espaço sincronizado novo. Os dados
          locais são migrados automaticamente para o espaço criado.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="Código de acesso"
            value={premiumCode}
            onChange={(e) => setPremiumCode(e.target.value)}
          />
          <Button disabled={createBusy || !premiumCode.trim()} onClick={() => void doCreate()}>
            {createBusy ? '…' : 'Criar espaço'}
          </Button>
        </div>
        {createError && <p className="mt-2 text-sm text-negative">{createError}</p>}
      </Modal>
    </div>
  )
}

function OpenAiSection() {
  const [key, setKey] = useState(() => getOpenAiKey())
  const [saved, setSaved] = useState(false)
  const hasKey = getOpenAiKey().length > 0

  const save = () => {
    setOpenAiKey(key)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const clear = () => {
    clearOpenAiKey()
    setKey('')
    setSaved(false)
  }

  return (
    <section>
      <SectionTitle>OpenAI (importar por IA)</SectionTitle>
      <Card>
        <p className="mb-3 text-sm text-muted">
          Cola aqui a tua API key do OpenAI para usar o "Extrair de ficheiro (PDF/Excel)" na
          importação de extratos. A key fica guardada <strong className="text-text">só neste dispositivo</strong>{' '}
          (não é sincronizada nem partilhada) e é usada diretamente para falar com o OpenAI.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="password"
            placeholder="sk-…"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="min-w-0 flex-1"
            autoComplete="off"
          />
          <Button variant="soft" onClick={save} disabled={!key.trim()}>
            {saved ? 'Guardada ✓' : 'Guardar'}
          </Button>
          {hasKey && (
            <Button variant="ghost" size="sm" onClick={clear}>Remover</Button>
          )}
        </div>
      </Card>
    </section>
  )
}

type Blocked = { name: string; action: 'arquivar' | 'apagar'; planeamento: MonthKey[]; projecoes: MonthKey[] }

function SavingsSection() {
  const data = useStore((s) => s.data)
  const put = useStore((s) => s.put)
  const remove = useStore((s) => s.remove)
  const setScreen = useStore((s) => s.setScreen)
  const [blocked, setBlocked] = useState<Blocked | null>(null)
  const guard = (bucket: SavingsBucket, action: Blocked['action']): boolean => {
    const block = allocationBlock(data, 'savingsBuckets', bucket.id)
    if (!block) return false
    setBlocked({ name: bucket.name, action, ...block })
    return true
  }

  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<BucketKind>('fixed')
  const [newTarget, setNewTarget] = useState('')
  const [newTargetDate, setNewTargetDate] = useState('')

  const buckets = data.savingsBuckets.slice().sort((a, b) => a.order - b.order)
  const active = buckets.filter((b) => !b.archived)
  const archived = buckets.filter((b) => b.archived)

  const month = currentMonthKey()
  const from = firstPlanMonth(data)
  const balanceTable = useMemo(
    () =>
      computeBalances({
        buckets: data.savingsBuckets,
        plans: data.monthlyPlans,
        movements: data.savingsMovements,
        overrides: data.balanceOverrides,
        from,
        to: month,
      }),
    [data.savingsBuckets, data.monthlyPlans, data.savingsMovements, data.balanceOverrides, from, month],
  )

  const addBucket = () => {
    const name = newName.trim()
    if (!name) return
    const targetAmount = newKind === 'goal' ? Number(newTarget.replace(',', '.')) || 0 : undefined
    const doc: SavingsBucket = {
      id: uid(),
      name,
      kind: newKind,
      archived: false,
      order: buckets.length,
      ...(newKind === 'goal' ? { targetAmount, status: 'active' as const } : {}),
      ...(newTargetDate ? { targetDate: newTargetDate } : {}),
    }
    void put('savingsBuckets', doc)
    setNewName('')
    setNewTarget('')
    setNewTargetDate('')
    setNewKind('fixed')
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active: draggedItem, over } = event
    if (!over || draggedItem.id === over.id) return
    const ids = active.map((b) => b.id)
    const fromIdx = ids.indexOf(String(draggedItem.id))
    const toIdx = ids.indexOf(String(over.id))
    if (fromIdx === -1 || toIdx === -1) return
    arrayMove(ids, fromIdx, toIdx).forEach((id, i) => {
      const bucket = active.find((b) => b.id === id)!
      if (bucket.order !== i) void put('savingsBuckets', { ...bucket, order: i })
    })
  }

  const renderBucket = (bucket: SavingsBucket, dragHandle?: React.ReactNode) => {
    const saldo = bucketBalance(balanceTable, bucket.id, month)
    const canDelete = Math.abs(saldo) < 0.5
    const deleteHint = canDelete
      ? undefined
      : 'Só é possível apagar baldes com saldo zero — faz um movimento de saída ou transferência primeiro'
    const goalCaption = bucket.kind === 'goal' && (bucket.targetAmount || bucket.targetDate)
      ? `${bucket.targetAmount ? `Alvo: ${fmtEUR(bucket.targetAmount)}` : ''}${bucket.targetDate ? ` · até ${monthLabel(bucket.targetDate)}` : ''}`.trim()
      : undefined

    const doDelete = () => {
      if (!canDelete) return
      if (guard(bucket, 'apagar')) return
      if (
        window.confirm(
          `Tens a certeza que queres apagar definitivamente o balde "${bucket.name}"? Esta ação não pode ser desfeita.`,
        )
      ) {
        void remove('savingsBuckets', bucket.id)
      }
    }

    return (
      <>
        <div className="flex min-w-0 items-center gap-2">
          {dragHandle}
          <span className={cx('truncate text-sm', bucket.archived && 'text-muted line-through')}>
            {bucket.name}
          </span>
          {bucket.kind === 'goal' && (
            <span title={goalCaption}>
              <Badge tone="goal">Objetivo</Badge>
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Money value={saldo} className="text-sm font-semibold" />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (!bucket.archived && guard(bucket, 'arquivar')) return
              void put('savingsBuckets', { ...bucket, archived: !bucket.archived })
            }}
          >
            {bucket.archived ? 'Reativar' : 'Arquivar'}
          </Button>
          <span title={deleteHint ?? 'Apagar definitivamente'}>
            <Button size="sm" variant="danger" disabled={!canDelete} onClick={doDelete} aria-label="Apagar definitivamente">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 7h16M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3m2 0-.867 12.142A2 2 0 0 1 14.138 21H9.862a2 2 0 0 1-1.995-1.858L7 7"
                />
              </svg>
            </Button>
          </span>
        </div>
      </>
    )
  }

  return (
    <section>
      <SectionTitle>Poupanças</SectionTitle>
      <Card>
        {active.length === 0 ? (
          <p className="text-sm text-muted">Ainda sem baldes de poupança.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={active.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              <ul className="divide-y divide-border">
                {active.map((bucket) => (
                  <SortableBucketRow key={bucket.id} id={bucket.id}>
                    {(dragHandle) => renderBucket(bucket, dragHandle)}
                  </SortableBucketRow>
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Novo balde…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addBucket()}
              className="min-w-0 flex-1"
            />
            <Select value={newKind} onChange={(e) => setNewKind(e.target.value as BucketKind)}>
              <option value="fixed">Fixo</option>
              <option value="goal">Objetivo</option>
            </Select>
          </div>
          {newKind === 'goal' && (
            <div className="flex flex-wrap gap-2">
              <Input
                type="number"
                placeholder="Objetivo (€)"
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
                className="min-w-0 flex-1"
              />
              <input
                type="month"
                value={newTargetDate}
                onChange={(e) => setNewTargetDate(e.target.value)}
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
              />
            </div>
          )}
          <div>
            <Button variant="soft" onClick={addBucket} disabled={!newName.trim()}>
              Adicionar
            </Button>
          </div>
        </div>

        {archived.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-semibold text-muted">
              Arquivadas ({archived.length})
            </summary>
            <ul className="mt-2 divide-y divide-border">
              {archived.map((bucket) => (
                <li key={bucket.id} className="flex items-center justify-between gap-2 py-2">
                  {renderBucket(bucket)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>
      {blocked && (
        <ArchiveBlockedModal
          {...blocked}
          onClose={() => setBlocked(null)}
          onGo={(screen) => { setBlocked(null); setScreen(screen) }}
        />
      )}
    </section>
  )
}

function SortableBucketRow({ id, children }: { id: string; children: (dragHandle: React.ReactNode) => React.ReactNode }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  const dragHandle = (
    <button
      type="button"
      aria-label="Arrastar para reordenar"
      className="shrink-0 cursor-grab touch-none text-muted hover:text-text active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <circle cx="9" cy="6" r="1.5" />
        <circle cx="9" cy="12" r="1.5" />
        <circle cx="9" cy="18" r="1.5" />
        <circle cx="15" cy="6" r="1.5" />
        <circle cx="15" cy="12" r="1.5" />
        <circle cx="15" cy="18" r="1.5" />
      </svg>
    </button>
  )

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cx('flex items-center justify-between gap-2 py-2', isDragging && 'z-10 opacity-50')}
    >
      {children(dragHandle)}
    </li>
  )
}

interface ListDoc {
  id: string
  name: string
  archived: boolean
  order: number
  isRent?: boolean
  initialBalance?: number
  fixed?: boolean
}

function ListEditor({ title, collection, hint }: EditableList) {
  const data = useStore((s) => s.data)
  const put = useStore((s) => s.put)
  const remove = useStore((s) => s.remove)
  const setScreen = useStore((s) => s.setScreen)
  const [newName, setNewName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ListDoc | null>(null)
  const [blocked, setBlocked] = useState<Blocked | null>(null)

  const docs = (data[collection] as unknown as ListDoc[]).slice().sort((a, b) => a.order - b.order)
  const isIncome = collection === 'incomeSources'
  const isVehicle = collection === 'investmentVehicles'
  const isExpense = collection === 'expenseCategories'
  const singular = isIncome ? 'a fonte de income' : isVehicle ? 'o veículo' : 'a despesa'

  // Arquivar/apagar só é possível sem valor alocado no mês atual e seguintes.
  const guard = (doc: ListDoc, action: Blocked['action']): boolean => {
    const block = allocationBlock(data, collection, doc.id)
    if (!block) return false
    setBlocked({ name: doc.name, action, ...block })
    return true
  }
  const toggleArchive = (doc: ListDoc) => {
    if (!doc.archived && guard(doc, 'arquivar')) return
    void put(collection, { ...doc, archived: !doc.archived } as never)
  }
  const askDelete = (doc: ListDoc) => {
    if (guard(doc, 'apagar')) return
    if (isVehicle && (data.investmentAssets.some((a) => a.vehicleId === doc.id)
      || data.assetEntries.some((e) => e.vehicleId === doc.id)
      || data.valueCheckpoints.some((c) => c.vehicleId === doc.id))) {
      window.alert(`"${doc.name}" tem ativos, entradas ou checkpoints na página Investimento. Para não perderes esses dados, não é possível apagá-lo — arquiva-o.`)
      return
    }
    setDeleteTarget(doc)
  }
  // Gastos já classificados nesta despesa — não são apagados, ficam sem categoria do plano.
  const affectedTransactions = useMemo(() => {
    if (!deleteTarget || !isExpense) return 0
    const resolve = makeResolver(data)
    return data.transactions.filter((t) => resolve(t).groupId === deleteTarget.id).length
  }, [deleteTarget, isExpense, data])
  const doDelete = () => {
    if (!deleteTarget) return
    if (isExpense) {
      for (const sc of data.subcategories.filter((x) => x.parentId === deleteTarget.id)) void remove('subcategories', sc.id)
    }
    void remove(collection, deleteTarget.id)
    setDeleteTarget(null)
  }

  const add = () => {
    const name = newName.trim()
    if (!name) return
    const doc: ListDoc = { id: uid(), name, archived: false, order: docs.length }
    if (isIncome) doc.isRent = false
    void put(collection, doc as never)
    setNewName('')
  }

  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <Card>
        {hint && (
          <p className="mb-2 flex items-center gap-1 text-xs text-muted">
            {hint}
            {isIncome && <InfoHint label="O que é uma renda?"><RentExplanation /></InfoHint>}
          </p>
        )}
        <ul className="divide-y divide-border">
          {docs.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-2 py-2">
              <span className={cx('text-sm', doc.archived && 'text-muted line-through')}>{doc.name}</span>
              <div className="flex items-center gap-2">
                {isIncome && (
                  <label className="flex items-center gap-1 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={Boolean(doc.isRent)}
                      onChange={(e) => void put(collection, { ...doc, isRent: e.target.checked } as never)}
                    />
                    Renda
                  </label>
                )}
                {isVehicle && (
                  <div className="flex items-center gap-1 text-xs text-muted">
                    Saldo inicial
                    <MoneyCell
                      value={doc.initialBalance}
                      onChange={(v) => void put(collection, { ...doc, initialBalance: v } as never)}
                    />
                  </div>
                )}
                {isExpense && !doc.archived && (
                  <label className="flex items-center gap-1 text-xs text-muted" title="Fixa: sem 'quase no limite' nem projeção ao ritmo atual (só fica vermelha se passar do plano). Automático: deteta-se pelo histórico.">
                    <Select
                      value={doc.fixed === undefined ? 'auto' : doc.fixed ? 'fixed' : 'variable'}
                      onChange={(e) => {
                        const v = e.target.value
                        void put(collection, { ...doc, fixed: v === 'auto' ? undefined : v === 'fixed' } as never)
                      }}
                      className="py-1 text-xs"
                    >
                      <option value="auto">Auto</option>
                      <option value="fixed">Fixa</option>
                      <option value="variable">Variável</option>
                    </Select>
                  </label>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => toggleArchive(doc)}
                >
                  {doc.archived ? 'Reativar' : 'Arquivar'}
                </Button>
                {(isVehicle || isIncome || isExpense) && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => askDelete(doc)}
                    aria-label={`Apagar ${doc.name}`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 7h16M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3m2 0-.867 12.142A2 2 0 0 1 14.138 21H9.862a2 2 0 0 1-1.995-1.858L7 7"
                      />
                    </svg>
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <Input
            placeholder="Novo nome…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <Button variant="soft" onClick={add} disabled={!newName.trim()}>Adicionar</Button>
        </div>
      </Card>

      <Modal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title={`Apagar ${singular.replace(/^a |^o /, '')}`}>
        {deleteTarget && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">
              Tens a certeza que queres apagar definitivamente {singular}{' '}
              <strong className="text-text">{deleteTarget.name}</strong>?
              {isVehicle && Boolean(deleteTarget.initialBalance) && (
                <>
                  {' '}Tem um saldo inicial de <strong className="text-text">{fmtEUR(deleteTarget.initialBalance ?? 0)}</strong> registado.
                </>
              )}
              {isVehicle
                ? ' Esta ação não pode ser desfeita — os movimentos de poupança que já o referenciam mantêm-se, mas deixa de aparecer nas listas.'
                : ' Esta ação não pode ser desfeita. Os planos de meses anteriores mantêm os valores que lá estavam.'}
              {isExpense && affectedTransactions > 0 && (
                <>
                  {' '}Os <strong className="text-text">{affectedTransactions} gastos</strong> classificados nela não são apagados,
                  mas ficam sem categoria do plano. Se só queres deixar de a usar, arquiva-a em vez de apagar.
                </>
              )}
              {isExpense && ' As subcategorias desta despesa também são apagadas.'}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
              <Button variant="danger" size="sm" onClick={doDelete}>Apagar definitivamente</Button>
            </div>
          </div>
        )}
      </Modal>
      {blocked && (
        <ArchiveBlockedModal
          {...blocked}
          onClose={() => setBlocked(null)}
          onGo={(screen) => { setBlocked(null); setScreen(screen) }}
        />
      )}
    </section>
  )
}

// ---------- Subcategorias (opcionais) ----------

function SubcategoriesSection() {
  const data = useStore((s) => s.data)
  const put = useStore((s) => s.put)
  const remove = useStore((s) => s.remove)
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const groups = activeGroups(data)
  const usage = useMemo(() => {
    const resolve = makeResolver(data)
    const counts = new Map<string, number>()
    for (const t of data.transactions) {
      const sid = resolve(t).subcategoryId
      if (sid) counts.set(sid, (counts.get(sid) ?? 0) + 1)
    }
    return counts
  }, [data])

  const add = (g: Group) => {
    const name = (drafts[g.id] ?? '').trim()
    if (!name) return
    const exists = subcategoriesOf(data.subcategories, g.id, true).some((s) => normalizeDesc(s.name) === normalizeDesc(name))
    if (!exists) void put('subcategories', newSubcategory(data.subcategories, g.id, name, uid()))
    setDrafts((d) => ({ ...d, [g.id]: '' }))
  }

  return (
    <section>
      <SectionTitle>Subcategorias</SectionTitle>
      <Card>
        <p className="mb-3 text-xs text-muted">
          Opcionais: detalham uma categoria principal (ex.: Utilities → Eletricidade, Água, Gás,
          Comunicações). Podes criar a qualquer momento — os gastos já registados mantêm-se onde estão e
          podes movê-los para uma subcategoria na lista de Gastos. Também podes detalhar baldes de poupança.
        </p>
        {groups.length === 0 ? (
          <p className="text-sm text-muted">Ainda sem despesas do planeamento nem baldes.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {groups.map((g) => {
              const subs = subcategoriesOf(data.subcategories, g.id, true)
              return (
                <li key={g.id} className="py-3">
                  <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
                    {g.name}
                    {g.kind === 'bucket' && <Badge tone="goal">Poupança</Badge>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {subs.map((sc) => {
                      const used = usage.get(sc.id) ?? 0
                      return (
                        <span
                          key={sc.id}
                          className={cx(
                            'inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pl-2.5 pr-1.5 text-xs font-medium',
                            sc.archived && 'text-muted line-through',
                          )}
                        >
                          {sc.name}
                          {used > 0 && <span className="text-[10px] text-muted">{used}</span>}
                          <button
                            title={sc.archived ? 'Reativar' : 'Arquivar'}
                            onClick={() => void put('subcategories', { ...sc, archived: !sc.archived })}
                            className="text-muted hover:text-text"
                          >
                            {sc.archived ? '↺' : '▣'}
                          </button>
                          {used === 0 && (
                            <button
                              title="Apagar (sem gastos associados)"
                              onClick={() => void remove('subcategories', sc.id)}
                              className="text-muted hover:text-negative"
                            >
                              ✕
                            </button>
                          )}
                        </span>
                      )
                    })}
                    <input
                      value={drafts[g.id] ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [g.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && add(g)}
                      onBlur={() => add(g)}
                      placeholder="+ subcategoria"
                      className="w-36 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-text placeholder:text-muted focus:border-accent focus:outline-none"
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </section>
  )
}

// ---------- Categorias antigas de gastos → categorias do plano ----------

// Antes, os gastos tinham uma lista de categorias própria. Esta secção deixa
// associar cada categoria antiga a uma categoria do plano (+ subcategoria).
// Não move nem apaga nada: a associação fica guardada na categoria antiga e
// todos os gastos dela passam a ser lidos pela nova categoria.
function LegacyCategoriesSection() {
  const data = useStore((s) => s.data)
  const put = useStore((s) => s.put)

  const pending = legacyNeedingMapping(data)
  const groups = activeGroups(data)
  const mapped = data.transactionCategories.filter((c) => c.planCategoryId)

  type Choice = { parentId: string; sub: string } // sub: 'none' | 'new' | subcategoryId
  const defaultChoice = (c: TransactionCategory): Choice => {
    const g = suggestGroupForLegacy(c, data)
    if (!g) return { parentId: '', sub: 'none' }
    return { parentId: g.id, sub: normalizeDesc(g.name) === normalizeDesc(c.name) ? 'none' : 'new' }
  }
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const choiceOf = (c: TransactionCategory): Choice => choices[c.id] ?? defaultChoice(c)
  const setChoice = (id: string, patch: Partial<Choice>, c: TransactionCategory) =>
    setChoices((prev) => ({ ...prev, [id]: { ...choiceOf(c), ...patch } }))

  const apply = (c: TransactionCategory) => {
    const ch = choiceOf(c)
    if (!ch.parentId) return
    let subId: string | undefined
    if (ch.sub === 'new') {
      const existing = subcategoriesOf(data.subcategories, ch.parentId, true).find(
        (x) => normalizeDesc(x.name) === normalizeDesc(c.name),
      )
      if (existing) subId = existing.id
      else {
        subId = uid()
        void put('subcategories', newSubcategory(data.subcategories, ch.parentId, c.name, subId))
      }
    } else if (ch.sub !== 'none') subId = ch.sub
    void put('transactionCategories', { ...c, planCategoryId: ch.parentId, subcategoryId: subId })
  }

  const applyAll = () => {
    for (const { category } of pending) if (choiceOf(category).parentId) apply(category)
  }

  if (pending.length === 0 && mapped.length === 0) return null

  const groupName = (id?: string) => groups.find((g) => g.id === id)?.name ?? data.expenseCategories.find((x) => x.id === id)?.name ?? data.savingsBuckets.find((b) => b.id === id)?.name ?? '—'

  return (
    <section>
      <SectionTitle
        right={pending.length > 1 ? (
          <Button size="sm" variant="soft" onClick={applyAll}>Aplicar todas as sugestões</Button>
        ) : undefined}
      >
        Categorias antigas de gastos
      </SectionTitle>
      <Card>
        <p className="mb-3 text-xs text-muted">
          Os gastos agora usam as categorias do plano. Associa cada categoria antiga a uma categoria do plano
          (e, se quiseres, cria uma subcategoria com o mesmo nome): todos os gastos antigos passam a contar
          no Analytics. Nada é apagado ou alterado nos teus gastos.
        </p>
        {pending.length === 0 ? (
          <p className="text-sm text-muted">Todas as categorias antigas com gastos estão associadas. ✓</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {pending.map(({ category: c, count, total }) => {
              const ch = choiceOf(c)
              return (
                <li key={c.id} className="flex flex-col gap-2 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{c.name}</span>
                    <span className="text-xs text-muted">{count} gasto{count === 1 ? '' : 's'} · {fmtEUR(total)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={ch.parentId}
                      onChange={(e) => setChoice(c.id, { parentId: e.target.value, sub: 'new' }, c)}
                      className="min-w-0 flex-1"
                    >
                      <option value="">— categoria do plano —</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>{g.kind === 'bucket' ? `${g.name} (poupança)` : g.name}</option>
                      ))}
                    </Select>
                    <Select
                      value={ch.sub}
                      onChange={(e) => setChoice(c.id, { sub: e.target.value }, c)}
                      disabled={!ch.parentId}
                      className="min-w-0 flex-1"
                    >
                      <option value="none">Sem subcategoria</option>
                      <option value="new">{`Nova subcategoria «${c.name}»`}</option>
                      {ch.parentId && subcategoriesOf(data.subcategories, ch.parentId).map((sc) => (
                        <option key={sc.id} value={sc.id}>{sc.name}</option>
                      ))}
                    </Select>
                    <Button size="sm" variant="soft" disabled={!ch.parentId} onClick={() => apply(c)}>Associar</Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {mapped.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-semibold text-muted">
              Já associadas ({mapped.length})
            </summary>
            <ul className="mt-2 divide-y divide-border">
              {mapped.map((c) => {
                const sub = data.subcategories.find((x) => x.id === c.subcategoryId)
                return (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      {c.name} <span className="text-muted">→ {groupName(c.planCategoryId)}{sub ? ` › ${sub.name}` : ''}</span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void put('transactionCategories', { ...c, planCategoryId: undefined, subcategoryId: undefined })}
                    >
                      Desassociar
                    </Button>
                  </li>
                )
              })}
            </ul>
          </details>
        )}
      </Card>
    </section>
  )
}

// ---------- Despesas apagadas/arquivadas que ainda têm valor planeado ----------

// Quando se apaga/arquiva uma despesa, os meses passados (e projeções) onde ela
// tinha valor mantêm-no — a soma dos 100% inclui-o, mas ninguém o vê nem as
// análises o conseguem atribuir. Aqui juntas esses valores numa despesa ativa.
function OrphanExpensesSection() {
  const data = useStore((s) => s.data)
  const mergeExpensesInto = useStore((s) => s.mergeExpensesInto)

  const orphans = useMemo(() => findOrphanExpenses(data), [data])
  const targets = data.expenseCategories.filter((c) => !c.archived).sort((a, b) => a.order - b.order)
  const suggested = targets.find((c) => normalizeDesc(c.name).includes('casa'))?.id ?? ''

  const [target, setTarget] = useState('')
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [moveTx, setMoveTx] = useState(true)
  const targetId = targets.some((c) => c.id === target) ? target : suggested

  const chosen = orphans.filter((o) => !excluded.has(o.id))
  const preview = useMemo(() => {
    if (!targetId || chosen.length === 0) return null
    const res = planMerge(data, chosen.map((o) => o.id), targetId, moveTx)
    const before = (month: string, plans: { id: string; expenses: Record<string, number> }[]) =>
      plans.find((p) => p.id === month)?.expenses[targetId] ?? 0
    const rows = new Map<string, { month: string; before: number; after: number; projection: boolean }>()
    for (const p of res.monthlyPlans) rows.set(`m${p.id}`, { month: p.id, before: before(p.id, data.monthlyPlans), after: p.expenses[targetId] ?? 0, projection: false })
    for (const p of res.projectionPlans) rows.set(`p${p.id}`, { month: p.id, before: before(p.id, data.projectionPlans), after: p.expenses[targetId] ?? 0, projection: true })
    return { rows: [...rows.values()].sort((a, b) => a.month.localeCompare(b.month)), transactions: res.transactions.length }
  }, [data, chosen, targetId, moveTx])

  if (orphans.length === 0) return null

  const targetName = targets.find((c) => c.id === targetId)?.name ?? ''
  const apply = () => {
    if (!targetId || chosen.length === 0) return
    if (!window.confirm(`Juntar ${chosen.length} ${chosen.length === 1 ? 'despesa' : 'despesas'} em "${targetName}"? Os valores planeados desses meses passam para "${targetName}" (o total de despesas de cada mês não muda).`)) return
    void mergeExpensesInto(chosen.map((o) => o.id), targetId, moveTx)
  }

  return (
    <section>
      <SectionTitle>Despesas antigas com valores</SectionTitle>
      <Card>
        <p className="mb-3 text-xs text-muted">
          Estas despesas foram apagadas ou arquivadas mas ainda têm valor planeado em meses passados ou projeções.
          Esse valor conta nos totais mas não aparece em lado nenhum, e as análises não o conseguem atribuir.
          Junta-o numa despesa ativa (ex.: duas casas → "Casas"): o total de cada mês fica igual, só muda de linha.
        </p>
        <ul className="flex flex-col divide-y divide-border">
          {orphans.map((o) => (
            <li key={o.id} className="flex flex-col gap-1 py-2.5">
              <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={!excluded.has(o.id)}
                  onChange={(e) => setExcluded((prev) => {
                    const next = new Set(prev)
                    if (e.target.checked) next.delete(o.id); else next.add(o.id)
                    return next
                  })}
                />
                {o.name ?? 'Despesa apagada'}
                <Badge tone={o.deleted ? 'negative' : 'warn'}>{o.deleted ? 'Apagada' : 'Arquivada'}</Badge>
                <span className="ml-auto tnum text-xs font-normal text-muted">
                  {o.months.length} {o.months.length === 1 ? 'mês' : 'meses'} · {fmtEUR(o.total)}
                  {o.transactions > 0 && ` · ${o.transactions} gastos`}
                </span>
              </label>
              <div className="pl-6 text-xs text-muted">
                {o.months.map((m) => `${monthShort(m.month)}: ${fmtEUR(m.value, true)}`).join(' · ')}
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="text-sm text-muted">Juntar em</span>
          <Select value={targetId} onChange={(e) => setTarget(e.target.value)}>
            <option value="">— escolher despesa —</option>
            {targets.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={moveTx} onChange={(e) => setMoveTx(e.target.checked)} />
            Mover também os gastos classificados nestas despesas
          </label>
          <Button size="sm" disabled={!targetId || chosen.length === 0} onClick={apply}>Juntar</Button>
        </div>

        {preview && preview.rows.length > 0 && (
          <div className="mt-3 rounded-xl bg-surface-2 p-3 text-xs">
            <div className="mb-1.5 font-semibold text-text">Pré-visualização — "{targetName}"</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted">
              {preview.rows.map((r) => (
                <span key={`${r.projection}${r.month}`} className="tnum">
                  {monthShort(r.month)}{r.projection ? ' (proj.)' : ''}: {fmtEUR(r.before, true)} → <strong className="text-text">{fmtEUR(r.after, true)}</strong>
                </span>
              ))}
            </div>
            {moveTx && preview.transactions > 0 && (
              <div className="mt-1.5 text-muted">+ {preview.transactions} gastos passam para "{targetName}" (ficam sem subcategoria).</div>
            )}
          </div>
        )}
      </Card>
    </section>
  )
}

// ---------- Saídas de poupança criadas automaticamente ao categorizar ----------

function AutoMovementsSection() {
  const data = useStore((s) => s.data)
  const revert = useStore((s) => s.revertAutoBucketMovements)
  const auto = useMemo(() => data.savingsMovements.filter(isAutoBucketMovement), [data.savingsMovements])
  if (auto.length === 0) return null
  const total = auto.reduce((sum, m) => sum + Math.abs(m.amount), 0)
  const perBucket = new Map<string, number>()
  for (const m of auto) perBucket.set(m.bucketId, (perBucket.get(m.bucketId) ?? 0) + Math.abs(m.amount))

  const apply = async () => {
    if (!window.confirm(`Remover ${auto.length} saídas "Gasto: …" (${fmtEUR(total, true)}) e devolver esse valor aos baldes? Os gastos ficam intactos. Exporta um backup antes, se ainda não o fizeste.`)) return
    await revert()
  }

  return (
    <section>
      <SectionTitle>Saídas de poupança automáticas</SectionTitle>
      <Card>
        <p className="mb-3 text-xs text-muted">
          Por engano, categorizar um gasto com um balde criou uma saída desse balde (movimentos "Gasto: …"). Já não acontece.
          Aqui podes remover essas saídas: os saldos dos baldes voltam ao que eram e os gastos ficam como estão.
          Não toca nas reposições confirmadas à mão ("Reposição: …").
        </p>
        <ul className="mb-3 flex flex-col gap-1 text-sm">
          {[...perBucket.entries()].map(([id, v]) => (
            <li key={id} className="flex justify-between">
              <span>{data.savingsBuckets.find((b) => b.id === id)?.name ?? 'Balde'}</span>
              <span className="tnum text-muted">{fmtEUR(v, true)}</span>
            </li>
          ))}
        </ul>
        <Button size="sm" variant="danger" onClick={() => void apply()}>
          Remover {auto.length} saídas ({fmtEUR(total, true)})
        </Button>
      </Card>
    </section>
  )
}

import { useMemo, useState } from 'react'
import { Badge, Button, Card, Input, Modal, Money, MoneyCell, SectionTitle, Select, cx } from '../components/ui'
import { bucketBalance, computeBalances } from '../lib/calc/balances'
import { currentMonthKey, fmtEUR, generateSpaceCode, monthLabel, uid } from '../lib/format'
import { firstPlanMonth, useStore } from '../store/useStore'
import type { BucketKind, CollectionName, SavingsBucket } from '../types'

type EditableList = {
  title: string
  collection: CollectionName
  hint?: string
}

const LISTS: EditableList[] = [
  { title: 'Fontes de income', collection: 'incomeSources', hint: 'Marca como renda o que chega a meio do mês' },
  { title: 'Despesas do planeamento', collection: 'expenseCategories' },
  { title: 'Categorias de gastos', collection: 'transactionCategories' },
  {
    title: 'Veículos de investimento',
    collection: 'investmentVehicles',
    hint: 'Ex.: XTB, Certificados de Aforro, ETFs, Seguro de capitalização',
  },
]

export function Definicoes() {
  const { mode, spaceCode, firebaseAvailable, data } = useStore()
  const joinSpace = useStore((s) => s.joinSpace)
  const leaveSpace = useStore((s) => s.leaveSpace)
  const resetAccount = useStore((s) => s.resetAccount)

  const [joinOpen, setJoinOpen] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

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

  return (
    <div className="fade-up flex flex-col gap-6">
      <h1 className="text-xl font-black">Definições</h1>

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
                  <Button size="sm" onClick={() => void doJoin(generateSpaceCode())}>
                    Criar espaço novo (gera código)
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

      <SavingsSection />

      {LISTS.map((list) => (
        <ListEditor key={list.collection} {...list} />
      ))}

      <section>
        <SectionTitle>Sobre</SectionTitle>
        <Card>
          <p className="text-sm text-muted">
            Contas — app privada de finanças pessoais. Os saldos são sempre calculados a partir do
            planeamento e dos movimentos; nada é escrito à mão. {data.savingsBuckets.length} baldes,{' '}
            {data.transactions.length} gastos registados.
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
    </div>
  )
}

function SavingsSection() {
  const data = useStore((s) => s.data)
  const put = useStore((s) => s.put)
  const remove = useStore((s) => s.remove)

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

  const renderBucket = (bucket: SavingsBucket) => {
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
      if (
        window.confirm(
          `Tens a certeza que queres apagar definitivamente o balde "${bucket.name}"? Esta ação não pode ser desfeita.`,
        )
      ) {
        void remove('savingsBuckets', bucket.id)
      }
    }

    return (
      <li key={bucket.id} className="flex items-center justify-between gap-2 py-2">
        <div className="flex min-w-0 items-center gap-2">
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
            onClick={() => void put('savingsBuckets', { ...bucket, archived: !bucket.archived })}
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
      </li>
    )
  }

  return (
    <section>
      <SectionTitle>Poupanças</SectionTitle>
      <Card>
        {active.length === 0 ? (
          <p className="text-sm text-muted">Ainda sem baldes de poupança.</p>
        ) : (
          <ul className="divide-y divide-border">{active.map(renderBucket)}</ul>
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
            <ul className="mt-2 divide-y divide-border">{archived.map(renderBucket)}</ul>
          </details>
        )}
      </Card>
    </section>
  )
}

interface ListDoc {
  id: string
  name: string
  archived: boolean
  order: number
  isRent?: boolean
  initialBalance?: number
}

function ListEditor({ title, collection, hint }: EditableList) {
  const data = useStore((s) => s.data)
  const put = useStore((s) => s.put)
  const remove = useStore((s) => s.remove)
  const [newName, setNewName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ListDoc | null>(null)

  const docs = (data[collection] as unknown as ListDoc[]).slice().sort((a, b) => a.order - b.order)
  const isIncome = collection === 'incomeSources'
  const isVehicle = collection === 'investmentVehicles'

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
        {hint && <p className="mb-2 text-xs text-muted">{hint}</p>}
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
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void put(collection, { ...doc, archived: !doc.archived } as never)}
                >
                  {doc.archived ? 'Reativar' : 'Arquivar'}
                </Button>
                {isVehicle && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setDeleteTarget(doc)}
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

      {isVehicle && (
        <Modal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="Apagar veículo">
          {deleteTarget && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted">
                Tens a certeza que queres apagar definitivamente o veículo{' '}
                <strong className="text-text">{deleteTarget.name}</strong>?
                {Boolean(deleteTarget.initialBalance) && (
                  <>
                    {' '}Tem um saldo inicial de <strong className="text-text">{fmtEUR(deleteTarget.initialBalance ?? 0)}</strong> registado.
                  </>
                )}
                {' '}Esta ação não pode ser desfeita — os movimentos de poupança que já o referenciam mantêm-se, mas deixa de aparecer nas listas.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    void remove(collection, deleteTarget.id)
                    setDeleteTarget(null)
                  }}
                >
                  Apagar definitivamente
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </section>
  )
}

import { useMemo, useState } from 'react'
import { Badge, Button, EmptyState, Input, Modal, Select, cx } from '../components/ui'
import { addMonths, currentMonthKey, fmtDate, fmtEUR, monthOfDate, parseAmount, todayISO } from '../lib/format'
import { activeBuckets, activeVehicles, useStore } from '../store/useStore'
import type { SavingsMovement } from '../types'

type Kind = 'entrada' | 'saida' | 'transferencia'

interface MovementForm {
  date: string
  bucketId: string
  toBucketId: string
  kind: Kind
  amount: string
  description: string
  toVehicle: boolean
  vehicleId: string
}

const emptyForm = (): MovementForm => ({
  date: todayISO(),
  bucketId: '',
  toBucketId: '',
  kind: 'entrada',
  amount: '',
  description: '',
  toVehicle: false,
  vehicleId: '',
})

const draftAmount = (value: number) => String(Math.abs(value)).replace('.', ',')

export function Movimentos() {
  const data = useStore((s) => s.data)
  const addMovement = useStore((s) => s.addMovement)
  const addTransfer = useStore((s) => s.addTransfer)
  const put = useStore((s) => s.put)
  const remove = useStore((s) => s.remove)

  const [modalOpen, setModalOpen] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<MovementForm>(emptyForm())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTransferGroupId, setEditingTransferGroupId] = useState<string | null>(null)

  const [filterBucket, setFilterBucket] = useState('all')
  // Default (sem mês escolhido): mês atual + anterior. Escolher um mês no
  // picker restringe a esse mês só; "Limpar" volta ao default.
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const currentMonth = currentMonthKey()
  const defaultMonths = [currentMonth, addMonths(currentMonth, -1)]

  const buckets = useMemo(() => activeBuckets(data), [data])
  const vehicles = useMemo(() => activeVehicles(data), [data])

  const movements = useMemo(
    () =>
      data.savingsMovements
        .filter((m) => filterBucket === 'all' || m.bucketId === filterBucket)
        .filter((m) => (selectedMonth ? monthOfDate(m.date) === selectedMonth : defaultMonths.includes(monthOfDate(m.date))))
        .slice()
        .sort((a, b) => {
          const byDate = b.date.localeCompare(a.date)
          if (byDate !== 0) return byDate
          return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
        }),
    [data.savingsMovements, filterBucket, selectedMonth, currentMonth],
  )

  const openModal = () => {
    setError('')
    setEditingId(null)
    setEditingTransferGroupId(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  const openEdit = (m: SavingsMovement) => {
    setError('')
    if (m.transferGroupId) {
      const pair = data.savingsMovements.filter((x) => x.transferGroupId === m.transferGroupId)
      const fromLeg = pair.find((x) => x.amount < 0) ?? m
      const toLeg = pair.find((x) => x.amount > 0) ?? m
      setForm({
        date: m.date,
        bucketId: fromLeg.bucketId,
        toBucketId: toLeg.bucketId,
        kind: 'transferencia',
        amount: draftAmount(m.amount),
        description: m.description,
        toVehicle: false,
        vehicleId: '',
      })
      setEditingId(null)
      setEditingTransferGroupId(m.transferGroupId)
    } else {
      setForm({
        date: m.date,
        bucketId: m.bucketId,
        toBucketId: '',
        kind: m.amount >= 0 ? 'entrada' : 'saida',
        amount: draftAmount(m.amount),
        description: m.description,
        toVehicle: !!m.vehicleId,
        vehicleId: m.vehicleId ?? '',
      })
      setEditingId(m.id)
      setEditingTransferGroupId(null)
    }
    setModalOpen(true)
  }

  const submit = () => {
    const parsed = parseAmount(form.amount)
    if (parsed === null || parsed <= 0) {
      setError('Indica um valor válido maior que zero.')
      return
    }
    if (form.kind === 'transferencia') {
      if (!form.bucketId || !form.toBucketId) {
        setError('Escolhe o balde de origem e o de destino.')
        return
      }
      if (form.bucketId === form.toBucketId) {
        setError('Escolhe dois baldes diferentes.')
        return
      }
      if (editingTransferGroupId) {
        const pair = data.savingsMovements.filter((x) => x.transferGroupId === editingTransferGroupId)
        const fromLeg = pair.find((x) => x.amount < 0)
        const toLeg = pair.find((x) => x.amount > 0)
        const desc = form.description.trim() || `Transferência: ${bucketName(form.bucketId)} → ${bucketName(form.toBucketId)}`
        if (fromLeg) void put('savingsMovements', { ...fromLeg, date: form.date, bucketId: form.bucketId, amount: -parsed, description: desc })
        if (toLeg) void put('savingsMovements', { ...toLeg, date: form.date, bucketId: form.toBucketId, amount: parsed, description: desc })
      } else {
        void addTransfer({
          date: form.date,
          fromBucketId: form.bucketId,
          toBucketId: form.toBucketId,
          amount: parsed,
          description: form.description.trim(),
        })
      }
      setModalOpen(false)
      return
    }
    if (!form.bucketId) {
      setError('Escolhe um balde.')
      return
    }
    const sign = form.kind === 'entrada' ? 1 : -1
    const vehicleId = form.kind === 'saida' && form.toVehicle && form.vehicleId ? form.vehicleId : undefined
    if (editingId) {
      void put('savingsMovements', {
        id: editingId,
        date: form.date,
        bucketId: form.bucketId,
        amount: parsed * sign,
        description: form.description.trim(),
        vehicleId,
      })
    } else {
      void addMovement({
        date: form.date,
        bucketId: form.bucketId,
        amount: parsed * sign,
        description: form.description.trim(),
        vehicleId,
      })
    }
    setModalOpen(false)
  }

  const handleDelete = (id: string) => {
    if (window.confirm('Apagar este movimento?')) void remove('savingsMovements', id)
  }

  const bucketName = (id: string) => data.savingsBuckets.find((b) => b.id === id)?.name ?? '—'

  return (
    <div className="fade-up flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-black">Movimentos</h1>
        <Button onClick={openModal}>+ Movimento</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={filterBucket} onChange={(e) => setFilterBucket(e.target.value)} className="flex-1">
          <option value="all">Todos os baldes</option>
          {buckets.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Input
          type="month"
          value={selectedMonth ?? ''}
          onChange={(e) => setSelectedMonth(e.target.value || null)}
          className="flex-1"
        />
        {selectedMonth && (
          <Button variant="ghost" size="sm" onClick={() => setSelectedMonth(null)}>Limpar</Button>
        )}
      </div>

      {movements.length === 0 ? (
        <EmptyState
          title="Sem movimentos"
          hint="Regista entradas e saídas de poupança para veres o histórico aqui."
        />
      ) : (
        <div className="overflow-x-auto thin-scroll rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Balde</th>
                <th className="px-3 py-2">Descrição</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="w-8 px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {movements.map((m) => {
                const bucket = data.savingsBuckets.find((b) => b.id === m.bucketId)
                return (
                  <tr key={m.id} className="odd:bg-surface-2/40">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{fmtDate(m.date)}</td>
                    <td className="px-3 py-2">
                      <Badge tone={bucket?.kind === 'goal' ? 'goal' : 'neutral'}>{bucket?.name ?? '—'}</Badge>
                    </td>
                    <td className="max-w-[140px] truncate px-3 py-2 text-text sm:max-w-none">
                      {m.description || 'Sem descrição'}
                      {m.transferGroupId && <span className="ml-1 text-xs text-muted">(transferência)</span>}
                    </td>
                    <td
                      className={cx(
                        'tnum whitespace-nowrap px-3 py-2 text-right font-semibold',
                        m.amount >= 0 ? 'text-positive' : 'text-negative',
                      )}
                    >
                      {m.amount >= 0 ? '+' : ''}
                      {fmtEUR(m.amount)}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => openEdit(m)}
                        className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text"
                        aria-label="Editar movimento"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => handleDelete(m.id)}
                        className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-negative"
                        aria-label="Apagar movimento"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted">
        Os movimentos afetam imediatamente os saldos calculados em todos os ecrãs.
      </p>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId || editingTransferGroupId ? 'Editar movimento' : 'Novo movimento'}
      >
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Data</label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
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
                  onClick={() => setForm((f) => ({ ...f, kind: opt.kind }))}
                  className={cx(
                    'rounded-xl border py-2.5 text-xs font-bold transition-colors',
                    form.kind === opt.kind ? opt.tone : 'border-border bg-surface text-muted',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {form.kind === 'transferencia' ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">De</label>
                <Select
                  value={form.bucketId}
                  onChange={(e) => setForm((f) => ({ ...f, bucketId: e.target.value }))}
                  className="w-full"
                >
                  <option value="">Escolhe…</option>
                  {buckets.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Para</label>
                <Select
                  value={form.toBucketId}
                  onChange={(e) => setForm((f) => ({ ...f, toBucketId: e.target.value }))}
                  className="w-full"
                >
                  <option value="">Escolhe…</option>
                  {buckets.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Balde</label>
              <Select
                value={form.bucketId}
                onChange={(e) => setForm((f) => ({ ...f, bucketId: e.target.value }))}
                className="w-full"
              >
                <option value="">Escolhe um balde…</option>
                {buckets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {form.kind === 'saida' && (
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-2 p-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.toVehicle}
                  disabled={vehicles.length === 0}
                  onChange={(e) => setForm((f) => ({ ...f, toVehicle: e.target.checked }))}
                />
                Saída para investimento
              </label>
              {vehicles.length === 0 ? (
                <span className="text-xs text-muted">Cria veículos em Definições</span>
              ) : (
                form.toVehicle && (
                  <Select
                    value={form.vehicleId}
                    onChange={(e) => setForm((f) => ({ ...f, vehicleId: e.target.value }))}
                  >
                    <option value="">Escolhe o veículo…</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </Select>
                )
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Valor</label>
            <Input
              inputMode="decimal"
              placeholder="0,00"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Descrição</label>
            <Input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={form.kind === 'transferencia' ? `Ex.: ${bucketName(form.bucketId)} → ${bucketName(form.toBucketId)}` : 'Ex.: Transferência mensal'}
            />
          </div>
          {error && <p className="text-sm text-negative">{error}</p>}
          <Button onClick={submit} className="w-full">
            Guardar
          </Button>
        </div>
      </Modal>
    </div>
  )
}

import { useState } from 'react'
import {
  Badge, Button, Card, EmptyState, Input, MetricCard, Modal, Money, SectionTitle, Select, cx,
} from '../components/ui'
import { matchCategoryByName, normalizeDesc, parseBankStatement, suggestCategory } from '../lib/calc/budgets'
import {
  addMonths, currentMonthKey, fmtDate, fmtEUR, monthOfDate, parseAmount, todayISO, uid,
} from '../lib/format'
import { activeBuckets, useStore } from '../store/useStore'
import type { CategoryRule, Transaction, TransactionCategory } from '../types'

interface PreviewRow {
  date: string
  nome: string
  description: string
  amount: number
  included: boolean
  categoryId: string
  suggested: string
  duplicate: boolean
}

export function Gastos() {
  const data = useStore((s) => s.data)
  const put = useStore((s) => s.put)
  const remove = useStore((s) => s.remove)
  const addTransactions = useStore((s) => s.addTransactions)
  const setTransactionReposto = useStore((s) => s.setTransactionReposto)

  const categories = data.transactionCategories.filter((c) => !c.archived).sort((a, b) => a.order - b.order)
  const buckets = activeBuckets(data)

  // ---------- Filtros ----------
  // Default (sem mês escolhido): mês atual + anterior. Escolher um mês no
  // picker restringe a esse mês só; "Limpar" volta ao default.
  const defaultMonths = [currentMonthKey(), addMonths(currentMonthKey(), -1)]
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  const filtered = data.transactions
    .filter((t) => (selectedMonth ? monthOfDate(t.date) === selectedMonth : defaultMonths.includes(monthOfDate(t.date))))
    .filter((t) => categoryFilter === 'all' || t.categoryId === categoryFilter)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1
      return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
    })

  const total = filtered.reduce((sum, t) => sum + t.amount, 0)

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? '—'
  const bucketName = (id: string | undefined) => buckets.find((b) => b.id === id)?.name ?? '—'

  // ---------- Modal "+ Gasto" / "Editar gasto" ----------
  const [addOpen, setAddOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [date, setDate] = useState(todayISO())
  const [categoryId, setCategoryId] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [nome, setNome] = useState('')
  const [description, setDescription] = useState('')
  const [repoePoupanca, setRepoePoupanca] = useState(false)
  const [fonteBucketId, setFonteBucketId] = useState('')
  const [addError, setAddError] = useState('')

  const openAdd = () => {
    setEditingId(null)
    setDate(todayISO())
    setCategoryId('')
    setAmountStr('')
    setNome('')
    setDescription('')
    setRepoePoupanca(false)
    setFonteBucketId('')
    setAddError('')
    setAddOpen(true)
  }

  const openEdit = (t: Transaction) => {
    setEditingId(t.id)
    setDate(t.date)
    setCategoryId(t.categoryId)
    setAmountStr(String(t.amount).replace('.', ','))
    setNome(t.nome ?? '')
    setDescription(t.description)
    setRepoePoupanca(t.repoePoupanca)
    setFonteBucketId(t.fonteBucketId ?? '')
    setAddError('')
    setAddOpen(true)
  }

  const submitAdd = () => {
    const amount = parseAmount(amountStr)
    if (amount === null || amount <= 0) {
      setAddError('Introduz um valor válido.')
      return
    }
    if (!categoryId) {
      setAddError('Escolhe uma categoria.')
      return
    }
    if (repoePoupanca && !fonteBucketId) {
      setAddError('Escolhe o balde fonte.')
      return
    }
    if (editingId) {
      const existing = data.transactions.find((t) => t.id === editingId)
      if (!existing) return
      void put('transactions', {
        ...existing,
        date,
        categoryId,
        amount,
        nome: nome.trim() || undefined,
        description: description.trim(),
        repoePoupanca,
        fonteBucketId: repoePoupanca ? fonteBucketId : undefined,
      })
      if (existing.reposto) {
        const linked = data.savingsMovements.find((m) => m.transactionId === editingId)
        if (linked) void put('savingsMovements', { ...linked, amount: -Math.abs(amount) })
      }
    } else {
      void addTransactions([{
        date,
        categoryId,
        amount,
        nome: nome.trim() || undefined,
        description: description.trim(),
        repoePoupanca,
        fonteBucketId: repoePoupanca ? fonteBucketId : undefined,
        reposto: false,
      }])
    }
    setAddOpen(false)
  }

  // ---------- Modal "Importar extrato" ----------
  const [importOpen, setImportOpen] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const [rawText, setRawText] = useState('')
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [noRows, setNoRows] = useState(false)

  const openImport = () => {
    setStep(1)
    setRawText('')
    setRows([])
    setNoRows(false)
    setImportOpen(true)
  }

  const closeImport = () => {
    setImportOpen(false)
    setStep(1)
    setRawText('')
    setRows([])
    setNoRows(false)
  }

  const analyze = () => {
    const parsed = parseBankStatement(rawText)
    if (parsed.length === 0) {
      setNoRows(true)
      setRows([])
      return
    }
    setNoRows(false)

    const key = (date: string, amount: number, description: string) =>
      `${monthOfDate(date)}|${amount}|${description.trim()}`

    const seen = new Set(data.transactions.map((t) => key(t.date, t.amount, t.description)))

    setRows(parsed.map((r) => {
      const suggested = matchCategoryByName(r.categoriaText, categories) ?? suggestCategory(r.description, data.categoryRules) ?? ''
      const k = key(r.date, r.amount, r.description)
      const duplicate = seen.has(k)
      if (!duplicate) seen.add(k)
      return {
        date: r.date, nome: r.nome, description: r.description, amount: r.amount,
        included: !duplicate, categoryId: suggested, suggested, duplicate,
      }
    }))
    setStep(2)
  }

  const includedCount = rows.filter((r) => r.included).length
  const canImport = includedCount > 0 && rows.filter((r) => r.included).every((r) => r.categoryId)

  const updateRow = (index: number, patch: Partial<PreviewRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const doImport = () => {
    const included = rows.filter((r) => r.included)
    if (included.length === 0) return
    void addTransactions(included.map((r) => ({
      date: r.date,
      categoryId: r.categoryId,
      amount: r.amount,
      nome: r.nome || undefined,
      description: r.description,
      repoePoupanca: false,
      reposto: false,
    })))

    // Aprendizagem: cria regras para linhas cuja categoria escolhida difere da sugestão.
    const existingKeywords = new Set(data.categoryRules.map((rule) => normalizeDesc(rule.keyword)))
    for (const r of included) {
      if (r.categoryId !== r.suggested) {
        const words = normalizeDesc(r.description).split(' ').filter((w) => w.length > 2)
        const keyword = words.slice(0, 2).join(' ')
        if (keyword && !existingKeywords.has(keyword)) {
          const rule: CategoryRule = { id: uid(), keyword, categoryId: r.categoryId }
          void put('categoryRules', rule)
          existingKeywords.add(keyword)
        }
      }
    }
    closeImport()
  }

  return (
    <div className="fade-up flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black">Gastos</h1>
        <div className="flex gap-2">
          <Button variant="soft" onClick={openAdd}>+ Gasto</Button>
          <Button variant="ghost" onClick={openImport}>Importar extrato</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-stretch gap-3">
        <Card className="flex flex-1 flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted">Mês</label>
            <div className="flex items-center gap-2">
              <Input
                type="month"
                value={selectedMonth ?? ''}
                onChange={(e) => setSelectedMonth(e.target.value || null)}
              />
              {selectedMonth && (
                <Button variant="ghost" size="sm" onClick={() => setSelectedMonth(null)}>Limpar</Button>
              )}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Categoria</label>
            <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="all">Todas</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
        </Card>
        <MetricCard label="Total filtrado" value={fmtEUR(total)} tone="negative" hint={`${filtered.length} gasto(s)`} />
      </div>

      <Card>
        <SectionTitle>Transações</SectionTitle>
        {filtered.length === 0 ? (
          <EmptyState title="Sem gastos neste filtro" hint="Regista um gasto manualmente ou importa o extrato do banco." />
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {filtered.map((t) => (
              <div key={t.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="tnum w-20 shrink-0 text-xs text-muted">{fmtDate(t.date)}</span>
                  <Badge>{categoryName(t.categoryId)}</Badge>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-text" title={t.nome || t.description}>
                      {t.nome || t.description}
                    </div>
                    {t.nome && t.description && (
                      <div className="truncate text-xs text-muted" title={t.description}>{t.description}</div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                  {t.repoePoupanca && (
                    <button
                      onClick={() => void setTransactionReposto(t.id, !t.reposto)}
                      className="shrink-0"
                    >
                      {t.reposto ? (
                        <Badge tone="accent">Reposto ✓</Badge>
                      ) : (
                        <Badge tone="warn">{`Repor de ${bucketName(t.fonteBucketId)}`}</Badge>
                      )}
                    </button>
                  )}
                  <Money value={-t.amount} className="w-20 shrink-0 text-right font-semibold" />
                  <button
                    onClick={() => openEdit(t)}
                    className="shrink-0 rounded-lg px-1.5 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text"
                    aria-label="Editar gasto"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm('Apagar este gasto?')) void remove('transactions', t.id)
                    }}
                    className="shrink-0 rounded-lg px-1.5 py-1 text-xs text-muted hover:bg-surface-2 hover:text-negative"
                    aria-label="Apagar gasto"
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="text-xs text-muted">
        Dica: marca "repor da poupança" em despesas como Saúde que se vão buscar ao balde Geral —
        assim consegues acompanhar o que ainda falta repor.
      </p>

      {/* Modal +Gasto / Editar gasto */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={editingId ? 'Editar gasto' : 'Novo gasto'}>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Data</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Categoria</label>
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full">
                <option value="">— escolher —</option>
                {categories.map((c: TransactionCategory) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Valor (€)</label>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Nome</label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Rótulo curto (opcional)" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Descrição</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" />
          </div>
          <label className="flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={repoePoupanca}
              onChange={(e) => setRepoePoupanca(e.target.checked)}
            />
            Repor da poupança
          </label>
          {repoePoupanca && (
            <div>
              <label className="mb-1 block text-xs text-muted">Balde fonte</label>
              <Select value={fonteBucketId} onChange={(e) => setFonteBucketId(e.target.value)} className="w-full">
                <option value="">— escolher —</option>
                {buckets.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
            </div>
          )}
          {addError && <p className="text-sm text-negative">{addError}</p>}
          <div className="mt-1 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={submitAdd}>Guardar</Button>
          </div>
        </div>
      </Modal>

      {/* Modal Importar extrato */}
      <Modal open={importOpen} onClose={closeImport} title="Importar extrato" wide>
        {step === 1 ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">
              Cola aqui as linhas do extrato do banco, uma por linha, no formato:
            </p>
            <code className="block rounded-lg bg-surface-2 p-2 text-xs text-text">
              data;nome;categoria;valor;descrição
            </code>
            <p className="text-xs text-muted">
              Separadores aceites: ponto e vírgula (;) ou tabulação. Datas em AAAA-MM-DD ou DD/MM/AAAA.
              A categoria é usada se corresponder ao nome de uma categoria existente; caso contrário
              tenta-se adivinhar pela descrição. Só linhas com valores negativos (saídas) são importadas.
            </p>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={10}
              placeholder={'2026-07-03;Compras;Alimentação;-42,10;PINGO DOCE LISBOA\n2026-07-04;Farmácia;Saúde;-12,50;FARMACIA CENTRAL'}
              className={cx(
                'w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text',
                'placeholder:text-muted focus:border-accent focus:outline-none',
              )}
            />
            {noRows && (
              <p className="text-sm text-negative">
                Não foi possível identificar linhas válidas. Confirma o formato acima.
              </p>
            )}
            <div className="mt-1 flex justify-end gap-2">
              <Button variant="ghost" onClick={closeImport}>Cancelar</Button>
              <Button onClick={analyze} disabled={!rawText.trim()}>Analisar</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex max-h-[50dvh] flex-col divide-y divide-border overflow-y-auto rounded-xl border border-border">
              {rows.map((r, i) => (
                <div key={`${r.date}-${i}`} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      checked={r.included}
                      onChange={(e) => updateRow(i, { included: e.target.checked })}
                    />
                    <span className="tnum w-20 shrink-0 text-xs text-muted">{fmtDate(r.date)}</span>
                    {r.duplicate && <Badge tone="warn">Duplicado</Badge>}
                    <div className="min-w-0 max-w-[220px]">
                      <div className="truncate text-sm font-medium text-text" title={r.nome || r.description}>
                        {r.nome || r.description}
                      </div>
                      {r.nome && r.description && (
                        <div className="truncate text-xs text-muted" title={r.description}>{r.description}</div>
                      )}
                    </div>
                    <Money value={-r.amount} className="w-20 shrink-0 text-right font-semibold" />
                  </div>
                  <Select
                    value={r.categoryId}
                    onChange={(e) => updateRow(i, { categoryId: e.target.value })}
                    disabled={!r.included}
                    className="w-full sm:w-48"
                  >
                    <option value="">— escolher —</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setStep(1)}>Voltar</Button>
              <Button onClick={doImport} disabled={!canImport}>
                {`Importar ${includedCount} gasto${includedCount === 1 ? '' : 's'}`}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

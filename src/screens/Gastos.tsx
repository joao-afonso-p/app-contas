import { useEffect, useRef, useState } from 'react'
import {
  Badge, Button, Card, EmptyState, Input, MetricCard, Modal, Money, SectionTitle, Select, Spinner, cx,
} from '../components/ui'
import { CategoryPicker } from '../components/CategoryPicker'
import { isUncategorized, matchCategoryByName, normalizeDesc, parseBankStatement, suggestCategory } from '../lib/calc/budgets'
import { fileToText, isSupportedFile } from '../lib/ai/extractText'
import { buildStatementHistory, extractStatement, rowsToStatementText } from '../lib/ai/openai'
import { getOpenAiKey } from '../lib/apiKey'
import {
  addMonths, currentMonthKey, fmtDate, fmtEUR, monthOfDate, nowISO, parseAmount, todayISO, uid,
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
    .filter((t) => {
      if (categoryFilter === 'all') return true
      if (categoryFilter === 'none') return isUncategorized(t, categories)
      return t.categoryId === categoryFilter
    })
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1
      return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
    })

  const total = filtered.reduce((sum, t) => sum + t.amount, 0)
  const uncategorizedCount = data.transactions.filter((t) => isUncategorized(t, categories)).length

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
  const [jaReposto, setJaReposto] = useState(false)
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
    setJaReposto(false)
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
    setJaReposto(t.reposto)
    setAddError('')
    setAddOpen(true)
  }

  const submitAdd = () => {
    const amount = parseAmount(amountStr)
    if (amount === null || amount <= 0) {
      setAddError('Introduz um valor válido.')
      return
    }
    // Categoria é opcional: podes deixar vazio e atribuir depois (fica marcado
    // como "sem categoria").
    if (repoePoupanca && !fonteBucketId) {
      setAddError('Escolhe o balde fonte.')
      return
    }
    // "Já reposto" marca o estado sem criar movimento (o utilizador já lançou o
    // dele manualmente). A criação automática do movimento só acontece ao clicar
    // na tag amarela "Repor de X" na lista (setTransactionReposto).
    const targetReposto = repoePoupanca ? jaReposto : false
    const fields = {
      date,
      categoryId,
      amount,
      nome: nome.trim() || undefined,
      description: description.trim(),
      repoePoupanca,
      fonteBucketId: repoePoupanca ? fonteBucketId : undefined,
      reposto: targetReposto,
    }
    if (editingId) {
      const existing = data.transactions.find((t) => t.id === editingId)
      if (!existing) return
      void put('transactions', { ...existing, ...fields })
      // Reconcilia o movimento ligado (criado antes via clique na tag amarela).
      const linked = data.savingsMovements.filter((m) => m.transactionId === editingId)
      if (!targetReposto) {
        // Desmarcou → desfaz a reposição automática, se existia.
        for (const m of linked) void remove('savingsMovements', m.id)
      } else if (linked.length) {
        // Continua reposto → mantém o movimento sincronizado com valor/balde.
        void put('savingsMovements', { ...linked[0], amount: -Math.abs(amount), bucketId: fonteBucketId })
      }
      // targetReposto && sem movimento ligado → não cria nada (o movimento é manual).
    } else if (targetReposto) {
      // Gasto novo já reposto: id pré-gerado, sem criar movimento.
      void put('transactions', { id: uid(), createdAt: nowISO(), ...fields })
    } else {
      void addTransactions([fields])
    }
    setAddOpen(false)
  }

  // ---------- Modal "Importar extrato" ----------
  const [importOpen, setImportOpen] = useState(false)
  const [importMode, setImportMode] = useState<'paste' | 'file'>('paste')
  const [step, setStep] = useState<1 | 2>(1)
  const [rawText, setRawText] = useState('')
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [noRows, setNoRows] = useState(false)
  const [processing, setProcessing] = useState('')
  const [liveLine, setLiveLine] = useState('')
  const [fileError, setFileError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const openImport = () => {
    setImportMode('paste')
    setStep(1)
    setRawText('')
    setRows([])
    setNoRows(false)
    setProcessing('')
    setLiveLine('')
    setFileError('')
    setImportOpen(true)
  }

  const closeImport = () => {
    setImportOpen(false)
    setImportMode('paste')
    setStep(1)
    setRawText('')
    setRows([])
    setNoRows(false)
    setProcessing('')
    setLiveLine('')
    setFileError('')
  }

  const processFile = async (file: File) => {
    setFileError('')
    setNoRows(false)
    const apiKey = getOpenAiKey()
    if (!apiKey) {
      setFileError('Ainda não configuraste a API key do OpenAI. Vai a Definições → OpenAI e cola a tua key.')
      return
    }
    if (!isSupportedFile(file)) {
      setFileError('Só são suportados ficheiros PDF ou Excel (.xlsx/.xls).')
      return
    }
    try {
      setProcessing('A ler o ficheiro…')
      const text = await fileToText(file)
      if (!text.trim()) {
        setFileError('Não foi possível ler texto deste ficheiro (pode ser um PDF digitalizado/imagem).')
        setProcessing('')
        return
      }
      setProcessing('A analisar o extrato…')
      setLiveLine('')
      const history = buildStatementHistory(data.transactions, categories, todayISO())
      const result = await extractStatement({
        text,
        apiKey,
        categoryNames: categories.map((c) => c.name),
        history,
        onProgress: (latest) => setLiveLine(latest),
      })
      setProcessing('')
      setLiveLine('')
      if (!result.viable || result.rows.length === 0) {
        setFileError(result.reason || 'Impossível extrair movimentos deste ficheiro.')
        return
      }
      const generated = rowsToStatementText(result.rows)
      if (parseBankStatement(generated).length === 0) {
        setFileError('Foram lidos movimentos, mas nenhum é uma saída/gasto (só entradas).')
        return
      }
      setRawText(generated)
      analyze(generated)
    } catch (e) {
      setProcessing('')
      setFileError(e instanceof Error ? e.message : 'Erro ao processar o ficheiro.')
    }
  }

  const analyze = (text: string = rawText) => {
    const parsed = parseBankStatement(text)
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
  // Categoria já não é obrigatória: linhas sem categoria são importadas e
  // podem ser atribuídas depois (ficam marcadas como "sem categoria").
  const canImport = includedCount > 0
  const includedSemCategoria = rows.filter((r) => r.included && !r.categoryId).length

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
      if (r.categoryId && r.categoryId !== r.suggested) {
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
              <option value="none">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
        </Card>
        <MetricCard label="Total filtrado" value={fmtEUR(total)} tone="negative" hint={`${filtered.length} gasto(s)`} />
      </div>

      {uncategorizedCount > 0 && categoryFilter !== 'none' && (
        <Card className="flex flex-wrap items-center justify-between gap-2 border-warn/40 bg-warn-soft/40">
          <span className="flex items-center gap-2 text-sm text-text">
            <span>⚠️</span>
            {`${uncategorizedCount} gasto${uncategorizedCount === 1 ? '' : 's'} sem categoria — atribui-${uncategorizedCount === 1 ? 'o' : 'os'} para os budgets ficarem certos.`}
          </span>
          <Button size="sm" variant="soft" onClick={() => { setSelectedMonth(null); setCategoryFilter('none') }}>
            Ver
          </Button>
        </Card>
      )}

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
                  <CategoryPicker
                    categories={categories}
                    value={t.categoryId}
                    onSelect={(id) => void put('transactions', { ...t, categoryId: id })}
                  />
                  <div className="min-w-0">
                    <InlineName
                      display={t.nome || t.description}
                      initial={t.nome ?? ''}
                      onSave={(v) => void put('transactions', { ...t, nome: v.trim() || undefined })}
                    />
                    {t.nome && t.description && (
                      <div className="truncate text-xs text-muted" title={t.description}>{t.description}</div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                  {t.repoePoupanca && (
                    t.reposto ? (
                      // Estado (verde) — não clicável; desfazer faz-se no editar.
                      <span className="shrink-0">
                        <Badge tone="accent">Reposto ✓</Badge>
                      </span>
                    ) : (
                      // Ação (amarelo) — confirmar reposição cria o movimento.
                      <button
                        onClick={() => void setTransactionReposto(t.id, true)}
                        className="shrink-0"
                        title="Confirmar reposição (cria o movimento na poupança)"
                      >
                        <Badge tone="warn">{`Repor de ${bucketName(t.fonteBucketId)}`}</Badge>
                      </button>
                    )
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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={repoePoupanca}
                onChange={(e) => {
                  setRepoePoupanca(e.target.checked)
                  if (!e.target.checked) setJaReposto(false)
                }}
              />
              Repor da poupança
            </label>
            {repoePoupanca && (
              <label className="flex items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  checked={jaReposto}
                  onChange={(e) => setJaReposto(e.target.checked)}
                />
                Já reposto (movimento já lançado)
              </label>
            )}
          </div>
          {repoePoupanca && (
            <div>
              <label className="mb-1 block text-xs text-muted">Balde fonte</label>
              <Select value={fonteBucketId} onChange={(e) => setFonteBucketId(e.target.value)} className="w-full">
                <option value="">— escolher —</option>
                {buckets.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
              {jaReposto && (
                <p className="mt-1 text-xs text-muted">
                  Fica marcado como reposto sem criar movimento (assume-se que já lançaste o movimento manualmente).
                </p>
              )}
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
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={importMode === 'paste' ? 'soft' : 'ghost'}
                onClick={() => { setImportMode('paste'); setFileError('') }}
              >
                Colar texto
              </Button>
              <Button
                size="sm"
                variant={importMode === 'file' ? 'soft' : 'ghost'}
                onClick={() => { setImportMode('file'); setNoRows(false) }}
              >
                Extrair de ficheiro (PDF/Excel)
              </Button>
            </div>

            {importMode === 'paste' ? (
              <>
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
                  <Button onClick={() => analyze()} disabled={!rawText.trim()}>Analisar</Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted">
                  Envia o PDF ou Excel do extrato do banco. A app extrai o texto e usa a IA (OpenAI)
                  para preencher automaticamente os movimentos — depois podes rever tudo antes de importar.
                  O ficheiro não é guardado em lado nenhum.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.xlsx,.xls,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void processFile(f)
                    e.target.value = ''
                  }}
                />
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-6 text-center">
                  {processing ? (
                    <>
                      <div className="flex items-center gap-2 text-sm text-text">
                        <Spinner />
                        <span>{processing}</span>
                      </div>
                      {liveLine && (
                        <p className="w-full truncate text-xs text-muted" title={liveLine}>
                          {liveLine}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-muted">PDF ou Excel (.xlsx / .xls)</p>
                      <Button variant="soft" onClick={() => fileInputRef.current?.click()}>
                        Escolher ficheiro…
                      </Button>
                    </>
                  )}
                </div>
                {fileError && <p className="text-sm text-negative">{fileError}</p>}
                <div className="mt-1 flex justify-end gap-2">
                  <Button variant="ghost" onClick={closeImport}>Cancelar</Button>
                </div>
              </>
            )}
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
            {includedSemCategoria > 0 && (
              <p className="text-xs text-muted">
                {`${includedSemCategoria} ${includedSemCategoria === 1 ? 'linha vai ficar' : 'linhas vão ficar'} sem categoria — podes atribuir agora ou depois, na lista de gastos.`}
              </p>
            )}
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

// Edição inline do nome: clicar no texto torna-o editável, Enter/blur grava,
// Esc cancela. Edita apenas o `nome` (mesmo quando mostra a descrição por o
// nome estar vazio). O botão ✎ continua a permitir editar tudo.
function InlineName({
  display, initial, onSave,
}: { display: string; initial: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) ref.current?.select()
  }, [editing])

  const commit = () => {
    setEditing(false)
    if (draft !== initial) onSave(draft)
  }

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setDraft(initial); setEditing(false) }
        }}
        placeholder="Nome do gasto"
        className="w-full max-w-[220px] rounded-lg border border-accent bg-surface px-2 py-1 text-sm text-text focus:outline-none"
      />
    )
  }
  return (
    <button
      type="button"
      onClick={() => { setDraft(initial); setEditing(true) }}
      title="Clica para editar o nome"
      className="block max-w-full truncate rounded text-left text-sm font-medium text-text hover:text-accent-strong"
    >
      {display}
    </button>
  )
}

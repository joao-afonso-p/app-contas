import { Fragment, useEffect, useRef, useState } from 'react'
import {
  Badge, Button, Card, EmptyState, Input, MetricCard, Modal, Money, SectionTitle, Select, Spinner, cx,
} from '../components/ui'
import { CategoryPicker } from '../components/CategoryPicker'
import { normalizeDesc, parseBankStatement } from '../lib/calc/budgets'
import {
  activeGroups, allGroups, categoryOptions, isUnassigned, labelFor, legacyNeedingMapping, makeResolver, matchOptionByText,
  newSubcategory, subcategoriesOf, suggestOption, txCategoryFields,
} from '../lib/calc/categories'
import { fileToText, isSupportedFile } from '../lib/ai/extractText'
import { buildStatementHistory, extractStatement, rowsToStatementText } from '../lib/ai/openai'
import { getOpenAiKey } from '../lib/apiKey'
import { deliverFile } from '../lib/download'
import { transactionsToCsv } from '../lib/exportTransactions'
import {
  addMonths, currentMonthKey, fmtDate, fmtEUR, monthOfDate, parseAmount, todayISO, uid,
} from '../lib/format'
import { isAutoBucketMovement, useStore } from '../store/useStore'
import type { CategoryRule, Transaction } from '../types'

interface PreviewRow {
  date: string
  nome: string
  description: string
  amount: number
  included: boolean
  optionKey: string // `${groupId}|${subcategoryId}` ('' = sem categoria)
  suggested: string
  duplicate: boolean
}

const keyOf = (groupId?: string, subId?: string) => (groupId ? `${groupId}|${subId ?? ''}` : '')
const splitKey = (key: string) => {
  const [groupId, subId] = key.split('|')
  return { groupId: groupId || undefined, subId: subId || undefined }
}

export function Gastos() {
  const data = useStore((s) => s.data)
  const put = useStore((s) => s.put)
  const remove = useStore((s) => s.remove)
  const addTransactions = useStore((s) => s.addTransactions)
  const saveTransaction = useStore((s) => s.saveTransaction)
  const setTransactionCategory = useStore((s) => s.setTransactionCategory)
  const deleteTransaction = useStore((s) => s.deleteTransaction)
  const bulkUpdateTransactions = useStore((s) => s.bulkUpdateTransactions)
  const setScreen = useStore((s) => s.setScreen)

  const groups = activeGroups(data)
  const resolve = makeResolver(data)
  const legacyName = (t: Transaction) => data.transactionCategories.find((c) => c.id === t.categoryId)?.name
  const pendingLegacy = legacyNeedingMapping(data)
  const createSubcategory = (parentId: string, name: string): string => {
    const id = uid()
    void put('subcategories', newSubcategory(data.subcategories, parentId, name, id))
    return id
  }

  // ---------- Filtros ----------
  // Default (sem mês escolhido): mês atual + anterior. Escolher um mês no
  // picker restringe a esse mês só; "Limpar" volta ao default.
  const defaultMonths = [currentMonthKey(), addMonths(currentMonthKey(), -1)]
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkDate, setBulkDate] = useState('')
  const [bulkGroup, setBulkGroup] = useState('')
  const [bulkSub, setBulkSub] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [exportFrom, setExportFrom] = useState('')
  const [exportTo, setExportTo] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [subFilter, setSubFilter] = useState<string>('all') // 'all' | 'none' | subcategoryId
  const filterSubs = categoryFilter !== 'all' && categoryFilter !== 'none'
    ? subcategoriesOf(data.subcategories, categoryFilter)
    : []

  const filtered = data.transactions
    // "Sem categoria" ignora a janela por defeito: o aviso conta todos os meses.
    .filter((t) => (selectedMonth
      ? monthOfDate(t.date) === selectedMonth
      : categoryFilter === 'none' || defaultMonths.includes(monthOfDate(t.date))))
    .filter((t) => {
      if (categoryFilter === 'all') return true
      if (categoryFilter === 'none') return isUnassigned(resolve(t))
      const r = resolve(t)
      if (r.groupId !== categoryFilter) return false
      if (subFilter === 'all') return true
      if (subFilter === 'none') return !r.subcategoryId
      return r.subcategoryId === subFilter
    })
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1
      return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
    })

  // Seleção só conta gastos ainda visíveis/existentes.
  const selectedIds = filtered.filter((t) => selected.has(t.id)).map((t) => t.id)
  const allSelected = filtered.length > 0 && selectedIds.length === filtered.length
  const toggleOne = (id: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map((t) => t.id)))
  const openBulk = () => { setBulkDate(''); setBulkGroup(''); setBulkSub(''); setBulkOpen(true) }
  const applyBulk = () => {
    if (!bulkDate && !bulkGroup) return
    if (bulkGroup && !data.savingsBuckets.some((b) => b.id === bulkGroup)) {
      const hadLinked = data.savingsMovements.some((m) => selectedIds.includes(m.transactionId ?? ''))
      if (hadLinked && !window.confirm('Alguns gastos estavam pagos pela poupança. Ao mudar de categoria, a saída do balde é removida. Continuar?')) return
    }
    void bulkUpdateTransactions(selectedIds, {
      date: bulkDate || undefined, groupId: bulkGroup || undefined, subcategoryId: bulkSub || undefined,
    })
    setBulkOpen(false)
    setSelected(new Set())
  }
  const exportData = transactionsToCsv(
    data.transactions,
    (t) => {
      const r = resolve(t)
      const g = allGroups(data).find((x) => x.id === r.groupId)
      const sub = r.subcategoryId ? data.subcategories.find((s) => s.id === r.subcategoryId) : undefined
      return { categoria: g?.name ?? '', subcategoria: sub?.name ?? '' }
    },
    exportFrom || undefined,
    exportTo || undefined,
  )
  const exportCount = exportOpen ? exportData.count : 0
  const total = filtered.reduce((sum, t) => sum + t.amount, 0)
  const uncategorizedCount = data.transactions.filter((t) => isUnassigned(resolve(t))).length


  // ---------- Modal "+ Gasto" / "Editar gasto" ----------
  const [addOpen, setAddOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [date, setDate] = useState(todayISO())
  const [groupId, setGroupId] = useState('')
  const [subId, setSubId] = useState('')
  const [newSubName, setNewSubName] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [nome, setNome] = useState('')
  const [description, setDescription] = useState('')
  const [addError, setAddError] = useState('')

  const openEdit = (t: Transaction) => {
    setEditingId(t.id)
    setDate(t.date)
    const r = resolve(t)
    setGroupId(r.groupId ?? '')
    setSubId(r.subcategoryId ?? '')
    setNewSubName('')
    setAmountStr(String(t.amount).replace('.', ','))
    setNome(t.nome ?? '')
    setDescription(t.description)
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
    // como "sem categoria do plano").
    let finalSub = subId
    if (groupId && newSubName.trim()) finalSub = createSubcategory(groupId, newSubName)
    if (editingId && !groupId) {
      // Sem categoria: só atualiza os campos simples (mantém a categoria antiga intacta).
      const existing = data.transactions.find((t) => t.id === editingId)
      if (!existing) return
      const linked = data.savingsMovements.filter((m) => m.transactionId === editingId && isAutoBucketMovement(m))
      if (linked.length && !window.confirm('Este gasto tem uma saída automática do balde (de uma versão anterior). Ao tirar a categoria, essa saída é removida. Continuar?')) return
      void put('transactions', {
        ...existing, date, amount, nome: nome.trim() || undefined, description: description.trim(),
        planCategoryId: undefined, subcategoryId: undefined, repoePoupanca: false, fonteBucketId: undefined, reposto: false,
      })
      for (const m of linked) void remove('savingsMovements', m.id)
    } else if (!groupId) {
      void addTransactions([{
        date, categoryId: '', amount, nome: nome.trim() || undefined, description: description.trim(),
        repoePoupanca: false, reposto: false,
      }])
    } else {
      void saveTransaction(
        { date, amount, nome: nome.trim() || undefined, description: description.trim(), groupId, subcategoryId: finalSub || undefined },
        editingId ?? undefined,
      )
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
      const history = buildStatementHistory(data.transactions, (t) => labelFor(resolve(t), data), todayISO())
      const result = await extractStatement({
        text,
        apiKey,
        categoryNames: categoryOptions(data).map((o) => o.label),
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
      const opt = matchOptionByText(r.categoriaText, data) ?? suggestOption(r.description, data.categoryRules, data)
      const suggested = keyOf(opt?.groupId, opt?.subcategoryId)
      const k = key(r.date, r.amount, r.description)
      const duplicate = seen.has(k)
      if (!duplicate) seen.add(k)
      return {
        date: r.date, nome: r.nome, description: r.description, amount: r.amount,
        included: !duplicate, optionKey: suggested, suggested, duplicate,
      }
    }))
    setStep(2)
  }

  const includedCount = rows.filter((r) => r.included).length
  // Categoria já não é obrigatória: linhas sem categoria são importadas e
  // podem ser atribuídas depois (ficam marcadas como "sem categoria").
  const canImport = includedCount > 0
  const includedSemCategoria = rows.filter((r) => r.included && !r.optionKey).length

  const updateRow = (index: number, patch: Partial<PreviewRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const doImport = () => {
    const included = rows.filter((r) => r.included)
    if (included.length === 0) return
    void addTransactions(included.map((r) => {
      const { groupId: g, subId: sub } = splitKey(r.optionKey)
      return {
        date: r.date,
        categoryId: '',
        amount: r.amount,
        nome: r.nome || undefined,
        description: r.description,
        ...txCategoryFields(data, g, sub),
      }
    }))

    // Aprendizagem: cria regras para linhas cuja categoria escolhida difere da sugestão.
    const existingKeywords = new Set(data.categoryRules.map((rule) => normalizeDesc(rule.keyword)))
    for (const r of included) {
      if (r.optionKey && r.optionKey !== r.suggested) {
        const words = normalizeDesc(r.description).split(' ').filter((w) => w.length > 2)
        const keyword = words.slice(0, 2).join(' ')
        if (keyword && !existingKeywords.has(keyword)) {
          const { groupId: g, subId: sub } = splitKey(r.optionKey)
          const rule: CategoryRule = { id: uid(), keyword, categoryId: '', planCategoryId: g, subcategoryId: sub }
          void put('categoryRules', rule)
          existingKeywords.add(keyword)
        }
      }
    }
    closeImport()
  }

  const changeCategory = (transactionId: string, gid: string | undefined, sid: string | undefined) => {
    const hasLinked = data.savingsMovements.some((m) => m.transactionId === transactionId && isAutoBucketMovement(m))
    const goingToBucket = data.savingsBuckets.some((b) => b.id === gid)
    if (hasLinked && !goingToBucket
      && !window.confirm('Este gasto tem uma saída automática do balde (de uma versão anterior). Ao mudar de categoria, essa saída é removida. Continuar?')) return
    void setTransactionCategory(transactionId, gid as string, sid)
  }

  return (
    <div className="fade-up flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black">Gastos</h1>
        <div className="hidden gap-2 md:flex">
          <Button variant="soft" onClick={openImport}>Importar extrato</Button>
          <Button variant="ghost" onClick={() => setExportOpen(true)}>Exportar CSV</Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-stretch">
        <Card className="grid grid-cols-2 gap-3 md:flex md:flex-1 md:flex-wrap md:items-end">
          <div className="min-w-0">
            <label className="mb-1 block text-xs text-muted">Mês</label>
            <div className="flex items-center gap-2">
              <Input
                type="month"
                value={selectedMonth ?? ''}
                onChange={(e) => setSelectedMonth(e.target.value || null)}
                className="w-full min-w-0"
              />
              {selectedMonth && (
                <Button variant="ghost" size="sm" onClick={() => setSelectedMonth(null)}>Limpar</Button>
              )}
            </div>
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-xs text-muted">Categoria</label>
            <Select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setSubFilter('all') }} className="w-full min-w-0">
              <option value="all">Todas</option>
              <option value="none">Sem categoria</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.kind === 'bucket' ? `${g.name} (poupança)` : g.name}</option>
              ))}
            </Select>
          </div>
          {filterSubs.length > 0 && (
            <div className="col-span-2 md:col-span-1">
              <label className="mb-1 block text-xs text-muted">Subcategoria</label>
              <Select value={subFilter} onChange={(e) => setSubFilter(e.target.value)} className="w-full md:w-auto">
                <option value="all">Todas</option>
                <option value="none">Sem subcategoria</option>
                {filterSubs.map((sc) => (
                  <option key={sc.id} value={sc.id}>{sc.name}</option>
                ))}
              </Select>
            </div>
          )}
        </Card>
        <div className="flex items-baseline justify-between rounded-2xl border border-border bg-surface px-4 py-3 md:hidden">
          <span className="text-xs text-muted">Total filtrado · {filtered.length} gasto(s)</span>
          <span className="tnum text-lg font-bold text-negative">{fmtEUR(total)}</span>
        </div>
        <div className="hidden md:block">
          <MetricCard label="Total filtrado" value={fmtEUR(total)} tone="negative" hint={`${filtered.length} gasto(s)`} />
        </div>
      </div>

      {pendingLegacy.length > 0 && (
        <Card className="flex items-center justify-between gap-3 border-warn/40 bg-warn-soft/40">
          <span className="flex min-w-0 items-start gap-2 text-sm text-text">
            <span>🔗</span>
            {`${pendingLegacy.length} categoria${pendingLegacy.length === 1 ? ' antiga' : 's antigas'} por associar às categorias do plano — até lá, esses gastos não contam no Analytics.`}
          </span>
          <Button size="sm" variant="soft" className="shrink-0" onClick={() => setScreen('definicoes')}>Associar</Button>
        </Card>
      )}

      {uncategorizedCount > 0 && categoryFilter !== 'none' && (
        <Card className="flex items-center justify-between gap-3 border-warn/40 bg-warn-soft/40">
          <span className="flex min-w-0 items-start gap-2 text-sm text-text">
            <span>⚠️</span>
            {`${uncategorizedCount} gasto${uncategorizedCount === 1 ? '' : 's'} sem categoria — atribui-${uncategorizedCount === 1 ? 'o' : 'os'} a uma categoria do plano para o Analytics ficar certo.`}
          </span>
          <Button size="sm" variant="soft" className="shrink-0" onClick={() => { setSelectedMonth(null); setCategoryFilter('none'); setSubFilter('all') }}>
            Ver
          </Button>
        </Card>
      )}

      <Card>
        <SectionTitle
          right={filtered.length > 0 ? (
            <label className="hidden cursor-pointer items-center gap-1.5 text-xs font-medium text-muted md:flex">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              Selecionar todos
            </label>
          ) : undefined}
        >
          Transações
        </SectionTitle>
        {selectedIds.length > 0 && (
          <div className="sticky top-2 z-10 mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/40 bg-surface px-3 py-2 shadow-lg">
            <span className="text-sm font-semibold text-text">
              {selectedIds.length} {selectedIds.length === 1 ? 'selecionado' : 'selecionados'}
            </span>
            <div className="flex gap-2">
              <Button size="sm" onClick={openBulk}>Editar…</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Limpar</Button>
            </div>
          </div>
        )}
        {filtered.length === 0 ? (
          <EmptyState title="Sem gastos neste filtro" hint="Os gastos entram pelo extrato do banco (Importar extrato, em desktop)." />
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {filtered.map((t) => (
              <Fragment key={t.id}>
              <div className="flex flex-col gap-1.5 py-3 md:hidden">
                <div className="flex items-baseline justify-between gap-3">
                  <button onClick={() => openEdit(t)} className="min-w-0 truncate text-left text-sm font-medium text-text">
                    {t.nome || t.description}
                  </button>
                  <Money value={-t.amount} className="shrink-0 text-sm font-semibold" />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span className="tnum shrink-0">{fmtDate(t.date)}</span>
                  <CategoryPicker
                    groups={groups}
                    subcategories={data.subcategories}
                    value={resolve(t)}
                    fallbackLabel={legacyName(t)}
                    onSelect={(gid, sid) => changeCategory(t.id, gid, sid)}
                    onCreateSubcategory={createSubcategory}
                  />
                </div>
              </div>
              <div className="hidden flex-col gap-2 py-3 md:flex md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(t.id)}
                    onChange={() => toggleOne(t.id)}
                    aria-label="Selecionar gasto"
                    className="h-4 w-4 shrink-0"
                  />
                  <span className="tnum w-20 shrink-0 text-xs text-muted">{fmtDate(t.date)}</span>
                  <CategoryPicker
                    groups={groups}
                    subcategories={data.subcategories}
                    value={resolve(t)}
                    fallbackLabel={legacyName(t)}
                    onSelect={(gid, sid) => changeCategory(t.id, gid, sid)}
                    onCreateSubcategory={createSubcategory}
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
                      const linked = data.savingsMovements.some((m) => m.transactionId === t.id)
                      const msg = linked ? 'Apagar este gasto? A saída correspondente na poupança também é removida.' : 'Apagar este gasto?'
                      if (window.confirm(msg)) void deleteTransaction(t.id)
                    }}
                    className="shrink-0 rounded-lg px-1.5 py-1 text-xs text-muted hover:bg-surface-2 hover:text-negative"
                    aria-label="Apagar gasto"
                  >
                    🗑
                  </button>
                </div>
              </div>
              </Fragment>
            ))}
          </div>
        )}
      </Card>

      <p className="hidden text-xs text-muted md:block">
        Dica: escolhe como categoria um balde de poupança (ex.: Geral) quando o gasto é pago pela poupança —
        não conta contra o orçamento do mês. Não mexe no saldo do balde: se quiseres, regista a saída em Movimentos.
      </p>

      {/* Modal +Gasto / Editar gasto */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Editar gasto">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Data</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Categoria</label>
              <Select
                value={groupId}
                onChange={(e) => { setGroupId(e.target.value); setSubId(''); setNewSubName('') }}
                className="w-full"
              >
                <option value="">— escolher —</option>
                <optgroup label="Orçamento do mês">
                  {groups.filter((g) => g.kind === 'expense').map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </optgroup>
                {groups.some((g) => g.kind === 'bucket') && (
                  <optgroup label="Pago pela poupança">
                    {groups.filter((g) => g.kind === 'bucket').map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </optgroup>
                )}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Subcategoria (opcional)</label>
              <Select
                value={subId}
                onChange={(e) => { setSubId(e.target.value); setNewSubName('') }}
                disabled={!groupId}
                className="w-full"
              >
                <option value="">— nenhuma —</option>
                {groupId && subcategoriesOf(data.subcategories, groupId).map((sc) => (
                  <option key={sc.id} value={sc.id}>{sc.name}</option>
                ))}
              </Select>
            </div>
          </div>
          {groupId && (
            <Input
              value={newSubName}
              onChange={(e) => { setNewSubName(e.target.value); if (e.target.value) setSubId('') }}
              placeholder="…ou cria uma subcategoria nova"
            />
          )}
          {data.savingsBuckets.some((b) => b.id === groupId) && (
            <p className="text-xs text-muted">
              Pago pela poupança: não conta contra o orçamento do mês e não altera o saldo do balde (regista a saída em Movimentos, se quiseres).
            </p>
          )}
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
          {addError && <p className="text-sm text-negative">{addError}</p>}
          <div className="mt-1 flex justify-end gap-2">
            {editingId && (
              <Button
                variant="danger"
                className="mr-auto"
                onClick={() => {
                  const linked = data.savingsMovements.some((m) => m.transactionId === editingId)
                  const msg = linked ? 'Apagar este gasto? A saída correspondente na poupança também é removida.' : 'Apagar este gasto?'
                  if (window.confirm(msg)) { void deleteTransaction(editingId); setAddOpen(false) }
                }}
              >
                Apagar
              </Button>
            )}
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={submitAdd}>Guardar</Button>
          </div>
        </div>
      </Modal>

      {/* Modal edição em massa */}
      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title={`Editar ${selectedIds.length} gastos`}>
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted">Só os campos que preencheres são alterados; os restantes ficam como estão.</p>
          <div>
            <label className="mb-1 block text-xs text-muted">Data</label>
            <Input type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Categoria</label>
              <Select value={bulkGroup} onChange={(e) => { setBulkGroup(e.target.value); setBulkSub('') }} className="w-full">
                <option value="">— não alterar —</option>
                <optgroup label="Orçamento do mês">
                  {groups.filter((g) => g.kind === 'expense').map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </optgroup>
                {groups.some((g) => g.kind === 'bucket') && (
                  <optgroup label="Pago pela poupança">
                    {groups.filter((g) => g.kind === 'bucket').map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </optgroup>
                )}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Subcategoria</label>
              <Select value={bulkSub} onChange={(e) => setBulkSub(e.target.value)} disabled={!bulkGroup} className="w-full">
                <option value="">— nenhuma —</option>
                {bulkGroup && subcategoriesOf(data.subcategories, bulkGroup).map((sc) => (
                  <option key={sc.id} value={sc.id}>{sc.name}</option>
                ))}
              </Select>
            </div>
          </div>
          {bulkGroup && (
            <p className="text-xs text-muted">Os gastos passam todos para esta categoria; sem subcategoria escolhida, ficam sem subcategoria.</p>
          )}
          <div className="mt-1 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBulkOpen(false)}>Cancelar</Button>
            <Button disabled={!bulkDate && !bulkGroup} onClick={applyBulk}>Aplicar</Button>
          </div>
        </div>
      </Modal>

      {/* Modal Exportar CSV */}
      <Modal open={exportOpen} onClose={() => setExportOpen(false)} title="Exportar gastos (CSV)">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            Exporta todos os gastos, ou só os de um intervalo de datas (deixa vazio para "desde sempre").
          </p>
          <div className="flex flex-wrap gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">De</label>
              <Input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Até</label>
              <Input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} />
            </div>
          </div>
          <code className="block rounded-lg bg-surface-2 p-2 text-xs text-text">
            data;nome;categoria;subcategoria;valor;descrição
          </code>
          <p className="text-xs text-muted">
            {`${exportCount} gasto${exportCount === 1 ? '' : 's'} no intervalo. O ficheiro pode ser importado de volta em "Importar extrato".`}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setExportOpen(false)}>Cancelar</Button>
            <Button
              disabled={exportCount === 0}
              onClick={() => {
                const { csv } = exportData
                const tag = `${exportFrom || 'inicio'}_${exportTo || todayISO()}`
                void deliverFile(`gastos_${tag}.csv`, csv, 'text/csv', 'Gastos Contas')
                setExportOpen(false)
              }}
            >
              Descarregar
            </Button>
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
                    value={r.optionKey}
                    onChange={(e) => updateRow(i, { optionKey: e.target.value })}
                    disabled={!r.included}
                    className="w-full sm:w-48"
                  >
                    <option value="">— escolher —</option>
                    {categoryOptions(data).map((o) => (
                      <option key={keyOf(o.groupId, o.subcategoryId)} value={keyOf(o.groupId, o.subcategoryId)}>{o.label}</option>
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

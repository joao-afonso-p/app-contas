import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  applyOp, clampCell, fillDownCells, fillRightCells, inRect, onlyChanged, parseClipboard, planFill, planPaste,
  planSameAsPrevious, rectCells, rectOf, selectionStats, toTSV,
  type Cell, type CellValue, type Op, type Rect,
} from '../lib/calc/grid'
import { fmtEUR, parseAmount } from '../lib/format'
import type { MonthKey } from '../types'
import { Button, Input, Select, cx } from './ui'
import { X } from 'lucide-react'

// Grelha editável tipo Excel para as Projeções: seleção por arrasto/shift,
// teclado, copiar/colar (compatível com Excel), preencher com a alça,
// operações em bloco e desfazer/refazer. Só escreve através de `write`
// (que grava em projectionPlans) — nunca toca em planos reais nem movimentos.

export type GridSection = 'income' | 'expenses' | 'savings' | 'autoInvestments'
export interface GridRowDef { section: GridSection; id: string }
export interface CellChange { section: GridSection; id: string; month: MonthKey; before: number; after: number }

const CONFIRM_ABOVE = 20 // pede confirmação em alterações com mais células do que isto
const UNDO_LIMIT = 50

export function useProjectionGrid({
  rows, months, getValue, write,
}: {
  rows: GridRowDef[]
  months: MonthKey[]
  getValue: (r: number, c: number) => number
  write: (changes: Omit<CellChange, 'before'>[]) => Promise<void>
}) {
  const nRows = rows.length
  const nCols = months.length
  const containerRef = useRef<HTMLDivElement>(null)

  const [anchor, setAnchor] = useState<Cell | null>(null)
  const [focus, setFocus] = useState<Cell | null>(null)
  const [editing, setEditing] = useState<{ r: number; c: number; draft: string; replace: boolean } | null>(null)
  const editRef = useRef(editing)
  editRef.current = editing
  const [fillTarget, setFillTarget] = useState<Cell | null>(null)
  const dragRef = useRef<'select' | 'fill' | null>(null)
  const [dragging, setDragging] = useState<'select' | 'fill' | null>(null)
  const [undoStack, setUndoStack] = useState<CellChange[][]>([])
  const [redoStack, setRedoStack] = useState<CellChange[][]>([])
  const [notice, setNotice] = useState('')

  const rect: Rect | null = anchor && focus ? rectOf(anchor, focus) : null
  const valid = (c: Cell) => c.r >= 0 && c.r < nRows && c.c >= 0 && c.c < nCols

  // Se as linhas/meses mudarem (ex.: horizonte), garante que a seleção continua válida.
  useEffect(() => {
    if (anchor && !valid(anchor)) setAnchor(null)
    if (focus && !valid(focus)) setFocus(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nRows, nCols])

  const say = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice((cur) => (cur === msg ? '' : cur)), 4000)
  }

  const focusContainer = () => containerRef.current?.focus({ preventScroll: true })

  // ---------- Escrita (com desfazer) ----------

  const toChanges = (cells: CellValue[]): CellChange[] =>
    cells.map((cell) => ({
      section: rows[cell.r].section, id: rows[cell.r].id, month: months[cell.c],
      before: getValue(cell.r, cell.c), after: cell.value,
    }))

  const commitCells = (cells: CellValue[]) => {
    const changed = onlyChanged(cells.filter((x) => x.r >= 0 && x.r < nRows && x.c >= 0 && x.c < nCols), getValue)
    if (changed.length === 0) return false
    if (changed.length > CONFIRM_ABOVE && !window.confirm(`Vais alterar ${changed.length} células. Continuar? (Podes desfazer com Cmd/Ctrl+Z)`)) return false
    const changes = toChanges(changed)
    setUndoStack((s) => [...s.slice(-(UNDO_LIMIT - 1)), changes])
    setRedoStack([])
    void write(changes.map(({ before: _b, ...rest }) => rest))
    return true
  }

  const undo = () => {
    const last = undoStack[undoStack.length - 1]
    if (!last) return
    setUndoStack((s) => s.slice(0, -1))
    setRedoStack((s) => [...s, last])
    void write(last.map(({ section, id, month, before }) => ({ section, id, month, after: before })))
    focusContainer()
    say(`Desfeito (${last.length} ${last.length === 1 ? 'célula' : 'células'})`)
  }

  const redo = () => {
    const last = redoStack[redoStack.length - 1]
    if (!last) return
    setRedoStack((s) => s.slice(0, -1))
    setUndoStack((s) => [...s, last])
    void write(last.map(({ section, id, month, after }) => ({ section, id, month, after })))
    focusContainer()
    say(`Refeito (${last.length} ${last.length === 1 ? 'célula' : 'células'})`)
  }

  // ---------- Seleção ----------

  const selectCell = (cell: Cell, extend = false) => {
    const c = clampCell(cell, nRows, nCols)
    if (extend && anchor) setFocus(c)
    else { setAnchor(c); setFocus(c) }
  }
  const selectRow = (r: number, extend = false) => {
    if (extend && anchor) { setFocus({ r, c: nCols - 1 }); setAnchor({ r: anchor.r, c: 0 }) }
    else { setAnchor({ r, c: 0 }); setFocus({ r, c: nCols - 1 }) }
    focusContainer()
  }
  const selectColumn = (c: number, extend = false) => {
    if (extend && anchor) { setFocus({ r: nRows - 1, c }); setAnchor({ r: 0, c: anchor.c }) }
    else { setAnchor({ r: 0, c }); setFocus({ r: nRows - 1, c }) }
    focusContainer()
  }
  const selectAll = () => { setAnchor({ r: 0, c: 0 }); setFocus({ r: nRows - 1, c: nCols - 1 }) }
  const clearSelection = () => { setAnchor(null); setFocus(null) }

  // ---------- Edição de uma célula ----------

  const startEdit = (r: number, c: number, initial?: string) => {
    const cur = getValue(r, c)
    setEditing({
      r, c,
      draft: initial !== undefined ? initial : cur ? String(cur).replace('.', ',') : '',
      replace: initial === undefined,
    })
  }

  const finishEdit = (move?: { dr: number; dc: number }) => {
    const e = editRef.current
    if (!e) return
    editRef.current = null
    setEditing(null)
    const parsed = parseAmount(e.draft)
    if (parsed !== null) commitCells([{ r: e.r, c: e.c, value: parsed }])
    if (move) {
      const next = clampCell({ r: e.r + move.dr, c: e.c + move.dc }, nRows, nCols)
      setAnchor(next); setFocus(next)
    }
    focusContainer()
  }
  const cancelEdit = () => { editRef.current = null; setEditing(null); focusContainer() }

  // ---------- Ações sobre a seleção ----------

  const selectedCells = rect ? rectCells(rect) : []
  const stats = selectionStats(selectedCells.map(({ r, c }) => getValue(r, c)))

  // Depois de cada ação (também as dos botões) o foco volta à grelha, para os
  // atalhos (Cmd+Z, setas…) continuarem a funcionar.
  const clearValues = () => { if (rect) commitCells(selectedCells.map((x) => ({ ...x, value: 0 }))); focusContainer() }
  const fillRight = () => { if (rect) commitCells(fillRightCells(rect, getValue)); focusContainer() }
  const fillDown = () => { if (rect) commitCells(fillDownCells(rect, getValue)); focusContainer() }
  const sameAsPrevious = () => { if (rect) commitCells(planSameAsPrevious(rect, getValue)); focusContainer() }
  const applyToSelection = (op: Op, operand: number) => {
    if (!rect) return
    commitCells(selectedCells.map(({ r, c }) => ({ r, c, value: applyOp(op, operand, getValue(r, c)) })))
    focusContainer()
  }

  // ---------- Rato / toque ----------

  const onCellPointerDown = (e: React.PointerEvent, r: number, c: number) => {
    if (e.button !== 0) return
    if (editRef.current && editRef.current.r === r && editRef.current.c === c) return
    // Sem isto o clique devolve o foco ao contentor e fecha o editor acabado de abrir.
    e.preventDefault()
    if (editRef.current) finishEdit()
    if (e.pointerType === 'touch') {
      // Em ecrã tátil não há arrasto: tocar seleciona e abre a edição.
      selectCell({ r, c })
      startEdit(r, c)
      return
    }
    const single = rect && rect.r1 === rect.r2 && rect.c1 === rect.c2 && rect.r1 === r && rect.c1 === c
    if (e.shiftKey && anchor) setFocus({ r, c })
    else {
      setAnchor({ r, c }); setFocus({ r, c })
      if (single) { startEdit(r, c); return } // clicar numa célula já selecionada edita-a
    }
    dragRef.current = 'select'
    setDragging('select')
    focusContainer()
  }

  const onCellPointerEnter = (r: number, c: number) => {
    if (dragRef.current === 'select') setFocus({ r, c })
    else if (dragRef.current === 'fill') setFillTarget({ r, c })
  }

  const onFillHandleDown = (e: React.PointerEvent) => {
    if (!rect || e.button !== 0) return
    dragRef.current = 'fill'
    setDragging('fill')
    setFillTarget({ r: rect.r2, c: rect.c2 })
    e.preventDefault()
    e.stopPropagation()
  }

  useEffect(() => {
    const up = () => {
      const kind = dragRef.current
      if (!kind) return
      dragRef.current = null
      setDragging(null)
      if (kind === 'fill' && rect && fillTarget) {
        const { cells, extended } = planFill(rect, fillTarget, nRows, nCols, getValue)
        if (cells.length > 0 && commitCells(cells)) {
          setAnchor({ r: extended.r1, c: extended.c1 })
          setFocus({ r: extended.r2, c: extended.c2 })
        }
      }
      setFillTarget(null)
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  })

  // ---------- Teclado ----------

  const scrollTo = (cell: Cell) => {
    containerRef.current
      ?.querySelector<HTMLElement>(`[data-cell="${cell.r}-${cell.c}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editRef.current) return
    const mod = e.metaKey || e.ctrlKey
    const key = e.key
    if (mod && key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return }
    if (mod && key.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
    if (mod && key.toLowerCase() === 'a') { e.preventDefault(); selectAll(); return }
    if (!focus) return
    if (mod && key.toLowerCase() === 'r') { e.preventDefault(); fillRight(); return }
    if (mod && key.toLowerCase() === 'd') { e.preventDefault(); fillDown(); return }

    const arrows: Record<string, [number, number]> = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
    }
    if (arrows[key] || key === 'Tab') {
      e.preventDefault()
      let [dr, dc] = key === 'Tab' ? [0, e.shiftKey ? -1 : 1] : arrows[key]
      if (mod && key !== 'Tab') { dr *= nRows; dc *= nCols } // salta para a ponta
      const next = clampCell({ r: focus.r + dr, c: focus.c + dc }, nRows, nCols)
      if (e.shiftKey && key !== 'Tab' && anchor) setFocus(next)
      else { setAnchor(next); setFocus(next) }
      scrollTo(next)
      return
    }
    if (key === 'Enter' || key === 'F2') { e.preventDefault(); startEdit(focus.r, focus.c); return }
    if (key === 'Delete' || key === 'Backspace') { e.preventDefault(); clearValues(); return }
    if (key === 'Escape') { clearSelection(); return }
    if (!mod && !e.altKey && /^[0-9,.\-+]$/.test(key)) {
      e.preventDefault()
      startEdit(focus.r, focus.c, key)
    }
  }

  // ---------- Copiar / colar / cortar ----------

  const onCopy = (e: React.ClipboardEvent) => {
    if (editRef.current || !rect) return
    e.preventDefault()
    e.clipboardData.setData('text/plain', toTSV(rect, getValue))
    say(`Copiado (${selectedCells.length} ${selectedCells.length === 1 ? 'célula' : 'células'})`)
  }
  const onCut = (e: React.ClipboardEvent) => {
    if (editRef.current || !rect) return
    e.preventDefault()
    e.clipboardData.setData('text/plain', toTSV(rect, getValue))
    clearValues()
  }
  const onPaste = (e: React.ClipboardEvent) => {
    if (editRef.current || !rect) return
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    if (!text.trim()) return
    const { cells, ignored } = planPaste(rect, parseClipboard(text), nRows, nCols)
    if (cells.length === 0) {
      say(ignored > 0 ? 'Nada colado: o texto não tem valores numéricos.' : 'Nada para colar.')
      return
    }
    commitCells(cells)
    if (ignored > 0) say(`${ignored} ${ignored === 1 ? 'valor ignorado' : 'valores ignorados'} (não eram números).`)
  }

  // ---------- Estado visual ----------

  const preview = useMemo(
    () => (dragging === 'fill' && rect && fillTarget ? planFill(rect, fillTarget, nRows, nCols, getValue).extended : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dragging, rect?.r1, rect?.r2, rect?.c1, rect?.c2, fillTarget?.r, fillTarget?.c, nRows, nCols],
  )

  const cellState = useCallback((r: number, c: number) => ({
    selected: rect ? inRect(rect, r, c) : false,
    active: focus?.r === r && focus?.c === c,
    inFillPreview: preview ? inRect(preview, r, c) && !(rect && inRect(rect, r, c)) : false,
    showHandle: Boolean(rect && !editing && dragging !== 'select' && r === rect.r2 && c === rect.c2),
    editing: editing && editing.r === r && editing.c === c ? editing : null,
  }), [rect, focus, preview, editing, dragging])

  return {
    containerRef, rect, stats, notice, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0,
    undo, redo, clearValues, fillRight, fillDown, sameAsPrevious, applyToSelection, clearSelection,
    cellState, setDraft: (draft: string) => setEditing((e) => (e ? { ...e, draft } : e)),
    finishEdit, cancelEdit, selectRow, selectColumn, selectAll,
    onCellPointerDown, onCellPointerEnter, onFillHandleDown,
    containerProps: { ref: containerRef, tabIndex: 0, onKeyDown, onCopy, onCut, onPaste },
    nCols,
  }
}

export type ProjectionGrid = ReturnType<typeof useProjectionGrid>

// ---------- Componentes ----------

export function GridContainer({ grid, children }: { grid: ProjectionGrid; children: ReactNode }) {
  return (
    <div
      {...grid.containerProps}
      className="max-h-[70vh] select-none overflow-auto outline-none thin-scroll"
      aria-label="Grelha de projeções"
    >
      {children}
    </div>
  )
}

export function GridHeaderCell({ grid, c, children }: { grid: ProjectionGrid; c: number; children: ReactNode }) {
  return (
    <th
      onPointerDown={(e) => { if (e.button === 0) grid.selectColumn(c, e.shiftKey) }}
      title="Clica para selecionar a coluna"
      className="sticky top-0 z-20 cursor-pointer whitespace-nowrap bg-surface px-3 py-2 text-right align-bottom hover:bg-surface-2"
    >
      {children}
    </th>
  )
}

export function GridRow({
  grid, r, label, badge, months, getValue,
}: {
  grid: ProjectionGrid
  r: number
  label: ReactNode
  badge?: ReactNode
  months: MonthKey[]
  getValue: (r: number, c: number) => number
}) {
  return (
    <tr className="border-t border-border">
      <td
        onPointerDown={(e) => { if (e.button === 0) grid.selectRow(r, e.shiftKey) }}
        title="Clica para selecionar a linha"
        className="sticky left-0 z-10 cursor-pointer bg-surface px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-2"
      >
        <span className="flex items-center gap-1.5">{label}{badge}</span>
      </td>
      {months.map((m, c) => {
        const st = grid.cellState(r, c)
        const value = getValue(r, c)
        return (
          <td
            key={m}
            data-cell={`${r}-${c}`}
            onPointerDown={(e) => grid.onCellPointerDown(e, r, c)}
            onPointerEnter={() => grid.onCellPointerEnter(r, c)}
            className={cx(
              'relative px-1 py-1 text-right',
              st.selected && 'bg-accent-soft',
              st.inFillPreview && 'bg-accent-soft/50',
              st.active && 'outline outline-2 -outline-offset-2 outline-accent',
            )}
          >
            {st.editing ? (
              <input
                autoFocus
                inputMode="decimal"
                value={st.editing.draft}
                onFocus={(e) => { if (st.editing?.replace) e.currentTarget.select() }}
                onChange={(e) => grid.setDraft(e.target.value)}
                onBlur={() => grid.finishEdit()}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') { e.preventDefault(); grid.finishEdit({ dr: e.shiftKey ? -1 : 1, dc: 0 }) }
                  else if (e.key === 'Tab') { e.preventDefault(); grid.finishEdit({ dr: 0, dc: e.shiftKey ? -1 : 1 }) }
                  else if (e.key === 'Escape') { e.preventDefault(); grid.cancelEdit() }
                }}
                className="tnum w-24 rounded-lg border border-accent bg-surface px-2 py-1 text-right text-sm focus:outline-none"
              />
            ) : (
              <div className={cx('tnum rounded-lg px-2 py-1 text-right text-sm', !value && 'text-muted')}>
                {value ? fmtEUR(value) : '—'}
              </div>
            )}
            {st.showHandle && (
              <span
                onPointerDown={grid.onFillHandleDown}
                title="Arrasta para preencher"
                className="absolute bottom-0 right-0 z-10 h-2.5 w-2.5 translate-x-1/2 translate-y-1/2 cursor-crosshair rounded-sm border border-surface bg-accent-strong"
              />
            )}
          </td>
        )
      })}
    </tr>
  )
}

const OPS: { value: Op; label: string; placeholder: string }[] = [
  { value: 'set', label: 'Definir valor', placeholder: '€' },
  { value: 'add', label: 'Somar €', placeholder: '€' },
  { value: 'sub', label: 'Subtrair €', placeholder: '€' },
  { value: 'inc', label: 'Aumentar %', placeholder: '%' },
  { value: 'dec', label: 'Diminuir %', placeholder: '%' },
]

// Barra no topo: desfazer/refazer + ajuda curta.
export function GridTopBar({ grid }: { grid: ProjectionGrid }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
      <Button variant="ghost" size="sm" onClick={grid.undo} disabled={!grid.canUndo}>↶ Desfazer</Button>
      <Button variant="ghost" size="sm" onClick={grid.redo} disabled={!grid.canRedo}>↷ Refazer</Button>
      <span className="hidden text-xs text-muted md:inline">
        Arrasta para selecionar · Enter ou escrever edita · Cmd/Ctrl+C / V copia e cola (também do Excel) ·
        arrasta o canto para preencher · Delete limpa
      </span>
      {grid.notice && <span className="ml-auto text-xs font-medium text-accent-strong">{grid.notice}</span>}
    </div>
  )
}

// Barra de baixo: aparece com seleção — estatísticas e operações em bloco.
export function GridSelectionBar({ grid }: { grid: ProjectionGrid }) {
  const [op, setOp] = useState<Op>('set')
  const [value, setValue] = useState('')
  if (!grid.rect) return null
  const operand = parseAmount(value)
  const cfg = OPS.find((o) => o.value === op)!
  const multiCol = grid.rect.c2 > grid.rect.c1
  const multiRow = grid.rect.r2 > grid.rect.r1
  const apply = () => {
    if (operand === null) return
    grid.applyToSelection(op, operand)
    setValue('')
  }
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-2 px-3 py-2">
      <span className="tnum text-xs font-medium text-muted">
        {grid.stats.count} {grid.stats.count === 1 ? 'célula' : 'células'} · soma {fmtEUR(grid.stats.sum)}
        {grid.stats.count > 1 && ` · média ${fmtEUR(grid.stats.avg)}`}
      </span>
      <div className="flex items-center gap-1.5">
        <Select value={op} onChange={(e) => setOp(e.target.value as Op)} className="py-1.5 text-xs">
          {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Input
          inputMode="decimal"
          placeholder={cfg.placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') apply() }}
          className="w-24"
        />
        <Button size="sm" onClick={apply} disabled={operand === null}>Aplicar</Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="ghost" size="sm" onClick={grid.sameAsPrevious} title="Cada célula passa a ter o valor do mês anterior">
          = mês anterior
        </Button>
        {multiCol && <Button variant="ghost" size="sm" onClick={grid.fillRight} title="Cmd/Ctrl+R">Preencher →</Button>}
        {multiRow && <Button variant="ghost" size="sm" onClick={grid.fillDown} title="Cmd/Ctrl+D">Preencher ↓</Button>}
        <Button variant="ghost" size="sm" onClick={grid.clearValues}>Limpar</Button>
        <Button variant="ghost" size="sm" onClick={grid.clearSelection} aria-label="Limpar seleção"><X size={16} strokeWidth={1.75} aria-hidden="true" /></Button>
      </div>
    </div>
  )
}


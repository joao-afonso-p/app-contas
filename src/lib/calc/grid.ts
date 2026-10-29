import { parseAmount } from '../format'
import { round2 } from './allocation'

// Lógica pura da grelha editável das Projeções (seleção, copiar/colar,
// preencher, operações em bloco). Sem DOM nem store — fácil de testar.

export interface Cell { r: number; c: number }
export interface Rect { r1: number; r2: number; c1: number; c2: number }
export interface CellValue extends Cell { value: number }

export function rectOf(a: Cell, b: Cell): Rect {
  return { r1: Math.min(a.r, b.r), r2: Math.max(a.r, b.r), c1: Math.min(a.c, b.c), c2: Math.max(a.c, b.c) }
}

export function inRect(rect: Rect, r: number, c: number): boolean {
  return r >= rect.r1 && r <= rect.r2 && c >= rect.c1 && c <= rect.c2
}

export function rectSize(rect: Rect): { rows: number; cols: number } {
  return { rows: rect.r2 - rect.r1 + 1, cols: rect.c2 - rect.c1 + 1 }
}

export function clampCell(cell: Cell, rows: number, cols: number): Cell {
  return { r: Math.min(Math.max(cell.r, 0), Math.max(rows - 1, 0)), c: Math.min(Math.max(cell.c, 0), Math.max(cols - 1, 0)) }
}

export function rectCells(rect: Rect): Cell[] {
  const out: Cell[] = []
  for (let r = rect.r1; r <= rect.r2; r++) for (let c = rect.c1; c <= rect.c2; c++) out.push({ r, c })
  return out
}

// ---------- Copiar / colar (texto com tabulações, compatível com Excel/Sheets) ----------

const fmtCopy = (v: number) => (Math.abs(v) < 0.004 ? '' : String(round2(v)).replace('.', ','))

export function toTSV(rect: Rect, get: (r: number, c: number) => number): string {
  const lines: string[] = []
  for (let r = rect.r1; r <= rect.r2; r++) {
    const cells: string[] = []
    for (let c = rect.c1; c <= rect.c2; c++) cells.push(fmtCopy(get(r, c)))
    lines.push(cells.join('\t'))
  }
  return lines.join('\n')
}

// Vazio = 0 (limpar); texto inválido = null (ignorado, nunca vira 0).
export function parseClipboard(text: string): (number | null)[][] {
  const lines = text.replace(/\r/g, '').split('\n')
  while (lines.length > 1 && lines[lines.length - 1].trim() === '') lines.pop() // \n final do Excel
  return lines.map((line) =>
    line.split('\t').map((raw) => {
      const t = raw.trim()
      if (t === '') return 0
      return parseAmount(t)
    }),
  )
}

// Onde cai o que foi colado: um só valor preenche toda a seleção; um bloco
// cola a partir do canto superior esquerdo da seleção e é cortado nos limites.
export function planPaste(
  sel: Rect,
  clip: (number | null)[][],
  rows: number,
  cols: number,
): { cells: CellValue[]; ignored: number } {
  const cells: CellValue[] = []
  let ignored = 0
  const single = clip.length === 1 && clip[0].length === 1
  if (single) {
    const v = clip[0][0]
    if (v === null) return { cells, ignored: 1 }
    for (const { r, c } of rectCells(sel)) cells.push({ r, c, value: v })
    return { cells, ignored }
  }
  for (let i = 0; i < clip.length; i++) {
    for (let j = 0; j < clip[i].length; j++) {
      const r = sel.r1 + i
      const c = sel.c1 + j
      if (r >= rows || c >= cols) continue
      const v = clip[i][j]
      if (v === null) ignored++
      else cells.push({ r, c, value: v })
    }
  }
  return { cells, ignored }
}

// ---------- Preencher ----------

// Preenche a partir de `rect` até `target` (à direita ou para baixo), repetindo
// o padrão da seleção. Devolve só as células novas.
export function planFill(
  rect: Rect,
  target: Cell,
  rows: number,
  cols: number,
  get: (r: number, c: number) => number,
): { cells: CellValue[]; extended: Rect } {
  const { rows: h, cols: w } = rectSize(rect)
  const dr = target.r - rect.r2
  const dc = target.c - rect.c2
  const cells: CellValue[] = []
  if (dc <= 0 && dr <= 0) return { cells, extended: rect }
  if (dc >= dr) {
    const last = Math.min(target.c, cols - 1)
    for (let r = rect.r1; r <= rect.r2; r++) {
      for (let c = rect.c2 + 1; c <= last; c++) {
        cells.push({ r, c, value: get(r, rect.c1 + ((c - rect.c1) % w)) })
      }
    }
    return { cells, extended: { ...rect, c2: Math.max(rect.c2, last) } }
  }
  const last = Math.min(target.r, rows - 1)
  for (let c = rect.c1; c <= rect.c2; c++) {
    for (let r = rect.r2 + 1; r <= last; r++) {
      cells.push({ r, c, value: get(rect.r1 + ((r - rect.r1) % h), c) })
    }
  }
  return { cells, extended: { ...rect, r2: Math.max(rect.r2, last) } }
}

// Cmd+R: copia a 1ª coluna da seleção para as restantes; Cmd+D: a 1ª linha para baixo.
export function fillRightCells(rect: Rect, get: (r: number, c: number) => number): CellValue[] {
  const cells: CellValue[] = []
  for (let r = rect.r1; r <= rect.r2; r++) for (let c = rect.c1 + 1; c <= rect.c2; c++) cells.push({ r, c, value: get(r, rect.c1) })
  return cells
}
export function fillDownCells(rect: Rect, get: (r: number, c: number) => number): CellValue[] {
  const cells: CellValue[] = []
  for (let c = rect.c1; c <= rect.c2; c++) for (let r = rect.r1 + 1; r <= rect.r2; r++) cells.push({ r, c, value: get(rect.r1, c) })
  return cells
}

// ---------- Operações em bloco ----------

export type Op = 'set' | 'add' | 'sub' | 'inc' | 'dec'

export function applyOp(op: Op, operand: number, current: number): number {
  switch (op) {
    case 'set': return round2(operand)
    case 'add': return round2(current + operand)
    case 'sub': return round2(current - operand)
    case 'inc': return round2(current * (1 + operand / 100))
    case 'dec': return round2(current * (1 - operand / 100))
  }
}

// "Igual ao mês anterior": da esquerda para a direita, para propagar em cadeia
// dentro da seleção. A 1ª coluna da grelha (sem mês anterior visível) não muda.
export function planSameAsPrevious(rect: Rect, get: (r: number, c: number) => number): CellValue[] {
  const cells: CellValue[] = []
  for (let r = rect.r1; r <= rect.r2; r++) {
    // Valor do mês anterior à seleção; se a seleção começa na 1ª coluna, o
    // valor dessa célula serve de base e propaga-se às seguintes.
    let base: number | null = rect.c1 > 0 ? get(r, rect.c1 - 1) : null
    for (let c = rect.c1; c <= rect.c2; c++) {
      if (base === null) base = get(r, c)
      else cells.push({ r, c, value: base })
    }
  }
  return cells
}

export function selectionStats(values: number[]): { count: number; sum: number; avg: number } {
  const sum = round2(values.reduce((s, v) => s + v, 0))
  return { count: values.length, sum, avg: values.length ? round2(sum / values.length) : 0 }
}

// Só mantém alterações que mudam mesmo o valor (evita escritas inúteis e
// entradas vazias no histórico de desfazer).
export function onlyChanged(cells: CellValue[], get: (r: number, c: number) => number): CellValue[] {
  const seen = new Map<string, CellValue>()
  for (const cell of cells) seen.set(`${cell.r}:${cell.c}`, cell) // a última ganha
  return [...seen.values()].filter((cell) => Math.abs(get(cell.r, cell.c) - cell.value) > 0.004)
}

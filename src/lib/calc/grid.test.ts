import { describe, expect, it } from 'vitest'
import {
  applyOp, fillDownCells, fillRightCells, onlyChanged, parseClipboard, planFill, planPaste, planSameAsPrevious,
  rectOf, selectionStats, toTSV,
} from './grid'

// grelha 3 linhas x 5 colunas
const data = [
  [100, 200, 0, 0, 0],
  [10, 0, 30, 0, 0],
  [1, 2, 3, 4, 5],
]
const get = (r: number, c: number) => data[r][c]

describe('grelha: seleção e clipboard', () => {
  it('rectOf normaliza qualquer direção', () => {
    expect(rectOf({ r: 2, c: 3 }, { r: 0, c: 1 })).toEqual({ r1: 0, r2: 2, c1: 1, c2: 3 })
  })
  it('copia como TSV com vírgula decimal e vazio para zero', () => {
    expect(toTSV(rectOf({ r: 0, c: 0 }, { r: 1, c: 2 }), (r, c) => [[100.5, 200, 0], [10, 0, 30]][r][c])).toBe('100,5\t200\t\n10\t\t30')
  })
  it('interpreta texto do Excel: vazio = 0, inválido = ignorado', () => {
    expect(parseClipboard('100,5\t1.234,56\t\nabc\t€ 20\n')).toEqual([[100.5, 1234.56, 0], [null, 20]])
  })
  it('colar bloco: corta nos limites e conta ignorados', () => {
    const { cells, ignored } = planPaste(rectOf({ r: 2, c: 3 }, { r: 2, c: 3 }), [[1, null, 3], [4, 5, 6]], 3, 5)
    expect(cells).toEqual([{ r: 2, c: 3, value: 1 }]) // o inválido é ignorado; 2ª linha e coluna 5 caem fora
    expect(ignored).toBe(1)
  })
  it('colar um valor só preenche toda a seleção', () => {
    const { cells } = planPaste(rectOf({ r: 0, c: 1 }, { r: 1, c: 2 }), [[50]], 3, 5)
    expect(cells).toHaveLength(4)
    expect(cells.every((x) => x.value === 50)).toBe(true)
  })
  it('colar valor inválido numa seleção não altera nada', () => {
    expect(planPaste(rectOf({ r: 0, c: 0 }, { r: 1, c: 1 }), [[null]], 3, 5).cells).toEqual([])
  })
})

describe('grelha: preencher e operações', () => {
  it('arrastar a alça para a direita repete o padrão', () => {
    const { cells, extended } = planFill(rectOf({ r: 0, c: 0 }, { r: 0, c: 1 }), { r: 0, c: 4 }, 3, 5, get)
    expect(cells.map((x) => [x.c, x.value])).toEqual([[2, 100], [3, 200], [4, 100]])
    expect(extended.c2).toBe(4)
  })
  it('arrastar para baixo preenche com a linha de cima', () => {
    const { cells } = planFill(rectOf({ r: 0, c: 0 }, { r: 0, c: 1 }), { r: 2, c: 1 }, 3, 5, get)
    expect(cells).toEqual([
      { r: 1, c: 0, value: 100 }, { r: 2, c: 0, value: 100 },
      { r: 1, c: 1, value: 200 }, { r: 2, c: 1, value: 200 },
    ])
  })
  it('Cmd+R e Cmd+D', () => {
    expect(fillRightCells(rectOf({ r: 1, c: 0 }, { r: 1, c: 2 }), get).map((x) => x.value)).toEqual([10, 10])
    expect(fillDownCells(rectOf({ r: 0, c: 0 }, { r: 2, c: 0 }), get).map((x) => x.value)).toEqual([100, 100])
  })
  it('operações em bloco', () => {
    expect(applyOp('set', 5, 99)).toBe(5)
    expect(applyOp('add', 10.5, 100)).toBe(110.5)
    expect(applyOp('sub', 10, 5)).toBe(-5)
    expect(applyOp('inc', 10, 200)).toBe(220)
    expect(applyOp('dec', 25, 200)).toBe(150)
  })
  it('"igual ao mês anterior" propaga em cadeia', () => {
    expect(planSameAsPrevious(rectOf({ r: 1, c: 2 }, { r: 1, c: 4 }), get).map((x) => [x.c, x.value])).toEqual([[2, 0], [3, 0], [4, 0]])
    expect(planSameAsPrevious(rectOf({ r: 0, c: 0 }, { r: 0, c: 2 }), get).map((x) => [x.c, x.value])).toEqual([[1, 100], [2, 100]])
  })
  it('só mantém o que muda de facto e estatísticas', () => {
    expect(onlyChanged([{ r: 0, c: 0, value: 100 }, { r: 0, c: 1, value: 1 }, { r: 0, c: 1, value: 7 }], get)).toEqual([{ r: 0, c: 1, value: 7 }])
    expect(selectionStats([10, 20, 30])).toEqual({ count: 3, sum: 60, avg: 20 })
  })
})

import { describe, expect, it } from 'vitest'
import {
  applyPlannedLink, linkedEntries, plannedOriginalAmount, plannedOptions, revertPlannedLink,
} from './plannedLink'
import type { PlannedLink, PlannedMovement, SavingsMovement } from '../../types'

const pm = (over: Partial<PlannedMovement> = {}): PlannedMovement => ({
  id: 'p1', month: '2026-11', bucketId: 'geral', amount: -250, description: 'Prendas de Natal', ...over,
})

const mv = (id: string, link: PlannedLink): SavingsMovement => ({
  id, date: '2026-11-10', bucketId: 'geral', amount: -50, description: 'x', plannedLink: link,
})

describe('applyPlannedLink', () => {
  it('parte: reduz o previsto e mantém-no aberto', () => {
    const r = applyPlannedLink(pm(), 50, 'part')
    expect(r.planned.amount).toBe(-200)
    expect(r.planned.done).toBe(undefined)
    expect(r.delta).toBe(50)
    expect(r.closed).toBe(false)
    expect(r.clamped).toBe(false)
  })

  it('parte: nunca passa de zero e avisa', () => {
    const r = applyPlannedLink(pm({ amount: -30 }), 50, 'part')
    expect(r.planned.amount).toBe(0)
    expect(r.delta).toBe(30)
    expect(r.clamped).toBe(true)
  })

  it('total: ajusta ao valor real e fecha', () => {
    const r = applyPlannedLink(pm({ description: 'Mochilas', amount: -250 }), 150, 'close')
    expect(r.planned.amount).toBe(-150)
    expect(r.planned.done).toBe(true)
    expect(r.delta).toBe(100)
    expect(r.closed).toBe(true)
  })

  it('total: aceita gastar mais do que o previsto', () => {
    const r = applyPlannedLink(pm({ amount: -100 }), 130, 'close')
    expect(r.planned.amount).toBe(-130)
    expect(r.delta).toBe(-30)
  })

  it('aceita o valor com sinal (saída negativa)', () => {
    expect(applyPlannedLink(pm(), -50, 'part').planned.amount).toBe(-200)
  })
})

describe('revertPlannedLink', () => {
  it('desfaz uma parte', () => {
    const r = applyPlannedLink(pm(), 42.8, 'part')
    const link: PlannedLink = { plannedMovementId: 'p1', effect: 'part', delta: r.delta, closed: r.closed }
    expect(revertPlannedLink(r.planned, link).amount).toBe(-250)
  })

  it('desfaz um fecho e reabre o previsto', () => {
    const r = applyPlannedLink(pm(), 150, 'close')
    const link: PlannedLink = { plannedMovementId: 'p1', effect: 'close', delta: r.delta, closed: r.closed }
    const back = revertPlannedLink(r.planned, link)
    expect(back.amount).toBe(-250)
    expect(back.done).toBe(false)
  })

  it('desfazer uma parte não reabre um previsto fechado à mão', () => {
    const link: PlannedLink = { plannedMovementId: 'p1', effect: 'part', delta: 50, closed: false }
    expect(revertPlannedLink(pm({ amount: -200, done: true }), link).done).toBe(true)
  })
})

describe('valor original e entradas', () => {
  it('o original deriva-se do valor atual e das ligações', () => {
    const a = applyPlannedLink(pm(), 50, 'part') // -200
    const b = applyPlannedLink(a.planned, 60, 'close') // -60, fechado
    const entries = [
      mv('m1', { plannedMovementId: 'p1', effect: 'part', delta: a.delta, closed: false }),
      mv('m2', { plannedMovementId: 'p1', effect: 'close', delta: b.delta, closed: true }),
    ]
    expect(b.planned.amount).toBe(-60)
    expect(plannedOriginalAmount(b.planned, entries)).toBe(-250)
  })

  it('linkedEntries só devolve movimentos ligados a esse previsto, por data', () => {
    const l = (id: string): PlannedLink => ({ plannedMovementId: id, effect: 'part', delta: 10, closed: false })
    const list = [
      { ...mv('a', l('p1')), date: '2026-11-20' },
      { ...mv('b', l('p2')) },
      { ...mv('c', l('p1')), date: '2026-11-05' },
    ]
    expect(linkedEntries(list, 'p1').map((m) => m.id)).toEqual(['c', 'a'])
  })
})

describe('plannedOptions', () => {
  const all = [
    pm({ id: 'nov', month: '2026-11' }),
    pm({ id: 'dez', month: '2026-12' }),
    pm({ id: 'fev', month: '2027-02' }),
    pm({ id: 'out', month: '2026-10' }), // mês passado: fora
    pm({ id: 'feito', month: '2026-11', done: true }),
    pm({ id: 'entrada', month: '2026-11', amount: 100 }),
    pm({ id: 'transf', month: '2026-11', transferGroupId: 't' }),
  ]

  it('mostra deste mês e do seguinte; o resto fica em "mais"', () => {
    const r = plannedOptions(all, '2026-11')
    expect(r.main.map((m) => m.id)).toEqual(['nov', 'dez'])
    expect(r.later.map((m) => m.id)).toEqual(['fev'])
  })

  it('exclui entradas, transferências, feitos e meses passados', () => {
    const ids = [...plannedOptions(all, '2026-11').main, ...plannedOptions(all, '2026-11').later].map((m) => m.id)
    expect(ids.includes('entrada')).toBe(false)
    expect(ids.includes('transf')).toBe(false)
    expect(ids.includes('feito')).toBe(false)
    expect(ids.includes('out')).toBe(false)
  })

  it('mantém o previsto já ligado, mesmo que esteja fechado', () => {
    const r = plannedOptions(all, '2026-11', 'feito')
    expect(r.main.map((m) => m.id).includes('feito')).toBe(true)
  })
})

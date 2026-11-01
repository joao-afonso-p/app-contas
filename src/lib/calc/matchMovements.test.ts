import { describe, expect, it } from 'vitest'
import { findMovementMatches, isLinkableMovement } from './matchMovements'
import type { SavingsMovement } from '../../types'

const mv = (over: Partial<SavingsMovement>): SavingsMovement => ({
  id: 'm1', date: '2026-12-01', bucketId: 'geral', amount: -42.8, description: 'Prenda mãe', ...over,
})

describe('findMovementMatches', () => {
  it('encontra saída com o mesmo valor dentro da janela', () => {
    const r = findMovementMatches({ date: '2026-12-05', amount: 42.8 }, [mv({})])
    expect(r).toHaveLength(1)
    expect(r[0].daysApart).toBe(4)
  })

  it('aceita antes e depois, até 7 dias', () => {
    expect(findMovementMatches({ date: '2026-12-08', amount: 42.8 }, [mv({})])).toHaveLength(1)
    expect(findMovementMatches({ date: '2026-11-24', amount: 42.8 }, [mv({})])).toHaveLength(1)
    expect(findMovementMatches({ date: '2026-12-09', amount: 42.8 }, [mv({})])).toHaveLength(0)
  })

  it('exige o mesmo valor, ao cêntimo', () => {
    expect(findMovementMatches({ date: '2026-12-01', amount: 42.81 }, [mv({})])).toHaveLength(0)
    expect(findMovementMatches({ date: '2026-12-01', amount: 42.8 }, [mv({ amount: -42.8 })])).toHaveLength(1)
  })

  it('ignora entradas, transferências, veículos, resgates e movimentos já ligados', () => {
    const others = [
      mv({ id: 'a', amount: 42.8 }),
      mv({ id: 'b', transferGroupId: 't' }),
      mv({ id: 'c', vehicleId: 'v' }),
      mv({ id: 'd', assetEntryId: 'e' }),
      mv({ id: 'e', transactionId: 'tx' }),
    ]
    expect(findMovementMatches({ date: '2026-12-01', amount: 42.8 }, others)).toHaveLength(0)
    expect(others.every((m) => !isLinkableMovement(m))).toBe(true)
  })

  it('ordena pelo mais próximo e respeita exclusões', () => {
    const list = [mv({ id: 'far', date: '2026-12-06' }), mv({ id: 'near', date: '2026-12-02' })]
    const r = findMovementMatches({ date: '2026-12-01', amount: 42.8 }, list)
    expect(r.map((x) => x.movement.id)).toEqual(['near', 'far'])
    const r2 = findMovementMatches({ date: '2026-12-01', amount: 42.8 }, list, new Set(['near']))
    expect(r2.map((x) => x.movement.id)).toEqual(['far'])
  })
})

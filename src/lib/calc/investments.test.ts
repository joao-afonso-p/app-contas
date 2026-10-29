import { describe, expect, it } from 'vitest'
import { emptyDataSet } from '../../types'
import { monthlyAfterYears, medianMonthlyInjection, projectWithContributions, injectedBreakdown, interpolatedValue, annualizedReturn, buildVehicleSummaries, holdingsSeries, projectValue, valueAt } from './investments'

const base = () => {
  const d = emptyDataSet()
  d.investmentVehicles = [
    { id: 'am', name: 'Amélia', archived: false, order: 0 },
    { id: 'dg', name: 'Degiro', archived: false, order: 1, initialBalance: 500 },
  ]
  d.monthlyPlans = [
    { id: '2026-09', income: {}, expenses: {}, savings: {}, autoInvestments: { am: 100 } },
    { id: '2026-10', income: {}, expenses: {}, savings: {}, autoInvestments: { am: 100 } },
  ] as never
  d.savingsMovements = [{ id: 'm1', date: '2026-10-05', bucketId: 'b', amount: -300, description: '', vehicleId: 'am' }]
  return d
}

describe('investimentos', () => {
  it('veículo sem ativos: investido = plano + movimentos + saldo inicial', () => {
    const s = buildVehicleSummaries(base(), '2026-10', '2026-10-20')
    expect(s.find((x) => x.vehicle.id === 'am')!.contributed).toBe(500)
    expect(s.find((x) => x.vehicle.id === 'dg')!.contributed).toBe(500)
    expect(s.find((x) => x.vehicle.id === 'am')!.gain).toBe(0)
  })
  it('distribuir não muda o total do veículo; sobra fica em saldo livre', () => {
    const d = base()
    d.investmentAssets = [
      { id: 'cp', vehicleId: 'am', name: 'Conta poupança', archived: false, order: 0 },
      { id: 'ca', vehicleId: 'am', name: 'Certificados', archived: false, order: 1 },
    ]
    d.assetEntries = [
      { id: 'e1', date: '2026-10-06', vehicleId: 'am', assetId: 'cp', amount: 300, source: 'distribute' },
      { id: 'e2', date: '2026-10-06', vehicleId: 'am', assetId: 'ca', amount: 100, source: 'distribute' },
    ]
    const am = buildVehicleSummaries(d, '2026-10', '2026-10-20').find((x) => x.vehicle.id === 'am')!
    expect(am.contributed).toBe(500)
    expect(am.undistributed).toBe(100)
    expect(am.holdings.map((h) => [h.name, h.contributed])).toEqual([['Saldo livre', 100], ['Conta poupança', 300], ['Certificados', 100]])
  })
  it('checkpoint: valor = checkpoint + entradas posteriores', () => {
    const flows = [{ date: '2026-01-01', amount: 1000, kind: 'external' as const }, { date: '2026-06-01', amount: 100, kind: 'external' as const }]
    const cps = [{ id: 'c', date: '2026-05-01', vehicleId: 'v', value: 1100 }]
    expect(valueAt(flows, cps, '2026-12-31')).toMatchObject({ contributed: 1100, value: 1200 })
    expect(valueAt(flows, [], '2026-12-31').value).toBe(1100)
  })
  it('rentabilidade anual só com 2 checkpoints afastados', () => {
    const flows = [{ date: '2025-01-01', amount: 1000, kind: 'external' as const }]
    expect(annualizedReturn(flows, [{ id: 'a', date: '2025-01-01', vehicleId: 'v', value: 1000 }])).toBeNull()
    const r = annualizedReturn(flows, [
      { id: 'a', date: '2025-01-01', vehicleId: 'v', value: 1000 },
      { id: 'b', date: '2026-01-01', vehicleId: 'v', value: 1100 },
    ])
    expect(r).toBeCloseTo(10, 0)
  })
  it('série mensal e injetado por veículo', () => {
    const d = base()
    const am = buildVehicleSummaries(d, '2026-10', '2026-10-20')[0]
    const s = holdingsSeries(am.holdings, ['2026-09', '2026-10'])
    expect(s.map((x) => x.contributed)).toEqual([100, 500])
  })
  it('projeção composta', () => {
    expect(projectValue(1000, 3, 2)).toBe(1060.9)
  })
  it('valor: ganho interpolado em linha reta entre checkpoints e constante depois', () => {
    const h = {
      flows: [{ date: '2026-01-01', amount: 1000, kind: 'external' as const }, { date: '2026-03-01', amount: 100, kind: 'external' as const }],
      checkpoints: [
        { id: 'a', date: '2026-01-31', vehicleId: 'v', value: 1000 },
        { id: 'b', date: '2026-05-01', vehicleId: 'v', value: 1300 },
      ],
    }
    expect(interpolatedValue(h, '2026-01-15').value).toBe(1000) // antes do 1.º checkpoint: investido
    expect(interpolatedValue(h, '2026-01-31').value).toBe(1000)
    // ganho em 01/05 = 1300 - 1100 = 200; a meio do caminho: ganho 100 + investido 1100
    const mid = interpolatedValue(h, '2026-03-17')
    expect(mid.contributed).toBe(1100)
    expect(mid.value).toBeGreaterThan(1100)
    expect(mid.value).toBeLessThan(1300)
    expect(interpolatedValue(h, '2026-12-31').value).toBe(1300) // depois do último: ganho constante
  })
  it('injetado: mensal e acumulado, por ativo + saldo livre', () => {
    const d = base()
    d.investmentAssets = [{ id: 'cp', vehicleId: 'am', name: 'CP', archived: false, order: 0 }]
    d.assetEntries = [{ id: 'e1', date: '2026-10-06', vehicleId: 'am', assetId: 'cp', amount: 300, source: 'distribute' }]
    const sm = buildVehicleSummaries(d, '2026-10', '2026-10-20')
    const months = ['2026-09', '2026-10']
    const monthly = injectedBreakdown(sm, months, false).find((v) => v.vehicleId === 'am')!
    expect(monthly.series.map((x) => [x.name, x.perMonth])).toEqual([['Saldo livre', [100, 100]], ['CP', [0, 300]]])
    expect(monthly.perMonth).toEqual([100, 400]) // total do veículo = plano + movimentos
    const cum = injectedBreakdown(sm, months, true).find((v) => v.vehicleId === 'am')!
    expect(cum.perMonth).toEqual([100, 500])
  })
  it('mediana mensal ignora um mês atípico', () => {
    const h = {
      flows: [
        { date: '2026-05-01', amount: 100, kind: 'auto' as const }, { date: '2026-06-01', amount: 100, kind: 'auto' as const },
        { date: '2026-07-01', amount: 100, kind: 'auto' as const }, { date: '2026-08-01', amount: 2000, kind: 'movement' as const },
        { date: '2026-09-01', amount: 100, kind: 'auto' as const }, { date: '2026-10-01', amount: 100, kind: 'auto' as const },
      ],
    } as never
    expect(medianMonthlyInjection(h, '2026-10')).toBe(100)
  })
  it('projeção com entradas mensais', () => {
    expect(projectWithContributions(1000, 0, 1, 100)).toBe(2200)
    const v = projectWithContributions(0, 12, 1, 100)
    expect(v).toBeGreaterThan(1200)
    expect(v).toBeLessThan(1300)
  })
  it('mover do ativo para o saldo livre: total do veículo igual; resgate reduz investido e mostra bruto', () => {
    const d = base()
    d.investmentAssets = [{ id: 'cp', vehicleId: 'am', name: 'CP', archived: false, order: 0 }]
    d.assetEntries = [
      { id: 'e1', date: '2026-10-06', vehicleId: 'am', assetId: 'cp', amount: 500, source: 'distribute' },
      { id: 'e2', date: '2026-10-08', vehicleId: 'am', assetId: 'cp', amount: -200, source: 'distribute' }, // ativo → saldo livre
    ]
    let am = buildVehicleSummaries(d, '2026-10', '2026-10-20').find((x) => x.vehicle.id === 'am')!
    expect(am.holdings.map((h) => [h.name, h.contributed])).toEqual([['Saldo livre', 200], ['CP', 300]])
    expect(am.contributed).toBe(500)
    // resgate externo do saldo livre: sai do veículo
    d.assetEntries.push({ id: 'e3', date: '2026-10-09', vehicleId: 'am', amount: -150, source: 'external' })
    am = buildVehicleSummaries(d, '2026-10', '2026-10-20').find((x) => x.vehicle.id === 'am')!
    expect(am.contributed).toBe(350)
    expect(am.pool.withdrawn).toBe(150)
    expect(am.pool.deposited).toBe(500) // plano 200 + movimento 300 (distribuir não conta como depósito)
  })
  it('aumento anual da entrada: degraus por ano', () => {
    // 2 anos, 100/mês, 0% juros, +10% ao ano → 12×100 + 12×110
    expect(projectWithContributions(0, 0, 2, 100, 10)).toBe(2520)
    expect(projectWithContributions(0, 0, 2, 100, 0)).toBe(2400)
    expect(monthlyAfterYears(100, 10, 2)).toBe(121)
  })
})

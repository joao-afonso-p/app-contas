import { describe, expect, it } from 'vitest'
import type { IncomeSource, SavingsBucket } from '../../types'
import { addMonths, monthDiff, monthRange, parseAmount } from '../format'
import { allocationSummary, cumulativeAutoInvestmentTotals } from './allocation'
import { activeAccountingMonth, computeBalances, goalProgress } from './balances'
import { budgetStatus, computeSpend, matchCategoryByName, monthTotals, parseBankStatement, suggestCategory } from './budgets'
import { computeProjectedBalances, requiredMonthlySaving, syncedProjectionPlans } from './projections'

const bucket = (id: string): SavingsBucket => ({
  id, name: id, kind: 'fixed', archived: false, order: 0,
})

const incomes: IncomeSource[] = [
  { id: 'sal_j', name: 'Salário João', isRent: false, archived: false, order: 0 },
  { id: 'sal_i', name: 'Salário Inês', isRent: false, archived: false, order: 1 },
  { id: 'renda', name: 'Renda Gaia', isRent: true, archived: false, order: 2 },
]

describe('meses', () => {
  it('addMonths atravessa anos', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02')
    expect(addMonths('2026-01', -2)).toBe('2025-11')
  })
  it('monthDiff e monthRange', () => {
    expect(monthDiff('2026-01', '2026-07')).toBe(6)
    expect(monthRange('2026-11', '2027-01')).toEqual(['2026-11', '2026-12', '2027-01'])
  })
  it('parseAmount pt-PT', () => {
    expect(parseAmount('1.234,56')).toBe(1234.56)
    expect(parseAmount('1234.56')).toBe(1234.56)
    expect(parseAmount('-12,5')).toBe(-12.5)
    expect(parseAmount('abc')).toBeNull()
  })
  it('mês contabilístico avança apenas com um plano futuro aplicado', () => {
    expect(activeAccountingMonth([
      { id: '2026-08', closed: false },
    ], '2026-07')).toBe('2026-07')
    expect(activeAccountingMonth([
      { id: '2026-08', closed: true },
    ], '2026-07')).toBe('2026-08')
  })
  it('mês contabilístico trata planos antigos sem closed como aplicados', () => {
    expect(activeAccountingMonth([
      { id: '2026-08' },
    ], '2026-07')).toBe('2026-08')
  })
})

describe('allocationSummary', () => {
  const plan = {
    id: '2026-07',
    income: { sal_j: 2000, sal_i: 1800, renda: 700 },
    expenses: { casa: 900, energia: 100 },
    savings: { geral: 1500, viajar: 2000 },
  }
  it('calcula totais e alocação', () => {
    const s = allocationSummary(plan, incomes)
    expect(s.totalIncome).toBe(4500)
    expect(s.totalAllocated).toBe(4500)
    expect(s.unallocated).toBe(0)
    expect(s.allocationPct).toBe(100)
  })
  it('deixar na conta = despesas; transferir = poupanças - rendas', () => {
    const s = allocationSummary(plan, incomes)
    expect(s.leaveInCurrent).toBe(1000)
    expect(s.rentIncome).toBe(700)
    expect(s.transferToSavings).toBe(3500 - 700)
  })
  it('mostra falta por alocar', () => {
    const s = allocationSummary({ ...plan, savings: { geral: 1000 } }, incomes)
    expect(s.unallocated).toBe(2500)
  })
  it('débitos automáticos contam para a alocação mas não para transferir', () => {
    const s = allocationSummary({ ...plan, autoInvestments: { ppr: 200 } }, incomes)
    expect(s.totalAutoInvestments).toBe(200)
    expect(s.totalAllocated).toBe(4700)
    expect(s.unallocated).toBe(-200)
    expect(s.transferToSavings).toBe(3500 - 700)
  })
  it('acumula débitos automáticos aplicados até ao mês contabilístico', () => {
    const totals = cumulativeAutoInvestmentTotals([
      { id: '2026-06', autoInvestments: { ppr: 100 } },
      { id: '2026-07', autoInvestments: { ppr: 150 }, closed: true },
      { id: '2026-08', autoInvestments: { ppr: 200, etf: 50 }, closed: true },
      { id: '2026-09', autoInvestments: { ppr: 999 }, closed: false },
    ], '2026-08')
    expect(totals.get('ppr')).toBe(450)
    expect(totals.get('etf')).toBe(50)
  })
})

describe('computeBalances', () => {
  const buckets = [bucket('geral'), bucket('viajar')]
  it('só reflete a poupança do mês seguinte depois de o plano ser aplicado', () => {
    const balanceFor = (closed: boolean) => computeBalances({
      buckets: [bucket('geral')],
      plans: [
        { id: '2026-07', savings: { geral: 100 }, closed: true },
        { id: '2026-08', savings: { geral: 250 }, closed },
      ],
      movements: [],
      from: '2026-07',
      to: '2026-08',
    }).get('geral')?.get('2026-08')

    expect(balanceFor(false)).toBe(100)
    expect(balanceFor(true)).toBe(350)
  })
  it('acumula planeamento + movimentos', () => {
    const table = computeBalances({
      buckets,
      plans: [
        { id: '2026-01', savings: { geral: 100, viajar: 50 } },
        { id: '2026-02', savings: { geral: 100 } },
      ],
      movements: [
        { id: 'm1', date: '2026-02-10', bucketId: 'geral', amount: -30, description: 'gasto' },
        { id: 'm2', date: '2026-03-05', bucketId: 'viajar', amount: 200, description: 'prémio' },
      ],
      from: '2026-01',
      to: '2026-03',
    })
    expect(table.get('geral')?.get('2026-01')).toBe(100)
    expect(table.get('geral')?.get('2026-02')).toBe(170)
    expect(table.get('geral')?.get('2026-03')).toBe(170)
    expect(table.get('viajar')?.get('2026-03')).toBe(250)
  })
  it('override fixa o saldo e continua a partir daí', () => {
    const table = computeBalances({
      buckets: [bucket('geral')],
      plans: [
        { id: '2026-01', savings: { geral: 100 } },
        { id: '2026-02', savings: { geral: 100 } },
        { id: '2026-03', savings: { geral: 100 } },
      ],
      movements: [],
      overrides: [{ id: 'o1', month: '2026-02', bucketId: 'geral', balance: 500 }],
      from: '2026-01',
      to: '2026-03',
    })
    expect(table.get('geral')?.get('2026-01')).toBe(100)
    expect(table.get('geral')?.get('2026-02')).toBe(600)
    expect(table.get('geral')?.get('2026-03')).toBe(700)
  })
  it('override não esconde movimentos do mesmo mês', () => {
    const table = computeBalances({
      buckets: [bucket('geral')],
      plans: [],
      movements: [{ id: 'm1', date: '2026-02-20', bucketId: 'geral', amount: -50, description: 'gasto' }],
      overrides: [{ id: 'o1', month: '2026-02', bucketId: 'geral', balance: 500 }],
      from: '2026-01',
      to: '2026-02',
    })
    expect(table.get('geral')?.get('2026-02')).toBe(450)
  })
})

describe('objetivos e projeções', () => {
  it('goalProgress', () => {
    expect(goalProgress(3000, 6000)).toBe(50)
    expect(goalProgress(9000, 6000)).toBe(100)
  })
  it('requiredMonthlySaving', () => {
    expect(requiredMonthlySaving(1000, 3000, '2026-07', '2027-04')).toBeCloseTo(222.22, 1)
    expect(requiredMonthlySaving(4000, 3000, '2026-07', '2027-04')).toBe(0)
    expect(requiredMonthlySaving(0, 3000, '2027-04', '2027-04')).toBeNull()
  })

  const basePlan = { income: { sal: 2000 }, expenses: { casa: 900 }, savings: { geral: 500 } }

  it('syncedProjectionPlans: sem projeções ainda, gera o horizonte todo a partir do mês-base', () => {
    const plans = syncedProjectionPlans({
      baseMonth: '2026-07',
      basePlan,
      projectionsInitialized: false,
      horizon: 4,
    })
    expect(plans.map((p) => p.id)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10'])
    expect(plans.every((p) => p.income.sal === 2000 && p.expenses.casa === 900 && p.savings.geral === 500)).toBe(true)
  })

  it('syncedProjectionPlans: já inicializado, só realinha o mês-base', () => {
    const plans = syncedProjectionPlans({
      baseMonth: '2026-07',
      basePlan,
      projectionsInitialized: true,
      horizon: 4,
    })
    expect(plans).toHaveLength(1)
    expect(plans[0]).toMatchObject({ id: '2026-07', income: { sal: 2000 }, expenses: { casa: 900 }, savings: { geral: 500 } })
  })

  it('mantém o saldo real do mês-base apesar de movimentos previstos antigos', () => {
    const balances = computeProjectedBalances({
      buckets: [
        bucket('emergencia'), bucket('investir'), bucket('casa'), bucket('rendas'), bucket('viajar'),
        bucket('geral'), bucket('pais_ines'), bucket('pais_joao'), bucket('ar_condicionado'),
      ],
      realPlans: [{
        id: '2026-08',
        savings: {
          emergencia: 600,
          investir: 200,
          casa: 0,
          rendas: 300,
          viajar: 0,
          geral: 2475,
          pais_ines: 5150,
          pais_joao: 5000,
          ar_condicionado: 100,
        },
        closed: true,
      }],
      realMovements: [],
      projectionPlans: [],
      plannedMovements: [
        { id: 'antigo', month: '2026-08', bucketId: 'geral', amount: -2860, description: 'previsto antigo' },
      ],
      overrides: [],
      baseMonth: '2026-08',
      from: '2026-08',
      to: '2026-08',
    })

    expect(balances.get('geral')?.get('2026-08')).toBe(2475)
    expect([...balances.values()].reduce((total, row) => total + (row.get('2026-08') ?? 0), 0)).toBe(13825)
  })

  it('aplica movimentos previstos apenas depois do mês-base', () => {
    const balances = computeProjectedBalances({
      buckets: [bucket('geral')],
      realPlans: [{ id: '2026-08', savings: { geral: 2475 }, closed: true }],
      realMovements: [],
      projectionPlans: [{ id: '2026-09', income: {}, expenses: {}, savings: {} }],
      plannedMovements: [
        { id: 'futuro', month: '2026-09', bucketId: 'geral', amount: -2860, description: 'previsto futuro' },
      ],
      overrides: [],
      baseMonth: '2026-08',
      from: '2026-08',
      to: '2026-09',
    })

    expect(balances.get('geral')?.get('2026-08')).toBe(2475)
    expect(balances.get('geral')?.get('2026-09')).toBe(-385)
  })

  it('parte do plano seguinte quando este já foi aplicado antecipadamente', () => {
    const realPlans = [
      { id: '2026-07', savings: { geral: -385 }, closed: true },
      { id: '2026-08', savings: { geral: 2860 }, closed: true },
      { id: '2026-09', savings: { geral: 9999 }, closed: false },
    ]
    const baseMonth = activeAccountingMonth(realPlans, '2026-07')
    const overview = computeBalances({
      buckets: [bucket('geral')],
      plans: realPlans,
      movements: [],
      from: '2026-07',
      to: baseMonth,
    })
    const projections = computeProjectedBalances({
      buckets: [bucket('geral')],
      realPlans,
      realMovements: [],
      projectionPlans: [{ id: '2026-09', income: {}, expenses: {}, savings: { geral: 100 } }],
      plannedMovements: [],
      overrides: [],
      baseMonth,
      from: '2026-07',
      to: '2026-09',
    })

    expect(baseMonth).toBe('2026-08')
    expect(projections.get('geral')?.get(baseMonth)).toBe(overview.get('geral')?.get(baseMonth))
    expect(projections.get('geral')?.get('2026-08')).toBe(2475)
    expect(projections.get('geral')?.get('2026-09')).toBe(2575)
  })
})

describe('gastos e budgets', () => {
  const txs = [
    { id: '1', date: '2026-06-03', categoryId: 'rest', amount: 40, description: 'a', repoePoupanca: false, reposto: false },
    { id: '2', date: '2026-06-20', categoryId: 'rest', amount: 70, description: 'b', repoePoupanca: false, reposto: false },
    { id: '3', date: '2026-06-21', categoryId: 'saude', amount: 120, description: 'c', repoePoupanca: true, fonteBucketId: 'geral', reposto: true },
    { id: '4', date: '2026-06-22', categoryId: 'casaCat', amount: 50, description: 'd', repoePoupanca: false, reposto: false },
  ]
  it('computeSpend agrega por categoria/mês', () => {
    const spend = computeSpend(txs)
    expect(spend.get('rest')?.get('2026-06')).toBe(110)
    expect(spend.get('saude')?.get('2026-06')).toBe(120)
  })
  it('monthTotals: total, sem repostos, e sem repostos+casa', () => {
    const totals = monthTotals(txs, 'casaCat').get('2026-06')!
    expect(totals.total).toBe(280) // tudo
    expect(totals.semReposto).toBe(160) // exclui o reposto (120)
    expect(totals.semRepostoSemCasa).toBe(110) // exclui reposto (120) e casa (50)
  })
  it('budgetStatus com limiar de aviso a 80%', () => {
    expect(budgetStatus(50, 100)).toBe('ok')
    expect(budgetStatus(85, 100)).toBe('warn')
    expect(budgetStatus(110, 100)).toBe('over')
  })
  it('suggestCategory usa keyword mais específica', () => {
    const rules = [
      { id: 'r1', keyword: 'continente', categoryId: 'super' },
      { id: 'r2', keyword: 'continente bom dia', categoryId: 'conveniencia' },
    ]
    expect(suggestCategory('COMPRA CONTINENTE BOM DIA PORTO', rules)).toBe('conveniencia')
    expect(suggestCategory('COMPRA CONTINENTE GAIA', rules)).toBe('super')
    expect(suggestCategory('outra coisa', rules)).toBeUndefined()
  })
  it('parseBankStatement lê o formato de 5 campos data;nome;categoria;valor;descrição', () => {
    const rows = parseBankStatement(
      '02/06/2026;Compras;Alimentação;-45,30;COMPRA CONTINENTE\n' +
      '2026-06-05\tRefeição\t\t-22,00\tMBWAY RESTAURANTE\n' +
      '08/06/2026;Salário;Rendimento;1.500,00;ORDENADO\n' +
      'lixo sem data;a;b;c\n',
    )
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      date: '2026-06-02', nome: 'Compras', categoriaText: 'Alimentação', description: 'COMPRA CONTINENTE', amount: 45.3,
    })
    expect(rows[1].amount).toBe(22)
    expect(rows[1].nome).toBe('Refeição')
    expect(rows[1].categoriaText).toBe('')
  })
  it('parseBankStatement preserva ; extra dentro da descrição', () => {
    const rows = parseBankStatement('2026-06-10;Compras;Alimentação;-10,00;LOJA; SECCAO BIS\n')
    expect(rows[0].description).toBe('LOJA; SECCAO BIS')
  })
  it('matchCategoryByName encontra categoria exata ignorando acentos/maiúsculas', () => {
    const categories = [
      { id: 'c1', name: 'Alimentação', archived: false, order: 0 },
      { id: 'c2', name: 'Saúde', archived: false, order: 1 },
    ]
    expect(matchCategoryByName('ALIMENTACAO', categories)).toBe('c1')
    expect(matchCategoryByName('saude', categories)).toBe('c2')
    expect(matchCategoryByName('Lazer', categories)).toBeUndefined()
  })
})

import { describe, expect, it } from 'vitest'
import {
  EMPTY_MONTH_START, earliestApplyDate, financialMonthOf, monthProgress, monthStartDate, startDayFor,
  type MonthStartConfig,
} from './financialMonth'

const cfg28: MonthStartConfig = { rules: [{ from: '2026-11', day: 28 }], overrides: {} }

describe('mês financeiro', () => {
  it('por defeito é igual ao mês de calendário', () => {
    expect(financialMonthOf(EMPTY_MONTH_START, '2026-10-31')).toBe('2026-10')
    expect(financialMonthOf(EMPTY_MONTH_START, '2026-11-01')).toBe('2026-11')
    expect(monthStartDate(EMPTY_MONTH_START, '2026-11')).toBe('2026-11-01')
  })

  it('início a 28: novembro começa a 28 de outubro; meses anteriores não mudam', () => {
    expect(monthStartDate(cfg28, '2026-11')).toBe('2026-10-28')
    expect(financialMonthOf(cfg28, '2026-10-27')).toBe('2026-10')
    expect(financialMonthOf(cfg28, '2026-10-28')).toBe('2026-11')
    expect(financialMonthOf(cfg28, '2026-11-27')).toBe('2026-11')
    expect(financialMonthOf(cfg28, '2026-11-28')).toBe('2026-12')
    // meses antes da regra: dia 1
    expect(financialMonthOf(cfg28, '2026-09-30')).toBe('2026-09')
    expect(startDayFor(cfg28, '2026-10')).toBe(1)
  })

  it('dia 31 num mês curto usa o último dia', () => {
    const cfg: MonthStartConfig = { rules: [{ from: '2027-01', day: 31 }], overrides: {} }
    expect(monthStartDate(cfg, '2027-03')).toBe('2027-02-28') // fev 2027 tem 28
    expect(monthStartDate(cfg, '2028-03')).toBe('2028-02-29') // bissexto
  })

  it('dias 1–15 contam do próprio mês', () => {
    const cfg: MonthStartConfig = { rules: [{ from: '2026-11', day: 5 }], overrides: {} }
    expect(monthStartDate(cfg, '2026-11')).toBe('2026-11-05')
    expect(financialMonthOf(cfg, '2026-11-04')).toBe('2026-10')
    expect(financialMonthOf(cfg, '2026-11-05')).toBe('2026-11')
  })

  it('override por mês ganha ao default; o mês seguinte volta ao default', () => {
    const cfg: MonthStartConfig = { rules: [{ from: '2026-11', day: 28 }], overrides: { '2026-11': 27 } }
    expect(monthStartDate(cfg, '2026-11')).toBe('2026-10-27')
    expect(monthStartDate(cfg, '2026-12')).toBe('2026-11-28')
  })

  it('histórico de defaults: mudar mais tarde não mexe em meses anteriores', () => {
    const cfg: MonthStartConfig = { rules: [{ from: '2026-11', day: 28 }, { from: '2027-02', day: 25 }], overrides: {} }
    expect(startDayFor(cfg, '2027-01')).toBe(28)
    expect(startDayFor(cfg, '2027-02')).toBe(25)
  })

  it('aplicar plano: nunca depois do dia 25 do mês anterior', () => {
    expect(earliestApplyDate(EMPTY_MONTH_START, '2026-11')).toBe('2026-10-25')
    expect(earliestApplyDate(cfg28, '2026-11')).toBe('2026-10-25')
    const cfg22: MonthStartConfig = { rules: [{ from: '2026-11', day: 22 }], overrides: {} }
    expect(earliestApplyDate(cfg22, '2026-11')).toBe('2026-10-19')
  })

  it('progresso do mês financeiro', () => {
    expect(monthProgress(cfg28, '2026-11', '2026-10-28')).toBeCloseTo(1 / 31, 5)
    expect(monthProgress(cfg28, '2026-11', '2026-11-27')).toBe(1)
  })
})

import { describe, expect, it } from 'vitest'
import { MENU_DEFAULT, isOptionalMenu, menuVisible } from './menus'
import type { AppMeta } from '../types'

const meta = (menus?: AppMeta['menus']): AppMeta => ({ id: 'meta', menus })

describe('menuVisible', () => {
  it('sem definição usa os defaults: Investimento e Guia sim, Imóveis não', () => {
    expect(menuVisible(undefined, 'investimentos')).toBe(true)
    expect(menuVisible(meta(), 'guia')).toBe(true)
    expect(menuVisible(meta(), 'imoveis')).toBe(false)
    expect(MENU_DEFAULT.imoveis).toBe(false)
  })

  it('o que a pessoa escolher manda', () => {
    expect(menuVisible(meta({ investimentos: false }), 'investimentos')).toBe(false)
    expect(menuVisible(meta({ imoveis: true }), 'imoveis')).toBe(true)
    expect(menuVisible(meta({ investimentos: false }), 'guia')).toBe(true)
  })

  it('isOptionalMenu só aceita os três menus opcionais', () => {
    expect(isOptionalMenu('imoveis')).toBe(true)
    expect(isOptionalMenu('gastos')).toBe(false)
  })
})

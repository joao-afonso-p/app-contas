import type { AppMeta } from '../types'

// Menus que a pessoa pode esconder em Definições → Menus visíveis. Esconder só
// tira o item do menu: os dados ficam intactos e os atalhos dentro da app continuam a funcionar.
export type OptionalMenu = 'investimentos' | 'guia' | 'imoveis'

export const OPTIONAL_MENUS: readonly OptionalMenu[] = ['investimentos', 'guia', 'imoveis']

// Investimento e Guia aparecem por defeito; Imóveis só quem o ligar.
export const MENU_DEFAULT: Record<OptionalMenu, boolean> = {
  investimentos: true,
  guia: true,
  imoveis: false,
}

export const MENU_LABEL: Record<OptionalMenu, string> = {
  investimentos: 'Investimento',
  guia: 'Guia',
  imoveis: 'Imóveis',
}

export const isOptionalMenu = (id: string): id is OptionalMenu => (OPTIONAL_MENUS as readonly string[]).includes(id)

export function menuVisible(meta: AppMeta | undefined, id: OptionalMenu): boolean {
  return meta?.menus?.[id] ?? MENU_DEFAULT[id]
}

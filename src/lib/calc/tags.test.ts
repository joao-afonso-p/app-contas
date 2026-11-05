import { describe, expect, it } from 'vitest'
import { addTags, allTags, matchesAnyTag, normalizeTag, removeTags, tagKey } from './tags'

describe('tags', () => {
  it('normaliza espaços e o # inicial', () => {
    expect(normalizeTag('  #Férias   2026 ')).toBe('Férias 2026')
  })

  it('ignora maiúsculas e acentos na comparação', () => {
    expect(tagKey('Férias')).toBe(tagKey('ferias'))
  })

  it('addTags não repete e mantém a primeira grafia', () => {
    expect(addTags(['Férias'], ['ferias', 'Casa', ' casa ', ''])).toEqual(['Férias', 'Casa'])
    expect(addTags(undefined, ['a'])).toEqual(['a'])
  })

  it('removeTags tira por chave', () => {
    expect(removeTags(['Férias', 'Casa'], ['ferias'])).toEqual(['Casa'])
    expect(removeTags(undefined, ['x'])).toEqual([])
  })

  it('allTags conta e ordena', () => {
    const r = allTags([{ tags: ['Casa', 'Férias'] }, { tags: ['ferias'] }, {}])
    expect(r).toEqual([{ tag: 'Férias', count: 2 }, { tag: 'Casa', count: 1 }])
  })

  it('filtro: qualquer uma das tags; vazio passa tudo', () => {
    expect(matchesAnyTag({ tags: ['Casa'] }, [])).toBe(true)
    expect(matchesAnyTag({ tags: ['Casa'] }, ['casa', 'x'])).toBe(true)
    expect(matchesAnyTag({ tags: ['Casa'] }, ['x'])).toBe(false)
    expect(matchesAnyTag({}, ['x'])).toBe(false)
  })
})

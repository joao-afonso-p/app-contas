import { useCallback, useState } from 'react'

// useState que sobrevive a trocar de ecrã (o componente desmonta) durante a
// sessão. Não persiste entre refreshes. Usado para filtros e mês escolhido.
const memory = new Map<string, unknown>()

export function useSessionState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => (memory.has(key) ? (memory.get(key) as T) : initial))
  const set = useCallback(
    (v: T) => {
      memory.set(key, v)
      setValue(v)
    },
    [key],
  )
  return [value, set]
}

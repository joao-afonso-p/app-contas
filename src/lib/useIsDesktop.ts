import { useEffect, useState } from 'react'

// Igual ao breakpoint `md` do Tailwind (768px): abaixo disto é "telemóvel".
const QUERY = '(min-width: 768px)'

export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => (typeof window === 'undefined' ? true : window.matchMedia(QUERY).matches))
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = () => setDesktop(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return desktop
}

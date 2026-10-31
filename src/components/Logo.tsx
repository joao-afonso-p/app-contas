// Marca da app: um fio com três missangas ("contas"). As cores seguem o tema
// (claro/escuro) através das variáveis --bead-1..3 definidas em index.css.
export function LogoMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 120 60"
      width={size}
      height={size / 2}
      className={className}
      role="img"
      aria-label="Contas"
    >
      <line x1="4" y1="30" x2="116" y2="30" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="26" cy="30" r="19" style={{ fill: 'var(--bead-1)' }} />
      <circle cx="62" cy="30" r="14" style={{ fill: 'var(--bead-2)' }} />
      <circle cx="92" cy="30" r="10" style={{ fill: 'var(--bead-3)' }} />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`font-display font-medium leading-none tracking-tight ${className ?? ''}`}>Contas</span>
  )
}

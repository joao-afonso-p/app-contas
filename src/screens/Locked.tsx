import { BookOpen, Lock } from 'lucide-react'
import { Button, Card } from '../components/ui'
import { fmtDate, todayISO } from '../lib/format'
import { featureStatus, FEATURE_LABEL, type LockedFeature } from '../lib/unlock'
import { useStore } from '../store/useStore'

const WHY: Record<LockedFeature, string> = {
  investimentos:
    'Antes de acompanhares investimentos, convém ter o planeamento e os gastos a funcionar. Passado cerca de um mês de uso já tens saldos reais para acompanhar.',
  budgets:
    'O Analytics compara o plano com o real, por categoria e por mês. Precisa de uns dois meses de gastos importados para os avisos fazerem sentido.',
  projecoes:
    'As projeções partem do plano atual. Com cerca de três meses de uso, o teu plano já foi ajustado à realidade e a projeção fica fiável.',
}

const MEANWHILE = [
  'Planeia o mês em Planeamento e aplica o plano.',
  'Importa o extrato do banco em Gastos e dá categoria a cada gasto.',
  'Regista movimentos entre baldes em Movimentos.',
]

// Mostrado no lugar de um ecrã que ainda não abriu (desbloqueio progressivo).
export function LockedScreen({ feature }: { feature: LockedFeature }) {
  const meta = useStore((s) => s.data.meta[0])
  const setMeta = useStore((s) => s.setMeta)
  const setScreen = useStore((s) => s.setScreen)

  const status = featureStatus(meta, feature, todayISO())
  const label = FEATURE_LABEL[feature]
  const days = status.daysLeft

  const unlockNow = () => {
    const ok = window.confirm(
      `Desbloquear ${label} já? Podes, mas esta parte é mais útil com algum histórico de uso.`,
    )
    if (!ok) return
    void setMeta({ unlockedFeatures: [...(meta?.unlockedFeatures ?? []), feature] })
  }

  return (
    <div className="fade-up mx-auto flex max-w-xl flex-col gap-4 py-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-muted">
          <Lock size={26} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <h1 className="text-2xl">{label} ainda está fechado</h1>
        <p className="text-sm text-muted">
          {status.unlockDate
            ? `Abre sozinho daqui a ${days} ${days === 1 ? 'dia' : 'dias'}, a ${fmtDate(status.unlockDate)}.`
            : 'Ainda não está disponível.'}
        </p>
      </div>

      <Card className="flex flex-col gap-2 text-sm leading-relaxed text-muted">
        <div className="font-semibold text-text">Porquê esperar?</div>
        <p>{WHY[feature]}</p>
      </Card>

      <Card className="flex flex-col gap-2 text-sm leading-relaxed text-muted">
        <div className="font-semibold text-text">Entretanto</div>
        <ul className="flex flex-col gap-1.5">
          {MEANWHILE.map((t) => (
            <li key={t} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
              {t}
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={unlockNow}>Desbloquear já</Button>
        <Button variant="ghost" onClick={() => setScreen('guia')}>
          <BookOpen size={16} strokeWidth={1.75} aria-hidden="true" />
          Ver o guia
        </Button>
      </div>
      <p className="text-center text-xs text-muted">
        Não queres bloqueios? Desativa-os em Definições → Primeiros passos.
      </p>
    </div>
  )
}

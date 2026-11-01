import { Sparkles, X } from 'lucide-react'
import { Button, Card } from './ui'
import { todayISO } from '../lib/format'
import { FEATURE_LABEL, pendingUnlockNotices, type LockedFeature } from '../lib/unlock'
import { useStore, type Screen } from '../store/useStore'

const BLURB: Record<LockedFeature, string> = {
  investimentos: 'Acompanha o total investido, os ganhos e a taxa anual de cada veículo.',
  budgets: 'Compara o plano com o real por categoria e recebe avisos quando algo foge ao ritmo.',
  projecoes: 'Vê como ficam os teus baldes nos próximos meses e acrescenta o que já sabes que vai acontecer.',
}

// No Overview: avisa uma vez quando uma parte bloqueada abre por tempo.
export function UnlockNotices() {
  const meta = useStore((s) => s.data.meta[0])
  const setMeta = useStore((s) => s.setMeta)
  const setScreen = useStore((s) => s.setScreen)

  const pending = pendingUnlockNotices(meta, todayISO())
  if (pending.length === 0) return null

  const markSeen = (f: LockedFeature) =>
    void setMeta({ unlockNoticesSeen: [...(meta?.unlockNoticesSeen ?? []), f] })

  return (
    <div className="flex flex-col gap-3">
      {pending.map((f) => (
        <Card key={f} className="flex items-start gap-3 border-accent/40 bg-accent-soft/60">
          <Sparkles size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-accent-strong" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Já podes usar {FEATURE_LABEL[f]}</div>
            <p className="mt-0.5 text-sm text-muted">{BLURB[f]}</p>
            <div className="mt-2">
              <Button
                size="sm"
                onClick={() => {
                  markSeen(f)
                  setScreen(f as Screen)
                }}
              >
                Abrir {FEATURE_LABEL[f]}
              </Button>
            </div>
          </div>
          <button
            onClick={() => markSeen(f)}
            aria-label="Fechar aviso"
            className="rounded-lg p-1 text-muted hover:bg-surface-2"
          >
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </Card>
      ))}
    </div>
  )
}

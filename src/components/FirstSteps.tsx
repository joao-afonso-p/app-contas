import { Lock, Unlock } from 'lucide-react'
import { Button, Card, SectionTitle } from './ui'
import { fmtDate, todayISO } from '../lib/format'
import { resetSeenTours, useCoach } from '../lib/coach'
import { featureStatus, FEATURE_LABEL, LOCKED_FEATURES } from '../lib/unlock'
import { useStore } from '../store/useStore'

// Definições → Primeiros passos: desbloqueio progressivo e visitas guiadas.
export function FirstStepsSection() {
  const meta = useStore((s) => s.data.meta[0])
  const setMeta = useStore((s) => s.setMeta)
  const setScreen = useStore((s) => s.setScreen)
  const startTour = useCoach((s) => s.start)

  const today = todayISO()
  const isNewAccount = Boolean(meta?.onboardedAt)
  const active = isNewAccount && meta?.progressiveUnlock !== false

  const unlock = (f: string) => void setMeta({ unlockedFeatures: [...(meta?.unlockedFeatures ?? []), f] })
  const unlockAll = () => void setMeta({ unlockedFeatures: [...LOCKED_FEATURES] })

  return (
    <section>
      <SectionTitle>Primeiros passos</SectionTitle>
      <Card className="flex flex-col gap-4">
        <div>
          <div className="text-sm font-semibold">Desbloqueio progressivo</div>
          <p className="mt-0.5 text-sm text-muted">
            Numa conta nova, Investimento, Analytics e Projeções abrem aos poucos (ao fim de cerca de 1, 2 e 3 meses),
            para te habituares primeiro ao essencial.
          </p>

          {isNewAccount ? (
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={meta?.progressiveUnlock !== false}
                onChange={(e) => void setMeta({ progressiveUnlock: e.target.checked })}
                className="h-4 w-4 accent-[var(--accent-strong)]"
              />
              Usar o desbloqueio progressivo
            </label>
          ) : (
            <p className="mt-2 text-sm text-muted">Esta conta já tem tudo desbloqueado.</p>
          )}

          {active && (
            <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
              {LOCKED_FEATURES.map((f) => {
                const st = featureStatus(meta, f, today)
                return (
                  <li key={f} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      {st.locked ? (
                        <Lock size={15} strokeWidth={1.75} className="text-muted" aria-hidden="true" />
                      ) : (
                        <Unlock size={15} strokeWidth={1.75} className="text-positive" aria-hidden="true" />
                      )}
                      <span className="font-medium">{FEATURE_LABEL[f]}</span>
                      <span className="text-xs text-muted">
                        {st.locked && st.unlockDate ? `abre a ${fmtDate(st.unlockDate)}` : 'aberto'}
                      </span>
                    </span>
                    {st.locked && (
                      <Button size="sm" variant="ghost" onClick={() => unlock(f)}>Desbloquear</Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {active && LOCKED_FEATURES.some((f) => featureStatus(meta, f, today).locked) && (
            <div className="mt-2">
              <Button size="sm" variant="soft" onClick={unlockAll}>Desbloquear tudo agora</Button>
            </div>
          )}
        </div>

        <div className="border-t border-border pt-4">
          <div className="text-sm font-semibold">Visitas guiadas</div>
          <p className="mt-0.5 text-sm text-muted">
            A visita inicial mostra onde está cada coisa. Cada parte nova também oferece uma visita curta da primeira vez.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="soft" onClick={() => { setScreen('overview'); startTour('inicio') }}>
              Rever a visita inicial
            </Button>
            <Button size="sm" variant="ghost" onClick={resetSeenTours}>
              Voltar a sugerir as visitas
            </Button>
          </div>
        </div>
      </Card>
    </section>
  )
}

import { useEffect, useState, type ReactNode } from 'react'
import { Button, Card, Modal, SectionTitle, cx } from './ui'
import { trackEvent } from '../lib/analytics'
import { useInstallPrompt } from '../lib/installPrompt'
import { hasAppliedPlan, loadNudgeState, saveNudgeState, shouldShowNudge, snoozeNudge, type NudgeState } from '../lib/installNudge'
import { detectIosNonSafari, detectMac, detectPlatform, isStandalone, type Platform } from '../lib/platform'
import { useStore } from '../store/useStore'

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="inline h-4 w-4 align-text-bottom" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Partilhar">
      <path d="M12 15V3M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  )
}

function MenuDotsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="inline h-4 w-4 align-text-bottom" fill="currentColor" aria-label="Menu">
      <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
    </svg>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-xs font-semibold">{children}</kbd>
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-1.5 pl-5 text-sm">{children}</ol>
}

function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <div className={cx('rounded-xl p-3 text-xs leading-relaxed', tone === 'warn' ? 'bg-warn-soft text-text' : 'bg-surface-2 text-muted')}>
      {children}
    </div>
  )
}

const TABS: { id: Platform; label: string }[] = [
  { id: 'ios', label: 'iPhone' },
  { id: 'android', label: 'Android' },
  { id: 'desktop', label: 'Computador' },
]

export function InstallGuideContent({ compact, initialPlatform }: { compact?: boolean; initialPlatform?: Platform }) {
  const detected = detectPlatform()
  const [tab, setTab] = useState<Platform>(initialPlatform ?? detected)
  const mode = useStore((s) => s.mode)
  const { canPrompt, promptInstall } = useInstallPrompt()
  const mac = detectMac()
  const iosOther = detectIosNonSafari()
  const standalone = isStandalone()
  // Só é montado dentro de um Modal — montar = o utilizador abriu o guia.
  useEffect(() => trackEvent('install-guide-open'), [])

  const showStorageNote = tab === 'ios' && mode === 'local' && detected === 'ios' && !standalone

  return (
    <div className="flex flex-col gap-3">
      {!compact && (
        <p className="text-sm text-muted">
          A app funciona no telemóvel e no computador. Recomendamos usar as duas: o telemóvel para o dia a dia
          (registar gastos, ver o essencial) e o computador para planear (Budgets, Projeções e tudo o resto).
        </p>
      )}

      <div role="tablist" className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              'rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors',
              tab === t.id ? 'bg-surface text-accent-strong shadow-sm' : 'text-muted',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {showStorageNote && (
        <Note tone="warn">
          <strong>Importante:</strong> instala primeiro e usa sempre a app do ecrã principal — os dados guardados
          no Safari não passam para a app instalada. Se já tens dados aqui, exporta uma cópia de segurança em
          Definições → Dados e importa-a na app instalada.
        </Note>
      )}

      {tab === 'ios' && (
        <>
          <Steps>
            <li>Abre esta página no <strong>Safari</strong>.</li>
            <li>Toca no botão Partilhar <ShareIcon /> (quadrado com uma seta; fica na barra de baixo no iPhone e no topo no iPad).</li>
            <li>Desliza para baixo na lista e escolhe <strong>«Adicionar ao ecrã principal»</strong>.</li>
            <li>Toca em <strong>«Adicionar»</strong>. O ícone aparece no ecrã principal.</li>
          </Steps>
          <Note>
            {iosOther ? 'Estás a usar outro browser. ' : ''}No Chrome, Firefox ou Edge para iOS (16.4 ou superior) o botão
            Partilhar <ShareIcon /> está na barra de endereço; o resto é igual. Em caso de dúvida, usa o Safari.
          </Note>
          <Note>
            No iPhone, a app do ecrã principal tem um armazenamento separado do Safari, e o Safari pode apagar os
            dados de sites que não abres há cerca de 7 dias. Usar a app instalada protege os teus dados.
          </Note>
        </>
      )}

      {tab === 'android' && (
        <>
          {canPrompt && (
            <Button onClick={() => void promptInstall()} className="w-full py-3 text-base">
              Instalar app
            </Button>
          )}
          <Steps>
            <li>Abre esta página no <strong>Chrome</strong>.</li>
            <li>Toca no menu <MenuDotsIcon /> (canto superior direito).</li>
            <li>Escolhe <strong>«Instalar app»</strong> ou <strong>«Adicionar ao ecrã principal»</strong>.</li>
            <li>Confirma. A app fica no ecrã principal, como qualquer outra.</li>
          </Steps>
        </>
      )}

      {tab === 'desktop' && (
        <>
          <Steps>
            <li>Carrega em {mac ? <><Kbd>⌘</Kbd> + <Kbd>D</Kbd></> : <><Kbd>Ctrl</Kbd> + <Kbd>D</Kbd></>} para guardar esta página nos favoritos.</li>
            <li>Escolhe a barra de favoritos como destino, para ficar sempre visível.</li>
            <li>
              Se a barra não aparecer, mostra-a com{' '}
              {mac ? <><Kbd>⌘</Kbd> + <Kbd>⇧</Kbd> + <Kbd>B</Kbd></> : <><Kbd>Ctrl</Kbd> + <Kbd>Shift</Kbd> + <Kbd>B</Kbd></>}.
            </li>
          </Steps>
          <Note>O computador tem todas as funcionalidades (Budgets, Projeções…); o telemóvel tem o essencial do dia a dia.</Note>
          {canPrompt && (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted">Ou instalar como app:</span>
              <Button size="sm" variant="soft" onClick={() => void promptInstall()}>Instalar como app</Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Cartão no topo do onboarding.
export function InstallGuideCard() {
  const [open, setOpen] = useState(false)
  const platform = detectPlatform()
  if (platform !== 'desktop' && isStandalone()) return null

  return (
    <Card className="mb-4">
      <SectionTitle>Ter a app sempre à mão</SectionTitle>
      <p className="mb-3 text-xs text-muted">
        {platform === 'desktop'
          ? 'Guarda esta página nos favoritos do teu browser (⌘D / Ctrl+D). O computador tem todas as funcionalidades; no telemóvel instalas a app para o dia a dia.'
          : platform === 'ios'
            ? 'Recomendamos instalar a app no ecrã principal antes de preencheres isto — os dados guardados no Safari não passam para a app instalada.'
            : 'Adiciona a app ao ecrã principal do telemóvel para a abrires num toque.'}
      </p>
      <Button size="sm" variant="soft" onClick={() => setOpen(true)}>Ver como fazer</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Ter a app sempre à mão">
        <InstallGuideContent />
      </Modal>
    </Card>
  )
}

// Lembrete dentro da app, só depois do primeiro plano aplicado (ver
// lib/installNudge). Computador: cartão no canto com o atalho dos favoritos
// (ou "Instalar app" quando o browser o permite). Telemóvel: faixa no topo
// com botão para instalar / ver como.
export function InstallNudge() {
  const plans = useStore((s) => s.data.monthlyPlans)
  const { canPrompt, promptInstall } = useInstallPrompt()
  const [state, setState] = useState<NudgeState>(loadNudgeState)
  const [open, setOpen] = useState(false)
  const platform = detectPlatform()
  const mac = detectMac()
  const visible = shouldShowNudge({ state, hasAppliedPlan: hasAppliedPlan(plans), standalone: isStandalone(), now: new Date() })

  const update = (next: NudgeState) => {
    saveNudgeState(next)
    setState(next)
  }
  const done = () => {
    trackEvent('install-nudge-done')
    update({ ...state, done: true })
  }
  const snooze = () => {
    trackEvent('install-nudge-snoozed')
    update(snoozeNudge(state, new Date()))
  }
  const install = async () => {
    if (await promptInstall()) update({ ...state, done: true })
  }

  // Se carregar no atalho dos favoritos com o cartão à vista, damos por feito
  // (não impedimos o atalho do browser).
  useEffect(() => {
    if (!visible || platform !== 'desktop') return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'd') {
        trackEvent('install-nudge-shortcut')
        const next = { ...loadNudgeState(), done: true }
        saveNudgeState(next)
        setState(next)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, platform])

  if (!visible) return null

  if (platform === 'desktop') {
    const shortcut = mac ? <><Kbd>⌘</Kbd> + <Kbd>D</Kbd></> : <><Kbd>Ctrl</Kbd> + <Kbd>D</Kbd></>
    return (
      <div role="dialog" aria-label="Ter a app sempre à mão" className="fade-up fixed bottom-6 right-6 z-40 w-80 rounded-2xl border border-border bg-surface p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none">{canPrompt ? '🖥️' : '⭐'}</span>
          <div className="min-w-0">
            <div className="text-sm font-bold">{canPrompt ? 'Instala a Contas como app' : 'Guarda a Contas nos favoritos'}</div>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {canPrompt ? (
                <>Fica com janela e ícone próprios, sempre à mão. Ou guarda só nos favoritos com {shortcut}.</>
              ) : (
                <>Carrega em {shortcut} para a teres sempre à mão. É no computador que tens todas as funcionalidades.</>
              )}
            </p>
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={snooze}>Agora não</Button>
          {canPrompt ? (
            <Button size="sm" onClick={() => void install()}>Instalar app</Button>
          ) : (
            <Button size="sm" onClick={done}>Já guardei ✓</Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="mb-3 rounded-xl bg-accent-soft p-3">
        <div className="text-sm font-semibold text-accent-strong">📲 Adiciona a Contas ao ecrã principal</div>
        <p className="mt-0.5 text-xs text-muted">Abre-a num toque, como qualquer outra app.</p>
        <div className="mt-2 flex gap-2">
          {canPrompt ? (
            <Button size="sm" onClick={() => void install()}>Instalar</Button>
          ) : (
            <Button size="sm" onClick={() => setOpen(true)}>Como instalar</Button>
          )}
          <Button variant="ghost" size="sm" onClick={snooze}>Agora não</Button>
        </div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Ter a app sempre à mão">
        <InstallGuideContent />
      </Modal>
    </>
  )
}

// Secção das Definições — sempre disponível.
export function InstallSettingsSection() {
  const [open, setOpen] = useState(false)
  const standalone = isStandalone()
  return (
    <section>
      <SectionTitle>Ter a app sempre à mão</SectionTitle>
      <Card>
        <p className="mb-3 text-sm text-muted">
          {standalone
            ? 'Já estás a usar a app instalada. No computador, guarda também a página nos favoritos (⌘D / Ctrl+D) para teres todas as funcionalidades.'
            : 'Adiciona a app ao ecrã principal do telemóvel e guarda-a nos favoritos do computador.'}
        </p>
        <Button variant="soft" onClick={() => setOpen(true)}>Ver o guia</Button>
        <Modal open={open} onClose={() => setOpen(false)} title="Ter a app sempre à mão">
          <InstallGuideContent initialPlatform={standalone ? 'desktop' : undefined} />
        </Modal>
      </Card>
    </section>
  )
}

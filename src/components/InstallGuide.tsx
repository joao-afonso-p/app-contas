import { useEffect, useState, type ReactNode } from 'react'
import { Button, Card, Modal, SectionTitle, cx } from './ui'
import { trackEvent } from '../lib/analytics'
import { useInstallPrompt } from '../lib/installPrompt'
import { detectIosNonSafari, detectMac, detectPlatform, isStandalone, type Platform } from '../lib/platform'
import { useStore } from '../store/useStore'

const LS_DISMISSED = 'contas.installBannerDismissed'

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

// Faixa discreta dentro da app.
export function InstallBanner() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(LS_DISMISSED) === '1')
  const [open, setOpen] = useState(false)
  if (dismissed || isStandalone()) return null

  const dismiss = () => {
    localStorage.setItem(LS_DISMISSED, '1')
    trackEvent('install-banner-dismissed')
    setDismissed(true)
  }
  const isDesktop = detectPlatform() === 'desktop'
  return (
    <>
      <div className="mb-3 flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent-strong">
        <button className="min-w-0 flex-1 truncate text-left font-medium" onClick={() => setOpen(true)}>
          {isDesktop ? '⭐ Guarda a app nos favoritos' : '📲 Adiciona a app ao ecrã principal'}
        </button>
        <button onClick={dismiss} aria-label="Dispensar" className="rounded-lg px-1.5 hover:bg-black/5">✕</button>
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

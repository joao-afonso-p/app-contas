// Estatísticas de utilização anónimas via GoatCounter (sem cookies, sem IPs
// guardados). Só corre no build de produção com VITE_GOATCOUNTER_CODE
// definido — em dev e em forks nada é enviado.
//
// A app não tem rotas no URL (o ecrã vive no Zustand), por isso cada ecrã é
// contado como uma pageview virtual ("/overview", "/gastos"…). NUNCA enviar
// valores, nomes, categorias ou o código de espaço — só ids de ecrãs e de
// eventos fixos definidos aqui.

type Hit = { path: string; title?: string; event?: boolean }

// `count` só existe depois de o script carregar.
interface GoatCounter {
  no_onload?: boolean
  count?(vars: Hit): void
}

declare global {
  interface Window {
    goatcounter?: GoatCounter
  }
}

const CODE = import.meta.env.VITE_GOATCOUNTER_CODE as string | undefined
const enabled = import.meta.env.PROD && !!CODE

let queue: Hit[] | null = null

function load() {
  if (queue) return
  queue = []
  // Contagem manual (SPA): impede a pageview automática do carregamento.
  window.goatcounter = { ...window.goatcounter, no_onload: true }
  const s = document.createElement('script')
  s.async = true
  s.src = 'https://gc.zgo.at/count.js'
  s.dataset.goatcounter = `https://${CODE}.goatcounter.com/count`
  s.onload = () => {
    const pending = queue ?? []
    queue = []
    pending.forEach(send)
  }
  document.head.appendChild(s)
  // Uma vez por sessão: app instalada (ecrã principal) vs separador do browser.
  const standalone =
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  send({ path: standalone ? 'display-standalone' : 'display-browser', event: true })
}

function send(hit: Hit) {
  if (window.goatcounter?.count) window.goatcounter.count(hit)
  else queue?.push(hit)
}

export function trackView(view: string) {
  if (!enabled) return
  load()
  send({ path: `/${view}`, title: view })
}

export type AnalyticsEvent =
  | 'onboarding-complete'
  | 'mode-local'
  | 'mode-space'
  | 'backup-export'
  | 'backup-import'
  | 'install-guide-open'
  | 'install-nudge-done'
  | 'install-nudge-snoozed'
  | 'install-nudge-shortcut'
  | 'install-prompt-accepted'

export function trackEvent(name: AnalyticsEvent) {
  if (!enabled) return
  load()
  send({ path: name, event: true })
}

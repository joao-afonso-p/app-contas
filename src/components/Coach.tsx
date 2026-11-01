import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { Button } from './ui'
import { hasSeenTour, markTourSeen, useCoach } from '../lib/coach'
import { tourById, tourForScreen } from '../content/tours'
import { useStore } from '../store/useStore'
import { featureStatus, isLockedFeature } from '../lib/unlock'
import { todayISO } from '../lib/format'

interface Box {
  top: number
  left: number
  width: number
  height: number
}

const PAD = 8
const CARD_W = 340
const GAP = 12

// Entre vários elementos com o mesmo data-coach (menu lateral e barra de baixo),
// devolve o primeiro que está realmente visível.
function findTarget(keys: string[]): HTMLElement | null {
  for (const key of keys) {
    const els = document.querySelectorAll<HTMLElement>(`[data-coach="${key}"]`)
    for (const el of els) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) return el
    }
  }
  return null
}

const toBox = (el: HTMLElement): Box => {
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

// Ecrã escurecido com um foco no elemento em causa e uma legenda com
// "Anterior", "Seguinte" e "Saltar". Usa-se em qualquer visita de content/tours.ts.
export function CoachOverlay() {
  const tourId = useCoach((s) => s.tourId)
  const step = useCoach((s) => s.step)
  const goto = useCoach((s) => s.goto)
  const stop = useCoach((s) => s.stop)
  const screen = useStore((s) => s.screen)
  const setScreen = useStore((s) => s.setScreen)

  const tour = tourId ? tourById(tourId) : undefined
  const current = tour?.steps[step]

  const [box, setBox] = useState<Box | null>(null)
  const [cardH, setCardH] = useState(180)
  const cardRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const scrolledFor = useRef<string>('')

  const finish = useCallback(() => {
    if (tourId) markTourSeen(tourId)
    stop()
  }, [tourId, stop])

  // Navega para o ecrã do passo.
  useEffect(() => {
    if (current?.screen && current.screen !== screen) setScreen(current.screen)
  }, [current?.screen, screen, setScreen])

  // Procura o alvo (o ecrã novo pode demorar a aparecer) e acompanha-o se a página mexer.
  useEffect(() => {
    if (!tour || !current) return
    const keys = current.target ? (Array.isArray(current.target) ? current.target : [current.target]) : []
    if (keys.length === 0) {
      setBox(null)
      return
    }
    const stepKey = `${tour.id}:${step}`
    let attempts = 0
    const update = () => {
      const el = findTarget(keys)
      if (!el) {
        attempts += 1
        if (attempts > 14) setBox(null) // ~2 s sem alvo: mostra a legenda ao centro
        return
      }
      if (scrolledFor.current !== stepKey) {
        scrolledFor.current = stepKey
        el.scrollIntoView({ block: 'center', behavior: 'auto' })
      }
      setBox(toBox(el))
    }
    update()
    const id = window.setInterval(update, 140)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, { passive: true })
    return () => {
      window.clearInterval(id)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update)
    }
  }, [tour, current, step])

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight)
  })

  useEffect(() => {
    if (!tour) return
    nextRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
      if (e.key === 'ArrowRight') {
        if (step >= tour.steps.length - 1) finish()
        else goto(step + 1)
      }
      if (e.key === 'ArrowLeft' && step > 0) goto(step - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tour, step, goto, finish])

  if (!tour || !current) return null

  const last = step >= tour.steps.length - 1
  const vw = window.innerWidth
  const vh = window.innerHeight
  const cardW = Math.min(CARD_W, vw - 24)

  let cardStyle: React.CSSProperties
  if (box) {
    const below = box.top + box.height + PAD + GAP
    const fitsBelow = below + cardH <= vh - 12
    const top = fitsBelow ? below : Math.max(12, box.top - PAD - GAP - cardH)
    const left = Math.max(12, Math.min(box.left + box.width / 2 - cardW / 2, vw - cardW - 12))
    cardStyle = { position: 'fixed', top, left, width: cardW }
  } else {
    cardStyle = { position: 'fixed', top: '50%', left: '50%', width: cardW, transform: 'translate(-50%, -50%)' }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label={tour.title}>
      {box ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-2xl ring-2 ring-accent transition-all duration-200"
          style={{
            top: box.top - PAD,
            left: box.left - PAD,
            width: box.width + PAD * 2,
            height: box.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(12, 18, 32, 0.66)',
          }}
        />
      ) : (
        <div aria-hidden="true" className="fixed inset-0" style={{ background: 'rgba(12, 18, 32, 0.66)' }} />
      )}

      <div ref={cardRef} style={cardStyle} className="fade-up rounded-2xl border border-border bg-surface p-4 shadow-xl">
        <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <span>{tour.title} · {step + 1} de {tour.steps.length}</span>
          <button onClick={finish} aria-label="Fechar a visita" className="rounded-md p-1 hover:bg-surface-2">
            <X size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <h2 className="font-display text-lg font-medium leading-snug">{current.title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">{current.text}</p>
        <div className="mt-3 flex items-center gap-1" aria-hidden="true">
          {tour.steps.map((_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-surface-3'}`} />
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={finish}>Saltar</Button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button variant="ghost" size="sm" onClick={() => goto(step - 1)}>
                <ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" />
                Anterior
              </Button>
            )}
            <button
              ref={nextRef}
              onClick={() => (last ? finish() : goto(step + 1))}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent-strong px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
            >
              {last ? 'Concluir' : 'Seguinte'}
              {last ? <Check size={14} strokeWidth={2} aria-hidden="true" /> : <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// Na primeira vez que se abre um ecrã com visita própria (Investimento, Analytics,
// Projeções), oferece uma visita curta. Só em contas novas, que passaram pelo onboarding.
export function CoachPrompt() {
  const screen = useStore((s) => s.screen)
  const meta = useStore((s) => s.data.meta[0])
  const tourId = useCoach((s) => s.tourId)
  const start = useCoach((s) => s.start)
  const [dismissed, setDismissed] = useState<string | null>(null)

  const tour = tourForScreen(screen)
  if (!tour || tourId || dismissed === tour.id) return null
  if (!meta?.onboardedAt) return null
  if (hasSeenTour(tour.id)) return null
  if (isLockedFeature(screen) && featureStatus(meta, screen, todayISO()).locked) return null

  const close = () => {
    markTourSeen(tour.id)
    setDismissed(tour.id)
  }

  return (
    <div className="fade-up fixed inset-x-3 bottom-20 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-xl md:inset-x-auto md:bottom-6 md:right-6 md:mx-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">Primeira vez aqui?</div>
        <div className="text-xs text-muted">Faz uma visita de menos de um minuto.</div>
      </div>
      <Button size="sm" variant="ghost" onClick={close}>Agora não</Button>
      <Button size="sm" onClick={() => { markTourSeen(tour.id); start(tour.id) }}>Começar</Button>
    </div>
  )
}

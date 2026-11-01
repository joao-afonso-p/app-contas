import { Fragment, useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronDown, Download, Lightbulb } from 'lucide-react'
import { Badge, Card, cx } from '../components/ui'
import { FAQ, GLOSSARY, GUIDE, type Block } from '../content/guide'

// **negrito** é a única marcação usada no conteúdo do guia.
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') ? (
          <strong key={i} className="font-semibold text-text">{part.slice(2, -2)}</strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  )
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((b, i) => {
        if (b.t === 'p') return <p key={i} className="text-sm leading-relaxed text-muted"><Rich text={b.text} /></p>
        if (b.t === 'list')
          return (
            <ul key={i} className="flex flex-col gap-1.5 pl-1 text-sm leading-relaxed text-muted">
              {b.items.map((it, j) => (
                <li key={j} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                  <span><Rich text={it} /></span>
                </li>
              ))}
            </ul>
          )
        if (b.t === 'steps')
          return (
            <ol key={i} className="flex flex-col gap-2.5 text-sm leading-relaxed text-muted">
              {b.items.map((it, j) => (
                <li key={j} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-strong">
                    {j + 1}
                  </span>
                  <span className="pt-0.5"><Rich text={it} /></span>
                </li>
              ))}
            </ol>
          )
        return (
          <div key={i} className="flex gap-2.5 rounded-xl bg-accent-soft/60 p-3 text-sm leading-relaxed text-text">
            <Lightbulb size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-accent-strong" aria-hidden="true" />
            <span><Rich text={b.text} /></span>
          </div>
        )
      })}
    </div>
  )
}

const PDF_URL = `${import.meta.env.BASE_URL}guia-contas.pdf`

const TOC = [
  ...GUIDE.map((s) => ({ id: s.id, label: s.title })),
  { id: 'faq', label: 'Perguntas frequentes' },
  { id: 'glossario', label: 'Glossário' },
]

export function Guia() {
  const [active, setActive] = useState(TOC[0].id)
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  // Enquanto a página rola por causa de um clique no índice, o scroll-spy fica em pausa
  // (senão o destaque saltava por todas as secções pelo caminho).
  const lockUntil = useRef(0)

  // Navegação dentro da página: não toca no hash do URL (que é o ecrã ativo).
  const go = (id: string) => {
    setActive(id)
    lockUntil.current = Date.now() + 900
    document.getElementById(`guia-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Scroll-spy: a secção ativa é a última cujo topo já passou a linha de referência.
  // No fundo da página fica sempre a última, mesmo que seja curta.
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      if (Date.now() < lockUntil.current) return
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
      let current = TOC[0].id
      if (atBottom) {
        current = TOC[TOC.length - 1].id
      } else {
        for (const t of TOC) {
          const el = document.getElementById(`guia-${t.id}`)
          if (el && el.getBoundingClientRect().top <= 120) current = t.id
        }
      }
      setActive(current)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    update()
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div className="fade-up flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl">
            <BookOpen size={24} strokeWidth={1.75} className="text-accent-strong" aria-hidden="true" />
            Guia da Contas
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Do essencial ao avançado, em português simples. Começa por "Começar" e volta às outras partes quando precisares.
          </p>
        </div>
        <a
          href={PDF_URL}
          download
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-text hover:bg-surface-2"
        >
          <Download size={16} strokeWidth={1.75} aria-hidden="true" />
          Versão em PDF
        </a>
      </div>

      <div className="flex gap-8">
        <nav aria-label="Secções do guia" className="sticky top-6 hidden h-fit w-48 shrink-0 flex-col gap-1 md:flex">
          {TOC.map((t) => (
            <button
              key={t.id}
              onClick={() => go(t.id)}
              className={cx(
                'rounded-xl px-3 py-2 text-left text-sm transition-colors',
                active === t.id ? 'bg-accent-soft font-semibold text-accent-strong' : 'text-muted hover:bg-surface-2 hover:text-text',
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:hidden">
            {TOC.map((t) => (
              <button
                key={t.id}
                onClick={() => go(t.id)}
                className={cx(
                  'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium',
                  active === t.id ? 'border-accent bg-accent-soft text-accent-strong' : 'border-border bg-surface text-muted',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {GUIDE.map((section) => (
            <section key={section.id} id={`guia-${section.id}`} className="scroll-mt-6">
              <Card className="flex flex-col gap-4 p-5">
                <div>
                  <Badge tone="accent">{section.kicker}</Badge>
                  <h2 className="mt-2 font-display text-xl font-medium">{section.title}</h2>
                  <p className="mt-0.5 text-sm text-muted">{section.summary}</p>
                </div>
                <Blocks blocks={section.blocks} />
                {section.subs?.map((sub) => (
                  <div key={sub.title} className="border-t border-border pt-4">
                    <h3 className="mb-2 text-sm font-semibold text-text">{sub.title}</h3>
                    <Blocks blocks={sub.blocks} />
                  </div>
                ))}
              </Card>
            </section>
          ))}

          <section id="guia-faq" className="scroll-mt-6">
            <Card className="p-5">
              <h2 className="mb-3 font-display text-xl font-medium">Perguntas frequentes</h2>
              <div className="divide-y divide-border">
                {FAQ.map((f, i) => (
                  <div key={f.q}>
                    <button
                      onClick={() => setOpenFaq(openFaq === i ? null : i)}
                      aria-expanded={openFaq === i}
                      className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm font-medium text-text"
                    >
                      {f.q}
                      <ChevronDown
                        size={18}
                        strokeWidth={1.75}
                        className={cx('shrink-0 text-muted transition-transform', openFaq === i && 'rotate-180')}
                        aria-hidden="true"
                      />
                    </button>
                    {openFaq === i && <p className="pb-3 text-sm leading-relaxed text-muted">{f.a}</p>}
                  </div>
                ))}
              </div>
            </Card>
          </section>

          <section id="guia-glossario" className="scroll-mt-6">
            <Card className="p-5">
              <h2 className="mb-3 font-display text-xl font-medium">Glossário</h2>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {GLOSSARY.map((g) => (
                  <div key={g.term}>
                    <dt className="text-sm font-semibold text-text">{g.term}</dt>
                    <dd className="text-sm leading-relaxed text-muted">{g.def}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </section>
        </div>
      </div>
    </div>
  )
}

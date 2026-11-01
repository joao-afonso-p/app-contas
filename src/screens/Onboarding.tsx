import { useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, Plus, X } from 'lucide-react'
import { ImportBackupCard } from '../components/Backup'
import { InstallGuideCard } from '../components/InstallGuide'
import { RentExplanation } from '../components/RentInfo'
import { IncomeTiming, timingLabel } from '../components/IncomeTiming'
import { Badge, Button, Card, InfoHint, Input, Select, cx } from '../components/ui'
import { LogoMark } from '../components/Logo'
import { trackEvent } from '../lib/analytics'
import { parseAmount, uid } from '../lib/format'
import { useStore } from '../store/useStore'
import { useCoach } from '../lib/coach'
import type { BucketKind } from '../types'

interface DraftIncomeSource {
  id: string
  name: string
  isRent: boolean
  expectedDay?: number
}
interface DraftCategory {
  id: string
  name: string
  subs: string[]
}
interface DraftBucket {
  id: string
  name: string
  kind: BucketKind
  targetAmount: string
  targetDate: string
  initialValue: string
}
interface DraftVehicle {
  id: string
  name: string
  initialValue: string
}

type StepId = 'intro' | 'rendimentos' | 'despesas' | 'baldes' | 'investimento' | 'revisao'
const STEPS: StepId[] = ['intro', 'rendimentos', 'despesas', 'baldes', 'investimento', 'revisao']

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="shrink-0 rounded-lg px-1.5 py-0.5 text-sm text-muted hover:bg-surface-2 hover:text-negative"
    >
      <X size={16} strokeWidth={1.75} aria-hidden="true" />
    </button>
  )
}

// Fala da Contas: uma pergunta de cada vez, como numa conversa.
function Bubble({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface">
        <LogoMark size={26} className="text-text" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl rounded-tl-md border border-border bg-surface px-4 py-3">
          <p className="font-display text-lg font-medium leading-snug">{children}</p>
        </div>
        {sub && <div className="mt-2 px-1 text-sm leading-relaxed text-muted">{sub}</div>}
      </div>
    </div>
  )
}

// Exemplo da Marta (a mesma pessoa do guia), para a pessoa perceber o que preencher.
function MartaExample({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-goal/30 bg-goal-soft/50 p-3 text-sm leading-relaxed text-text">
      <span className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-goal">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-goal text-[11px] text-white" aria-hidden="true">M</span>
        Exemplo: a Marta
      </span>
      {children}
    </div>
  )
}

function Suggestions({ label, items }: { label: string; items: { text: string; onClick: () => void }[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-muted">{label}</div>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <button
            key={it.text}
            type="button"
            onClick={it.onClick}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text hover:border-accent hover:bg-accent-soft"
          >
            <Plus size={14} strokeWidth={2} aria-hidden="true" />
            {it.text}
          </button>
        ))}
      </div>
    </div>
  )
}

function Concept({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="text-sm font-semibold text-text">{title}</div>
      <p className="mt-0.5 text-sm leading-relaxed text-muted">{children}</p>
    </div>
  )
}

export function Onboarding() {
  const completeOnboarding = useStore((s) => s.completeOnboarding)
  const startTour = useCoach((s) => s.start)
  const [busy, setBusy] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const step = STEPS[stepIdx]

  const [incomeSources, setIncomeSources] = useState<DraftIncomeSource[]>([])
  const [incomeName, setIncomeName] = useState('')
  const [incomeTiming, setIncomeTiming] = useState<{ isRent: boolean; expectedDay?: number }>({ isRent: false })

  const [expenseCategories, setExpenseCategories] = useState<DraftCategory[]>([])
  const [expenseName, setExpenseName] = useState('')

  // Rascunho de nova subcategoria por despesa (id da despesa -> texto).
  const [subDrafts, setSubDrafts] = useState<Record<string, string>>({})

  const [buckets, setBuckets] = useState<DraftBucket[]>([])
  const [bucketName, setBucketName] = useState('')
  const [bucketKind, setBucketKind] = useState<BucketKind>('fixed')
  const [bucketTarget, setBucketTarget] = useState('')
  const [bucketTargetDate, setBucketTargetDate] = useState('')
  const [bucketInitial, setBucketInitial] = useState('')

  const [vehicles, setVehicles] = useState<DraftVehicle[]>([])
  const [vehicleName, setVehicleName] = useState('')
  const [vehicleInitial, setVehicleInitial] = useState('')

  const hasIncome = (name: string) => incomeSources.some((s) => s.name.toLowerCase() === name.toLowerCase())
  const hasExpense = (name: string) => expenseCategories.some((c) => c.name.toLowerCase() === name.toLowerCase())
  const hasBucket = (name: string) => buckets.some((b) => b.name.toLowerCase() === name.toLowerCase())

  const addIncomeSource = () => {
    const name = incomeName.trim()
    if (!name) return
    setIncomeSources((d) => [...d, { id: uid(), name, ...incomeTiming }])
    setIncomeName('')
    setIncomeTiming({ isRent: false })
  }

  const addExpenseCategory = (nameRaw = expenseName) => {
    const name = nameRaw.trim()
    if (!name || hasExpense(name)) return
    setExpenseCategories((d) => [...d, { id: uid(), name, subs: [] }])
    setExpenseName('')
  }

  const addSub = (categoryId: string) => {
    const name = (subDrafts[categoryId] ?? '').trim()
    if (!name) return
    setExpenseCategories((d) =>
      d.map((c) => (c.id === categoryId && !c.subs.includes(name) ? { ...c, subs: [...c.subs, name] } : c)),
    )
    setSubDrafts((d) => ({ ...d, [categoryId]: '' }))
  }

  const removeSub = (categoryId: string, name: string) =>
    setExpenseCategories((d) => d.map((c) => (c.id === categoryId ? { ...c, subs: c.subs.filter((x) => x !== name) } : c)))

  const addBucket = () => {
    const name = bucketName.trim()
    if (!name) return
    setBuckets((d) => [
      ...d,
      { id: uid(), name, kind: bucketKind, targetAmount: bucketTarget, targetDate: bucketTargetDate, initialValue: bucketInitial },
    ])
    setBucketName('')
    setBucketKind('fixed')
    setBucketTarget('')
    setBucketTargetDate('')
    setBucketInitial('')
  }

  const addVehicle = () => {
    const name = vehicleName.trim()
    if (!name) return
    setVehicles((d) => [...d, { id: uid(), name, initialValue: vehicleInitial }])
    setVehicleName('')
    setVehicleInitial('')
  }

  const submit = async () => {
    setBusy(true)
    await completeOnboarding({
      incomeSources: incomeSources.map((s) => ({ name: s.name, isRent: s.isRent, expectedDay: s.expectedDay })),
      expenseCategories: expenseCategories.map((c) => ({ name: c.name, subcategories: c.subs })),
      buckets: buckets.map((b) => ({
        name: b.name,
        kind: b.kind,
        targetAmount: b.kind === 'goal' ? parseAmount(b.targetAmount) ?? 0 : undefined,
        targetDate: b.kind === 'goal' && b.targetDate ? b.targetDate : undefined,
        initialValue: parseAmount(b.initialValue) ?? 0,
      })),
      vehicles: vehicles.map((v) => ({ name: v.name, initialValue: parseAmount(v.initialValue) ?? 0 })),
    })
    trackEvent('onboarding-complete')
    // A visita guiada arranca assim que a app principal aparece.
    startTour('inicio')
  }

  const back = () => setStepIdx((i) => Math.max(0, i - 1))
  const next = () => setStepIdx((i) => Math.min(STEPS.length - 1, i + 1))

  const optional = step === 'investimento'
  const progressSteps = STEPS.length - 1 // sem contar a introdução

  return (
    <div className="flex min-h-dvh items-start justify-center bg-bg p-4 sm:items-center sm:p-6">
      <div className="fade-up w-full max-w-lg py-4">
        {step !== 'intro' && (
          <div className="mb-5" aria-label={`Passo ${stepIdx} de ${progressSteps}`}>
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
              <span>Passo {stepIdx} de {progressSteps}</span>
              <span>Podes mudar tudo depois em Definições</span>
            </div>
            <div className="flex gap-1.5">
              {STEPS.slice(1).map((s, i) => (
                <span
                  key={s}
                  className={cx('h-1.5 flex-1 rounded-full', i < stepIdx ? 'bg-accent' : 'bg-surface-3')}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {step === 'intro' && (
            <>
              <div className="mb-1 text-center">
                <LogoMark size={72} className="mx-auto mb-3 text-text" />
                <h1 className="text-2xl">Olá! Vamos configurar a Contas</h1>
                <p className="mt-1 text-sm text-muted">
                  São cinco passos curtos, em formato de conversa. Cria só o que precisas e muda tudo quando quiseres.
                </p>
              </div>
              <Card className="flex flex-col gap-2.5">
                <div className="text-sm font-semibold">Três ideias para começar</div>
                <Concept title="Conta corrente">A conta do dia a dia, de onde pagas as despesas.</Concept>
                <Concept title="Poupança e baldes">
                  O dinheiro que guardas à parte. Está todo na mesma conta do banco, mas a Contas divide-o em baldes
                  (por exemplo Emergência, Férias, Carro), para saberes quanto pertence a cada um.
                </Concept>
                <Concept title="Plano do mês">
                  Todos os meses decides para onde vai o dinheiro. Depois, comparas com o que aconteceu.
                </Concept>
              </Card>
              <InstallGuideCard />
              <ImportBackupCard />
            </>
          )}

          {step === 'rendimentos' && (
            <>
              <Bubble
                sub="Salário, rendas, trabalho extra. Cada fonte conta, por defeito, como dinheiro que entra no dia em que recebes. Só tens de marcar \"chega depois\" se entrar mais tarde (por exemplo, uma renda). Assim, a Contas sabe quanto transferir para a poupança no dia do salário."
              >
                De onde entra dinheiro todos os meses?
              </Bubble>
              <MartaExample>
                Tem o <strong>Salário</strong>, sem mais nada a marcar. E tem a <strong>Renda do quarto</strong>: arrenda um quarto da casa dela a outra pessoa e recebe 300 € por mês, por volta do dia 8, depois do salário. Por isso marca "chega depois".
              </MartaExample>
              <Card>
                {incomeSources.length > 0 && (
                  <ul className="mb-3 divide-y divide-border">
                    {incomeSources.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                        <span className="flex items-center gap-1.5 text-sm">
                          {s.name}
                          {s.isRent && <Badge>{timingLabel(s.expectedDay)}</Badge>}
                        </span>
                        <RemoveButton
                          label={`Remover ${s.name}`}
                          onClick={() => setIncomeSources((d) => d.filter((x) => x.id !== s.id))}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    placeholder="Nova fonte…"
                    value={incomeName}
                    onChange={(e) => setIncomeName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addIncomeSource()}
                    className="min-w-0 flex-1"
                  />
                  <IncomeTiming {...incomeTiming} onChange={setIncomeTiming} />
                  <InfoHint label="Quando chega?"><RentExplanation /></InfoHint>
                  <Button variant="soft" onClick={addIncomeSource} disabled={!incomeName.trim()}>Adicionar</Button>
                </div>
              </Card>
              <Suggestions
                label="Atalhos"
                items={[
                  ...(hasIncome('Salário') ? [] : [{ text: 'Salário', onClick: () => setIncomeSources((d) => [...d, { id: uid(), name: 'Salário', isRent: false }]) }]),
                  ...(hasIncome('Renda') ? [] : [{ text: 'Renda (chega depois)', onClick: () => setIncomeSources((d) => [...d, { id: uid(), name: 'Renda', isRent: true }]) }]),
                  ...(hasIncome('Trabalho extra') ? [] : [{ text: 'Trabalho extra', onClick: () => setIncomeSources((d) => [...d, { id: uid(), name: 'Trabalho extra', isRent: false }]) }]),
                ]}
              />
            </>
          )}

          {step === 'despesas' && (
            <>
              <Bubble
                sub="Estas são as categorias do teu orçamento mensal. Mais tarde, vais comparar o que planeaste gastar em cada uma com o que realmente gastaste. Podes ainda detalhar cada uma em subcategorias."
              >
                Em que categorias gastas dinheiro?
              </Bubble>
              <MartaExample>
                Casa (com Prestação, Eletricidade e Água), Supermercado, Lazer, Transportes, Seguros e Saúde.
              </MartaExample>
              <Card>
                {expenseCategories.length > 0 && (
                  <ul className="mb-3 divide-y divide-border">
                    {expenseCategories.map((c) => (
                      <li key={c.id} className="py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{c.name}</span>
                          <RemoveButton
                            label={`Remover ${c.name}`}
                            onClick={() => setExpenseCategories((d) => d.filter((x) => x.id !== c.id))}
                          />
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {c.subs.map((name) => (
                            <span key={name} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">
                              {name}
                              <button
                                onClick={() => removeSub(c.id, name)}
                                aria-label={`Remover subcategoria ${name}`}
                                className="hover:text-negative"
                              >
                                <X size={13} strokeWidth={2} aria-hidden="true" />
                              </button>
                            </span>
                          ))}
                          <input
                            value={subDrafts[c.id] ?? ''}
                            onChange={(e) => setSubDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && addSub(c.id)}
                            onBlur={() => addSub(c.id)}
                            placeholder="+ subcategoria (opcional)"
                            className="w-44 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-text placeholder:text-muted focus:border-accent focus:outline-none"
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <Input
                    placeholder="Nova despesa…"
                    value={expenseName}
                    onChange={(e) => setExpenseName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addExpenseCategory()}
                    className="min-w-0 flex-1"
                  />
                  <Button variant="soft" onClick={() => addExpenseCategory()} disabled={!expenseName.trim()}>Adicionar</Button>
                </div>
              </Card>
              <Suggestions
                label="Atalhos"
                items={['Casa', 'Supermercado', 'Transportes', 'Lazer', 'Saúde', 'Seguros']
                  .filter((n) => !hasExpense(n))
                  .map((n) => ({ text: n, onClick: () => addExpenseCategory(n) }))}
              />
            </>
          )}

          {step === 'baldes' && (
            <>
              <Bubble
                sub={
                  <>
                    Um <strong className="font-semibold text-text">balde</strong> é uma divisão virtual do dinheiro que tens
                    na conta poupança. O dinheiro está todo na mesma conta do banco, e a Contas sabe quanto pertence a cada balde.
                    "Fixo" é para poupar sempre (por exemplo, emergência). "Objetivo" tem valor e data (por exemplo, férias).
                    Em "Valor atual", diz quanto já tens em cada um.
                  </>
                }
              >
                Como queres dividir a tua poupança?
              </Bubble>
              <MartaExample>
                Fundo de emergência (fixo, 2 400 €), Férias (objetivo de 1 800 € até julho), Carro e Geral.
              </MartaExample>
              <Card>
                {buckets.length > 0 && (
                  <ul className="mb-3 divide-y divide-border">
                    {buckets.map((b) => (
                      <li key={b.id} className="flex items-center justify-between gap-2 py-2">
                        <span className="flex min-w-0 items-center gap-1.5 text-sm">
                          <span className="truncate">{b.name}</span>
                          {b.kind === 'goal' && <Badge tone="goal">Objetivo</Badge>}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {b.initialValue && <span className="tnum text-sm text-muted">{b.initialValue}€</span>}
                          <RemoveButton
                            label={`Remover ${b.name}`}
                            onClick={() => setBuckets((d) => d.filter((x) => x.id !== b.id))}
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Input
                      placeholder="Novo balde…"
                      value={bucketName}
                      onChange={(e) => setBucketName(e.target.value)}
                      className="min-w-0 flex-1"
                    />
                    <Select value={bucketKind} onChange={(e) => setBucketKind(e.target.value as BucketKind)}>
                      <option value="fixed">Fixo</option>
                      <option value="goal">Objetivo</option>
                    </Select>
                  </div>
                  {bucketKind === 'goal' && (
                    <div className="flex flex-wrap gap-2">
                      <Input
                        type="number"
                        placeholder="Objetivo (€)"
                        value={bucketTarget}
                        onChange={(e) => setBucketTarget(e.target.value)}
                        className="min-w-0 flex-1"
                      />
                      <input
                        type="month"
                        value={bucketTargetDate}
                        onChange={(e) => setBucketTargetDate(e.target.value)}
                        className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
                      />
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      inputMode="decimal"
                      placeholder="Valor atual (€)"
                      value={bucketInitial}
                      onChange={(e) => setBucketInitial(e.target.value)}
                      className="min-w-0 flex-1"
                    />
                    <Button variant="soft" onClick={addBucket} disabled={!bucketName.trim()}>Adicionar</Button>
                  </div>
                </div>
              </Card>
              <Suggestions
                label="Atalhos"
                items={[
                  ...(hasBucket('Fundo de emergência') ? [] : [{ text: 'Fundo de emergência', onClick: () => setBuckets((d) => [...d, { id: uid(), name: 'Fundo de emergência', kind: 'fixed' as const, targetAmount: '', targetDate: '', initialValue: '' }]) }]),
                  ...(hasBucket('Geral') ? [] : [{ text: 'Geral', onClick: () => setBuckets((d) => [...d, { id: uid(), name: 'Geral', kind: 'fixed' as const, targetAmount: '', targetDate: '', initialValue: '' }]) }]),
                  ...(hasBucket('Carro') ? [] : [{ text: 'Carro', onClick: () => setBuckets((d) => [...d, { id: uid(), name: 'Carro', kind: 'fixed' as const, targetAmount: '', targetDate: '', initialValue: '' }]) }]),
                ]}
              />
            </>
          )}

          {step === 'investimento' && (
            <>
              <Bubble
                sub={
                  <>
                    Um <strong className="font-semibold text-text">veículo</strong> é onde está investido o dinheiro (uma
                    corretora, um PPR, certificados). A Contas só acompanha o total e os ganhos. Este passo é opcional:
                    podes saltá-lo e acrescentar mais tarde.
                  </>
                }
              >
                Tens dinheiro investido?
              </Bubble>
              <MartaExample>
                Tem um <strong>PPR</strong> com 3 220 € e põe lá 100 € por mês por débito automático.
              </MartaExample>
              <Card>
                {vehicles.length > 0 && (
                  <ul className="mb-3 divide-y divide-border">
                    {vehicles.map((v) => (
                      <li key={v.id} className="flex items-center justify-between gap-2 py-2">
                        <span className="truncate text-sm">{v.name}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          {v.initialValue && <span className="tnum text-sm text-muted">{v.initialValue}€</span>}
                          <RemoveButton
                            label={`Remover ${v.name}`}
                            onClick={() => setVehicles((d) => d.filter((x) => x.id !== v.id))}
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-2">
                  <Input
                    placeholder="Novo veículo…"
                    value={vehicleName}
                    onChange={(e) => setVehicleName(e.target.value)}
                    className="min-w-0 flex-1"
                  />
                  <Input
                    inputMode="decimal"
                    placeholder="Valor atual (€)"
                    value={vehicleInitial}
                    onChange={(e) => setVehicleInitial(e.target.value)}
                    className="w-full sm:w-32"
                  />
                  <Button variant="soft" onClick={addVehicle} disabled={!vehicleName.trim()}>Adicionar</Button>
                </div>
              </Card>
            </>
          )}

          {step === 'revisao' && (
            <>
              <Bubble sub="Confere o resumo. Tudo isto se pode editar depois em Definições.">
                Está tudo certo?
              </Bubble>
              <Card className="flex flex-col gap-3 text-sm">
                <SummaryRow
                  title="Rendimentos"
                  empty="Sem rendimentos, não consegues planear o mês. Volta atrás para acrescentar."
                  items={incomeSources.map((s) => s.name)}
                />
                <SummaryRow
                  title="Despesas"
                  empty="Sem despesas, não consegues comparar o plano com os gastos."
                  items={expenseCategories.map((c) => c.name)}
                />
                <SummaryRow
                  title="Baldes de poupança"
                  empty="Sem baldes, não há onde alocar a poupança do mês."
                  items={buckets.map((b) => b.name)}
                />
                <SummaryRow title="Investimento" empty="Nenhum veículo por agora." items={vehicles.map((v) => v.name)} />
              </Card>
              <Card className="flex flex-col gap-1.5 bg-accent-soft/60 text-sm leading-relaxed text-text">
                <div className="font-semibold">O que vem a seguir</div>
                <p>
                  Depois de concluíres, mostro-te a Contas numa pequena visita guiada. Para começares com calma,
                  Investimento, Analytics e Projeções abrem aos poucos, ao fim de cerca de 1, 2 e 3 meses de uso.
                  Podes desbloqueá-los já, ou desativar isto, em Definições.
                </p>
              </Card>
            </>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          {stepIdx > 0 ? (
            <Button variant="ghost" onClick={back} disabled={busy}>
              <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
              Voltar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {optional && (
              <Button variant="ghost" onClick={next}>Saltar este passo</Button>
            )}
            {step === 'revisao' ? (
              <Button disabled={busy} onClick={() => void submit()}>
                <Check size={16} strokeWidth={2} aria-hidden="true" />
                Concluir e começar
              </Button>
            ) : (
              <Button onClick={next}>
                {step === 'intro' ? 'Vamos a isso' : 'Continuar'}
                <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SummaryRow({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</div>
      {items.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {items.map((n, i) => (
            <span key={`${n}-${i}`} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-text">{n}</span>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-sm text-warn">{empty}</p>
      )}
    </div>
  )
}

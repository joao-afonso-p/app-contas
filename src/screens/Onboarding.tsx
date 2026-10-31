import { useState } from 'react'
import { ImportBackupCard } from '../components/Backup'
import { InstallGuideCard } from '../components/InstallGuide'
import { RentExplanation } from '../components/RentInfo'
import { IncomeTiming, timingLabel } from '../components/IncomeTiming'
import { Badge, Button, Card, InfoHint, Input, SectionTitle, Select } from '../components/ui'
import { trackEvent } from '../lib/analytics'
import { parseAmount, uid } from '../lib/format'
import { useStore } from '../store/useStore'
import type { BucketKind } from '../types'
import { LogoMark } from '../components/Logo'
import { X } from 'lucide-react'

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

export function Onboarding() {
  const completeOnboarding = useStore((s) => s.completeOnboarding)
  const [busy, setBusy] = useState(false)

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

  const addIncomeSource = () => {
    const name = incomeName.trim()
    if (!name) return
    setIncomeSources((d) => [...d, { id: uid(), name, ...incomeTiming }])
    setIncomeName('')
    setIncomeTiming({ isRent: false })
  }

  const addExpenseCategory = () => {
    const name = expenseName.trim()
    if (!name) return
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
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-6">
      <div className="fade-up w-full max-w-lg py-6">
        <div className="mb-6 text-center">
          <LogoMark size={72} className="mx-auto mb-3 text-text" />
          <h1 className="text-2xl">Vamos começar</h1>
          <p className="mt-1 text-sm text-muted">
            Cria só o que precisas — podes sempre editar tudo depois em Definições. Os valores atuais que
            indicares ficam registados como o saldo no fim do mês passado.
          </p>
        </div>

        <InstallGuideCard />
        <ImportBackupCard />

        <Card className="mb-4">
          <SectionTitle>Fontes de rendimento</SectionTitle>
          <p className="mb-2 text-xs text-muted">De onde entra dinheiro todos os meses — ex.: salário, freelance.</p>
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

        <Card className="mb-4">
          <SectionTitle>Despesas do planeamento</SectionTitle>
          <p className="mb-2 text-xs text-muted">
            As categorias do teu orçamento mensal (ex.: Casa, Carro, Lazer). São também as categorias
            principais dos Gastos — assim consegues comparar o que planeaste com o que realmente gastaste.
            Podes (opcionalmente) detalhar cada uma em subcategorias, por exemplo Casa → Eletricidade, Água,
            Gás. Isto também se faz mais tarde, em Definições.
          </p>
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
                      placeholder="+ subcategoria"
                      className="w-32 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-text placeholder:text-muted focus:border-accent focus:outline-none"
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
            <Button variant="soft" onClick={addExpenseCategory} disabled={!expenseName.trim()}>Adicionar</Button>
          </div>
        </Card>

        <Card className="mb-4">
          <SectionTitle>Baldes de poupança e objetivos</SectionTitle>
          <p className="mb-2 text-xs text-muted">
            Onde guardas o dinheiro poupado — "Fixo" para poupança contínua, "Objetivo" para uma meta com
            valor e data (ex.: carro novo). Nos Gastos também podes escolher um balde como categoria, para
            registar despesas pagas pela poupança (ficam fora do orçamento do mês).
          </p>
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

        <Card className="mb-4">
          <SectionTitle>Veículos de investimento</SectionTitle>
          <p className="mb-2 text-xs text-muted">
            Só para acompanhares o total investido fora da app (ex.: XTB, Certificados de Aforro, ETFs) — o
            dinheiro sai dos baldes mas continua a ser teu.
          </p>
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

        <Button className="w-full" disabled={busy} onClick={() => void submit()}>
          Começar a usar a app
        </Button>
      </div>
    </div>
  )
}

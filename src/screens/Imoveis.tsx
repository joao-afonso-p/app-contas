import { useMemo, useState, type ReactNode } from 'react'
import { Pencil, Plus, Trash } from 'lucide-react'
import { Badge, Button, Card, EmptyState, HoverTip, Input, MetricCard, Modal, SectionTitle, Select, cx } from '../components/ui'
import {
  annualize, combineMonths, grossYield, groupRows, propertyMonths, rangeFor, returnOnCapital, sumMonths,
  type GroupBy, type RangePreset, type RentalTotals,
} from '../lib/calc/rentals'
import { useIsDesktop } from '../lib/useIsDesktop'
import { useSessionState } from '../lib/sessionState'
import { currentMonthKey, fmtEUR, fmtPct, monthLabel, monthShort, parseAmount, uid } from '../lib/format'
import { useStore } from '../store/useStore'
import type { MonthKey, RentalExpenseKind, RentalOneOff, RentalPoint, RentalProperty } from '../types'

type SeriesKey = 'rent' | 'mortgage' | 'fixedCosts' | 'taxRate'

const SERIES: { key: SeriesKey; label: string; unit: 'eur' | 'pct' }[] = [
  { key: 'rent', label: 'Renda mensal', unit: 'eur' },
  { key: 'mortgage', label: 'Prestação mensal', unit: 'eur' },
  { key: 'fixedCosts', label: 'Despesas fixas mensais', unit: 'eur' },
  { key: 'taxRate', label: 'Imposto sobre a renda', unit: 'pct' },
]

const KIND_LABEL: Record<RentalExpenseKind, string> = { manutencao: 'Manutenção', imobiliaria: 'Imobiliária', outro: 'Outro' }

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: 'last12', label: 'Últimos 12 meses' },
  { id: 'year', label: 'Este ano' },
  { id: 'all', label: 'Desde o início' },
]
const GROUPS: { id: GroupBy; label: string }[] = [
  { id: 'month', label: 'Mês' },
  { id: 'quarter', label: 'Trimestre' },
  { id: 'year', label: 'Ano' },
]

const eur = (n: number) => fmtEUR(n)
const pctOf = (f: number) => fmtPct(f * 100)
const signed = (n: number) => (n < 0 ? `−${eur(Math.abs(n))}` : eur(n))
const tone = (n: number) => (n > 0.004 ? 'positive' : n < -0.004 ? 'negative' : 'default')

export function Imoveis() {
  const desktop = useIsDesktop()
  if (!desktop) {
    return (
      <div className="fade-up flex flex-col gap-6">
        <h1 className="text-xl font-black">Imóveis</h1>
        <Card>
          <p className="text-sm text-muted">Esta página está disponível apenas no computador. Abre a app num ecrã maior para ver e editar as tuas casas.</p>
        </Card>
      </div>
    )
  }
  return <ImoveisDesktop />
}

function ImoveisDesktop() {
  const all = useStore((s) => s.data.rentalProperties)
  const put = useStore((s) => s.put)
  const properties = useMemo(() => [...all].filter((p) => !p.archived).sort((a, b) => a.order - b.order), [all])

  const [selRaw, setSel] = useSessionState<string>('imoveis-sel', 'all')
  const [preset, setPreset] = useSessionState<RangePreset>('imoveis-preset', 'last12')
  const [by, setBy] = useSessionState<GroupBy>('imoveis-by', 'month')
  const [adding, setAdding] = useState(false)

  const selected = properties.find((p) => p.id === selRaw)
  const sel = selected ? selected.id : 'all'
  const current = currentMonthKey()
  const scope = selected ? [selected] : properties
  const range = rangeFor(preset, current, scope)

  const items = useMemo(
    () => scope.map((p) => {
      const months = propertyMonths(p, range.from, range.to)
      return { property: p, months, totals: sumMonths(months) }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope.map((p) => p.id).join(','), all, range.from, range.to],
  )
  const monthRows = useMemo(() => combineMonths(items.map((i) => i.months)), [items])
  const totals = useMemo(() => sumMonths(monthRows), [monthRows])
  const groups = useMemo(() => groupRows(monthRows, by), [monthRows, by])
  const hasPrincipal = totals.principal > 0

  async function addHouse(h: RentalProperty) {
    await put('rentalProperties', h)
    setSel(h.id)
    setAdding(false)
  }

  return (
    <div className="fade-up flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black">Imóveis</h1>
        <Button size="sm" onClick={() => setAdding(true)}><Plus size={14} aria-hidden="true" /> Adicionar casa</Button>
      </div>

      {properties.length === 0 ? (
        <Card>
          <EmptyState title="Ainda não tens casas" hint="Adiciona uma casa arrendada para ver o lucro, a margem e o retorno. Podes preencher meses passados." />
          <div className="mt-3 flex justify-center">
            <Button onClick={() => setAdding(true)}><Plus size={14} aria-hidden="true" /> Adicionar casa</Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Chip active={sel === 'all'} onClick={() => setSel('all')}>Todas as casas</Chip>
            {properties.map((p) => (
              <Chip key={p.id} active={sel === p.id} onClick={() => setSel(p.id)}>{p.name}</Chip>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
              {PRESETS.map((x) => (
                <Seg key={x.id} active={preset === x.id} onClick={() => setPreset(x.id)}>{x.label}</Seg>
              ))}
            </div>
            <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
              {GROUPS.map((x) => (
                <Seg key={x.id} active={by === x.id} onClick={() => setBy(x.id)}>{x.label}</Seg>
              ))}
            </div>
            <span className="text-xs text-muted">{monthLabel(range.from)} a {monthLabel(range.to)}</span>
          </div>

          {totals.months === 0 ? (
            <Card><p className="text-sm text-muted">Sem meses a contar neste período (a casa só conta a partir de &quot;a arrendar desde&quot;).</p></Card>
          ) : (
            <>
              <Kpis items={items} totals={totals} />
              {hasPrincipal && <PrincipalLine items={items} totals={totals} />}
              <PeriodTable groups={groups} totals={totals} by={by} showPrincipal={hasPrincipal} />
              {sel === 'all' && properties.length > 1 && <HouseSummary items={items} onOpen={setSel} />}
            </>
          )}

          {selected && <HouseSettings property={selected} onDeleted={() => setSel('all')} />}
        </>
      )}

      {adding && <HouseModal order={Math.max(-1, ...all.map((p) => p.order)) + 1} onClose={() => setAdding(false)} onSave={addHouse} />}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors',
        active ? 'border-accent-strong bg-accent-strong text-white' : 'border-border bg-surface text-text hover:bg-surface-2',
      )}
    >
      {children}
    </button>
  )
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'rounded-lg px-3 py-1 text-xs font-semibold transition-colors',
        active ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text',
      )}
    >
      {children}
    </button>
  )
}

// ---------- KPIs ----------

type Item = { property: RentalProperty; totals: RentalTotals }

function Line({ children }: { children: ReactNode }) {
  return <div className="tnum">{children}</div>
}

function Kpis({ items, totals: t }: { items: Item[]; totals: RentalTotals }) {
  const ret = returnOnCapital(items)
  const yld = grossYield(items)
  const active = items.filter((i) => i.totals.months > 0)
  const usedCap = active.filter((i) => (i.property.capitalInvested ?? 0) > 0)
  const usedVal = active.filter((i) => (i.property.propertyValue ?? 0) > 0)
  const capital = usedCap.reduce((a, i) => a + (i.property.capitalInvested ?? 0), 0)
  const annualNet = usedCap.reduce((a, i) => a + annualize(i.totals.net, i.totals.months), 0)
  const value = usedVal.reduce((a, i) => a + (i.property.propertyValue ?? 0), 0)
  const annualRent = usedVal.reduce((a, i) => a + annualize(i.totals.rent, i.totals.months), 0)

  const partial = (r: { included: number; total: number }) =>
    r.included < r.total ? <div className="mt-1 text-muted">Inclui {r.included} de {r.total} casas (as outras não têm este valor).</div> : null

  return (
    <div className="grid grid-cols-5 gap-3">
      <HoverTip tip={<><div className="mb-1 font-semibold">Lucro bruto</div><div>Renda − prestação − despesas fixas − pontuais</div><Line>{eur(t.rent)} − {eur(t.mortgage)} − {eur(t.fixed)} − {eur(t.oneOff)} = {signed(t.gross)}</Line></>}>
        <MetricCard label="Lucro bruto" value={signed(t.gross)} tone={tone(t.gross)} hint={`${t.months} ${t.months === 1 ? 'mês' : 'meses'}`} />
      </HoverTip>
      <HoverTip tip={<><div className="mb-1 font-semibold">Lucro líquido</div><div>Lucro bruto − imposto sobre a renda</div><Line>{signed(t.gross)} − {eur(t.tax)} = {signed(t.net)}</Line></>}>
        <MetricCard label="Lucro líquido" value={signed(t.net)} tone={tone(t.net)} hint="Depois de impostos" />
      </HoverTip>
      <HoverTip tip={<><div className="mb-1 font-semibold">Margem</div><div>(Renda − prestação − fixas − imposto) ÷ renda. Não conta despesas pontuais.</div><Line>({eur(t.rent)} − {eur(t.mortgage)} − {eur(t.fixed)} − {eur(t.tax)}) ÷ {eur(t.rent)} = {t.margin === null ? '-' : pctOf(t.margin)}</Line></>}>
        <MetricCard label="Margem" value={t.margin === null ? '-' : pctOf(t.margin)} tone={t.margin === null ? 'default' : tone(t.margin)} hint="Sem pontuais" />
      </HoverTip>
      <HoverTip tip={<><div className="mb-1 font-semibold">Retorno sobre o capital investido</div><div>Lucro líquido anualizado ÷ capital investido</div>{ret.value === null ? <div className="mt-1 text-muted">Preenche o capital investido da casa.</div> : <Line>{eur(annualNet)} ÷ {eur(capital)} = {pctOf(ret.value)}</Line>}{partial(ret)}</>}>
        <MetricCard label="Retorno" value={ret.value === null ? '-' : pctOf(ret.value)} tone={ret.value === null ? 'default' : tone(ret.value)} hint={ret.value === null ? 'Falta o capital' : 'Ao ano, sobre o capital'} />
      </HoverTip>
      <HoverTip tip={<><div className="mb-1 font-semibold">Rentabilidade bruta</div><div>Renda anualizada ÷ valor do imóvel</div>{yld.value === null ? <div className="mt-1 text-muted">Preenche o valor do imóvel.</div> : <Line>{eur(annualRent)} ÷ {eur(value)} = {pctOf(yld.value)}</Line>}{partial(yld)}</>}>
        <MetricCard label="Rentabilidade bruta" value={yld.value === null ? '-' : pctOf(yld.value)} hint={yld.value === null ? 'Falta o valor' : 'Ao ano, sobre o valor'} />
      </HoverTip>
    </div>
  )
}

// Só aparece quando alguma prestação tem o capital amortizado preenchido.
function PrincipalLine({ items, totals: t }: { items: Item[]; totals: RentalTotals }) {
  const n = items.filter((i) => i.totals.principal > 0).length
  const total = items.filter((i) => i.totals.months > 0).length
  return (
    <HoverTip
      tip={<><div className="mb-1 font-semibold">Capital amortizado</div><div>Parte das prestações que reduz a dívida (já está contada como custo no lucro).</div><Line>{signed(t.net)} + {eur(t.principal)} = {signed(t.net + t.principal)}</Line></>}
    >
      <Card className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3 text-sm">
        <span><span className="text-muted">Capital amortizado:</span> <strong className="tnum">{eur(t.principal)}</strong></span>
        <span><span className="text-muted">Lucro líquido + capital amortizado:</span> <strong className="tnum">{signed(t.net + t.principal)}</strong></span>
        {n < total && <span className="text-xs text-muted">Inclui {n} de {total} casas</span>}
      </Card>
    </HoverTip>
  )
}

// ---------- Tabela por período ----------

function Th({ children, tip, left }: { children: ReactNode; tip?: ReactNode; left?: boolean }) {
  return (
    <th className={cx('px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted', left ? 'text-left' : 'text-right')}>
      {tip ? <HoverTip as="span" tip={tip} className="cursor-help border-b border-dotted border-muted">{children}</HoverTip> : children}
    </th>
  )
}

function PeriodTable({
  groups, totals, by, showPrincipal,
}: { groups: { key: string; label: string; totals: RentalTotals }[]; totals: RentalTotals; by: GroupBy; showPrincipal: boolean }) {
  const label = (g: { key: string; label: string }) => (by === 'month' ? monthShort(g.key as MonthKey) : g.label)
  const row = (name: string, t: RentalTotals, strong?: boolean) => (
    <tr key={name} className={cx('border-t border-border', strong && 'bg-surface-2 font-bold')}>
      <td className="px-3 py-2 text-left">{name}</td>
      <td className="tnum px-3 py-2 text-right">{eur(t.rent)}</td>
      <td className="tnum px-3 py-2 text-right">{eur(t.mortgage)}</td>
      <td className="tnum px-3 py-2 text-right">{eur(t.fixed)}</td>
      <td className="tnum px-3 py-2 text-right">{eur(t.oneOff)}</td>
      <td className="tnum px-3 py-2 text-right">{eur(t.tax)}</td>
      <td className={cx('tnum px-3 py-2 text-right', t.gross < 0 && 'text-negative')}>{signed(t.gross)}</td>
      <td className={cx('tnum px-3 py-2 text-right', t.net < 0 && 'text-negative')}>{signed(t.net)}</td>
      {showPrincipal && <td className="tnum px-3 py-2 text-right text-muted">{t.principal > 0 ? eur(t.principal) : '-'}</td>}
    </tr>
  )
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <Th left>Período</Th>
            <Th tip="Renda mensal em vigor em cada mês.">Renda</Th>
            <Th tip="Prestação do crédito em vigor em cada mês.">Prestação</Th>
            <Th tip="Despesas fixas mensais (condomínio, seguro, IMI, etc.).">Fixas</Th>
            <Th tip="Despesas pontuais (manutenção, imobiliária, outras) lançadas neste período.">Pontuais</Th>
            <Th tip="Renda × taxa de imposto em vigor.">Imposto</Th>
            <Th tip="Renda − prestação − fixas − pontuais.">Lucro bruto</Th>
            <Th tip="Lucro bruto − imposto.">Lucro líquido</Th>
            {showPrincipal && <Th tip="Parte da prestação que amortiza a dívida. Já está incluída na prestação.">Amortizado</Th>}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => row(label(g), g.totals))}
          {row('Total', totals, true)}
        </tbody>
      </table>
    </Card>
  )
}

// ---------- Resumo por casa (em "Todas") ----------

function HouseSummary({ items, onOpen }: { items: Item[]; onOpen: (id: string) => void }) {
  return (
    <div>
      <SectionTitle>Por casa</SectionTitle>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <Th left>Casa</Th>
              <Th>Renda</Th>
              <Th>Lucro bruto</Th>
              <Th>Lucro líquido</Th>
              <Th>Margem</Th>
              <Th>Retorno</Th>
              <Th>Rent. bruta</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const ret = returnOnCapital([i])
              const yld = grossYield([i])
              const t = i.totals
              return (
                <tr key={i.property.id} onClick={() => onOpen(i.property.id)} className="cursor-pointer border-t border-border hover:bg-surface-2">
                  <td className="px-3 py-2 text-left font-semibold">{i.property.name}</td>
                  <td className="tnum px-3 py-2 text-right">{eur(t.rent)}</td>
                  <td className={cx('tnum px-3 py-2 text-right', t.gross < 0 && 'text-negative')}>{signed(t.gross)}</td>
                  <td className={cx('tnum px-3 py-2 text-right', t.net < 0 && 'text-negative')}>{signed(t.net)}</td>
                  <td className="tnum px-3 py-2 text-right">{t.margin === null ? '-' : pctOf(t.margin)}</td>
                  <td className="tnum px-3 py-2 text-right">{ret.value === null ? '-' : pctOf(ret.value)}</td>
                  <td className="tnum px-3 py-2 text-right">{yld.value === null ? '-' : pctOf(yld.value)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

// ---------- Definições de uma casa ----------

function fmtPoint(key: SeriesKey, p: RentalPoint): string {
  if (key === 'taxRate') return fmtPct(p.value)
  return eur(p.value)
}

function HouseSettings({ property: p, onDeleted }: { property: RentalProperty; onDeleted: () => void }) {
  const put = useStore((s) => s.put)
  const remove = useStore((s) => s.remove)
  const [editHouse, setEditHouse] = useState(false)
  const [point, setPoint] = useState<{ key: SeriesKey; existing?: RentalPoint } | null>(null)
  const [oneOff, setOneOff] = useState<{ existing?: RentalOneOff } | null>(null)

  const save = (patch: Partial<RentalProperty>) => put('rentalProperties', { ...p, ...patch })

  function removePoint(key: SeriesKey, from: MonthKey) {
    if (p[key].length <= 1 && key === 'rent') {
      window.alert('A renda precisa de pelo menos um valor. Edita-o em vez de o apagar.')
      return
    }
    void save({ [key]: p[key].filter((x) => x.from !== from) } as Partial<RentalProperty>)
  }

  function removeHouse() {
    if (!window.confirm(`Apagar "${p.name}" e todos os seus valores? Esta ação não se pode desfazer.`)) return
    void remove('rentalProperties', p.id).then(onDeleted)
  }

  const oneOffs = [...p.oneOffs].sort((a, b) => b.month.localeCompare(a.month))

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle
        right={
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditHouse(true)}><Pencil size={13} aria-hidden="true" /> Editar casa</Button>
            <Button size="sm" variant="danger" onClick={removeHouse}><Trash size={13} aria-hidden="true" /> Apagar</Button>
          </div>
        }
      >
        {p.name}
      </SectionTitle>

      <Card>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div><div className="text-xs text-muted">A arrendar desde</div><div className="font-semibold">{monthLabel(p.rentedFrom, true)}</div></div>
          <div><div className="text-xs text-muted">Capital investido</div><div className="tnum font-semibold">{p.capitalInvested ? eur(p.capitalInvested) : '-'}</div></div>
          <div><div className="text-xs text-muted">Valor do imóvel</div><div className="tnum font-semibold">{p.propertyValue ? eur(p.propertyValue) : '-'}</div></div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        {SERIES.map((s) => {
          const pts = [...p[s.key]].sort((a, b) => a.from.localeCompare(b.from))
          return (
            <Card key={s.key}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{s.label}</h3>
                <Button size="sm" variant="soft" onClick={() => setPoint({ key: s.key })}><Plus size={13} aria-hidden="true" /> A partir de…</Button>
              </div>
              {pts.length === 0 ? (
                <p className="text-xs text-muted">Sem valor (conta como 0).</p>
              ) : (
                <ul className="flex flex-col">
                  {pts.map((pt) => (
                    <li key={pt.from} className="flex items-center justify-between gap-2 border-t border-border py-1.5 text-sm first:border-t-0">
                      <span className="text-muted">Desde {monthLabel(pt.from)}</span>
                      <span className="flex items-center gap-2">
                        <span className="tnum font-semibold">{fmtPoint(s.key, pt)}</span>
                        {s.key === 'mortgage' && pt.principal !== undefined && <Badge>capital {eur(pt.principal)}</Badge>}
                        <button type="button" aria-label="Editar" onClick={() => setPoint({ key: s.key, existing: pt })} className="rounded-lg p-1 text-muted hover:bg-surface-2"><Pencil size={13} aria-hidden="true" /></button>
                        <button type="button" aria-label="Apagar" onClick={() => removePoint(s.key, pt.from)} className="rounded-lg p-1 text-muted hover:bg-surface-2"><Trash size={13} aria-hidden="true" /></button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )
        })}
      </div>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Despesas pontuais</h3>
          <Button size="sm" variant="soft" onClick={() => setOneOff({})}><Plus size={13} aria-hidden="true" /> Adicionar</Button>
        </div>
        {oneOffs.length === 0 ? (
          <p className="text-xs text-muted">Sem despesas pontuais.</p>
        ) : (
          <ul className="flex flex-col">
            {oneOffs.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 border-t border-border py-1.5 text-sm first:border-t-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="text-muted">{monthLabel(o.month)}</span>
                  <Badge>{KIND_LABEL[o.kind]}</Badge>
                  {o.note && <span className="truncate text-muted">{o.note}</span>}
                </span>
                <span className="flex items-center gap-2">
                  <span className="tnum font-semibold">{eur(o.amount)}</span>
                  <button type="button" aria-label="Editar" onClick={() => setOneOff({ existing: o })} className="rounded-lg p-1 text-muted hover:bg-surface-2"><Pencil size={13} aria-hidden="true" /></button>
                  <button type="button" aria-label="Apagar" onClick={() => void save({ oneOffs: p.oneOffs.filter((x) => x.id !== o.id) })} className="rounded-lg p-1 text-muted hover:bg-surface-2"><Trash size={13} aria-hidden="true" /></button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editHouse && (
        <HouseModal
          property={p}
          order={p.order}
          onClose={() => setEditHouse(false)}
          onSave={async (h) => { await save({ name: h.name, rentedFrom: h.rentedFrom, capitalInvested: h.capitalInvested, propertyValue: h.propertyValue }); setEditHouse(false) }}
        />
      )}
      {point && (
        <PointModal
          series={SERIES.find((s) => s.key === point.key)!}
          existing={point.existing}
          defaultFrom={p.rentedFrom}
          onClose={() => setPoint(null)}
          onSave={async (pt) => {
            const rest = p[point.key].filter((x) => x.from !== pt.from && x.from !== point.existing?.from)
            await save({ [point.key]: [...rest, pt].sort((a, b) => a.from.localeCompare(b.from)) } as Partial<RentalProperty>)
            setPoint(null)
          }}
        />
      )}
      {oneOff && (
        <OneOffModal
          existing={oneOff.existing}
          onClose={() => setOneOff(null)}
          onSave={async (o) => {
            await save({ oneOffs: [...p.oneOffs.filter((x) => x.id !== o.id), o] })
            setOneOff(null)
          }}
        />
      )}
    </div>
  )
}

// ---------- Modais ----------

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  )
}

const numText = (n: number | undefined) => (n === undefined ? '' : String(n).replace('.', ','))

// Nova casa (com os valores iniciais) ou edição dos dados da casa (nome, desde quando, capital, valor).
function HouseModal({
  property, order, onClose, onSave,
}: { property?: RentalProperty; order: number; onClose: () => void; onSave: (h: RentalProperty) => void | Promise<void> }) {
  const isNew = !property
  const [name, setName] = useState(property?.name ?? '')
  const [from, setFrom] = useState<string>(property?.rentedFrom ?? currentMonthKey())
  const [rent, setRent] = useState('')
  const [mortgage, setMortgage] = useState('')
  const [fixed, setFixed] = useState('')
  const [tax, setTax] = useState('')
  const [capital, setCapital] = useState(numText(property?.capitalInvested))
  const [value, setValue] = useState(numText(property?.propertyValue))

  const rentN = parseAmount(rent)
  const valid = name.trim() !== '' && /^\d{4}-\d{2}$/.test(from) && (!isNew || (rentN !== null && rentN >= 0))

  function submit() {
    if (!valid) return
    const cap = parseAmount(capital)
    const val = parseAmount(value)
    const at = (v: string, allowZero = false): RentalPoint[] => {
      const n = parseAmount(v)
      return n !== null && (n > 0 || allowZero) ? [{ from, value: n }] : []
    }
    const base: RentalProperty = property ?? {
      id: uid(), name: '', rentedFrom: from, rent: [], mortgage: [], fixedCosts: [], taxRate: [], oneOffs: [], order,
    }
    void onSave({
      ...base,
      name: name.trim(),
      rentedFrom: from,
      capitalInvested: cap !== null && cap > 0 ? cap : undefined,
      propertyValue: val !== null && val > 0 ? val : undefined,
      ...(isNew ? { rent: at(rent, true), mortgage: at(mortgage), fixedCosts: at(fixed), taxRate: at(tax) } : {}),
    })
  }

  return (
    <Modal open onClose={onClose} title={isNew ? 'Adicionar casa' : 'Editar casa'}>
      <div className="flex flex-col gap-3">
        <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Casa do Porto" autoFocus /></Field>
        <Field label="A arrendar desde" hint="Os meses anteriores não contam. Podes ir para trás no tempo.">
          <Input type="month" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        {isNew && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Renda mensal (€)"><Input inputMode="decimal" value={rent} onChange={(e) => setRent(e.target.value)} /></Field>
              <Field label="Prestação mensal (€)"><Input inputMode="decimal" value={mortgage} onChange={(e) => setMortgage(e.target.value)} placeholder="Opcional" /></Field>
              <Field label="Despesas fixas mensais (€)"><Input inputMode="decimal" value={fixed} onChange={(e) => setFixed(e.target.value)} placeholder="Opcional" /></Field>
              <Field label="Imposto sobre a renda (%)"><Input inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} placeholder="Ex.: 25" /></Field>
            </div>
            <p className="text-xs text-muted">Estes valores valem desde o mês escolhido. Depois podes acrescentar mudanças &quot;a partir de…&quot;.</p>
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Capital investido (€)" hint="Entrada, obras, etc. Para o retorno.">
            <Input inputMode="decimal" value={capital} onChange={(e) => setCapital(e.target.value)} placeholder="Opcional" />
          </Field>
          <Field label="Valor do imóvel (€)" hint="Para a rentabilidade bruta.">
            <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Opcional" />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={!valid}>{isNew ? 'Adicionar' : 'Guardar'}</Button>
        </div>
      </div>
    </Modal>
  )
}

function PointModal({
  series, existing, defaultFrom, onClose, onSave,
}: {
  series: { key: SeriesKey; label: string; unit: 'eur' | 'pct' }
  existing?: RentalPoint
  defaultFrom: MonthKey
  onClose: () => void
  onSave: (p: RentalPoint) => void | Promise<void>
}) {
  const [from, setFrom] = useState<string>(existing?.from ?? currentMonthKey())
  const [value, setValue] = useState(numText(existing?.value))
  const [principal, setPrincipal] = useState(numText(existing?.principal))
  const n = parseAmount(value)
  const pr = parseAmount(principal)
  const valid = n !== null && n >= 0 && /^\d{4}-\d{2}$/.test(from) && from >= defaultFrom && (series.key !== 'mortgage' || pr === null || (pr >= 0 && pr <= n))

  function submit() {
    if (!valid || n === null) return
    void onSave({ from, value: n, ...(series.key === 'mortgage' && pr !== null ? { principal: pr } : {}) })
  }

  return (
    <Modal open onClose={onClose} title={series.label}>
      <div className="flex flex-col gap-3">
        <Field label="A partir de" hint={from < defaultFrom ? 'Não pode ser antes de "a arrendar desde".' : 'Vale desde este mês até à próxima mudança.'}>
          <Input type="month" value={from} min={defaultFrom} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label={series.unit === 'pct' ? 'Taxa (%)' : 'Valor mensal (€)'}>
          <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        </Field>
        {series.key === 'mortgage' && (
          <Field label="Capital amortizado por mês (€)" hint="Opcional. Parte da prestação que reduz a dívida; não muda o lucro.">
            <Input inputMode="decimal" value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="Opcional" />
          </Field>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={!valid}>Guardar</Button>
        </div>
      </div>
    </Modal>
  )
}

function OneOffModal({
  existing, onClose, onSave,
}: { existing?: RentalOneOff; onClose: () => void; onSave: (o: RentalOneOff) => void | Promise<void> }) {
  const [month, setMonth] = useState<string>(existing?.month ?? currentMonthKey())
  const [amount, setAmount] = useState(numText(existing?.amount))
  const [kind, setKind] = useState<RentalExpenseKind>(existing?.kind ?? 'manutencao')
  const [note, setNote] = useState(existing?.note ?? '')
  const n = parseAmount(amount)
  const valid = n !== null && n > 0 && /^\d{4}-\d{2}$/.test(month)

  return (
    <Modal open onClose={onClose} title={existing ? 'Editar despesa pontual' : 'Despesa pontual'}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mês"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
          <Field label="Valor (€)"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
        </div>
        <Field label="Tipo">
          <Select value={kind} onChange={(e) => setKind(e.target.value as RentalExpenseKind)}>
            {(Object.keys(KIND_LABEL) as RentalExpenseKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </Select>
        </Field>
        <Field label="Nota"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" /></Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={!valid}
            onClick={() => n !== null && void onSave({ id: existing?.id ?? uid(), month, amount: n, kind, note: note.trim() })}
          >
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

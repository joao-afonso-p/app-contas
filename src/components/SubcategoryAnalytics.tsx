import { useMemo, useState } from 'react'
import { expenseBreakdown } from '../lib/calc/breakdown'
import type { MonthReport } from '../lib/calc/planVsActual'
import type { MonthKey } from '../types'
import { BreakdownPanel } from './BreakdownPanel'
import { SectionTitle, Select } from './ui'

// "Em que é que gasto?": por defeito, tudo ao nível mais fino (categoria ›
// subcategoria); ou escolhe uma categoria para ver só as suas subcategorias.
export function SubcategoryAnalytics({
  month, months, reports,
}: { month: MonthKey; months: MonthKey[]; reports: Map<MonthKey, MonthReport> }) {
  const [groupId, setGroupId] = useState<string>('all')

  // Categorias de despesa com gasto na janela (e se têm subcategorias).
  const options = useMemo(() => {
    const acc = new Map<string, { id: string; name: string; order: number; spent: number; hasSubs: boolean }>()
    for (const m of months) {
      for (const row of reports.get(m)?.rows ?? []) {
        if (row.spent <= 0) continue
        const cur = acc.get(row.group.id) ?? { id: row.group.id, name: row.group.name, order: row.group.order, spent: 0, hasSubs: false }
        cur.spent += row.spent
        if (row.subs.some((s) => s.id !== '')) cur.hasSubs = true
        acc.set(row.group.id, cur)
      }
    }
    return [...acc.values()].sort((a, b) => a.order - b.order)
  }, [months, reports])

  const effective = groupId === 'all' || options.some((o) => o.id === groupId) ? groupId : 'all'
  const series = useMemo(() => expenseBreakdown(reports, months, effective), [reports, months, effective])
  const selectedHasSubs = effective === 'all' || options.find((o) => o.id === effective)?.hasSubs

  return (
    <section>
      <SectionTitle>Gastos por subcategoria</SectionTitle>
      <BreakdownPanel
        title={effective === 'all' ? 'Para onde vai o dinheiro (categoria › subcategoria)' : 'Subcategorias'}
        controls={
          <Select value={effective} onChange={(e) => setGroupId(e.target.value)} className="py-1.5 text-xs">
            <option value="all">Todas as despesas</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.name}{o.hasSubs ? '' : ' (sem subcategorias)'}</option>
            ))}
          </Select>
        }
        series={series}
        months={months}
        month={month}
        valueLabel="Gasto"
        emptyHint={selectedHasSubs === false ? 'Cria subcategorias em Definições e classifica os gastos para veres o detalhe.' : 'Regista gastos em Gastos para veres a análise aqui.'}
      />
      {effective !== 'all' && selectedHasSubs === false && (
        <p className="mt-2 text-xs text-muted">
          Esta categoria ainda não tem subcategorias nos gastos — cria-as em Definições → Subcategorias e
          escolhe-as na lista de Gastos.
        </p>
      )}
    </section>
  )
}

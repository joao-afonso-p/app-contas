import type { CollectionName, DataSet, MonthKey } from '../../types'

// Arquivar/apagar itens do planeamento (fontes de income, despesas, baldes,
// veículos). Um item arquivado deixa de aparecer, mas se ainda tiver valor
// alocado no plano/projeções, esse valor continuava a somar para os 100%
// sem ninguém o poder editar. Por isso: (1) só se arquiva/apaga sem alocação
// no mês atual e seguintes; (2) itens já arquivados mas com alocação ficam
// visíveis (marcados) onde o valor conta, para poderem ser corrigidos.

export type PlanSection = 'income' | 'expenses' | 'savings' | 'autoInvestments'

export const SECTION_OF: Partial<Record<CollectionName, PlanSection>> = {
  incomeSources: 'income',
  expenseCategories: 'expenses',
  savingsBuckets: 'savings',
  investmentVehicles: 'autoInvestments',
}

type PlanLike = Partial<Record<PlanSection, Record<string, number> | undefined>> & { id: MonthKey }

const valueOf = (plan: PlanLike, section: PlanSection, id: string): number => plan[section]?.[id] ?? 0

// Meses (>= fromMonth) em que o item ainda tem valor alocado, no plano real
// e/ou nas projeções.
export function allocatedMonths(
  d: Pick<DataSet, 'monthlyPlans' | 'projectionPlans'>,
  section: PlanSection,
  id: string,
  fromMonth: MonthKey,
): { planeamento: MonthKey[]; projecoes: MonthKey[] } {
  const pick = (plans: PlanLike[]) =>
    plans
      .filter((p) => p.id >= fromMonth && Math.abs(valueOf(p, section, id)) > 0.004)
      .map((p) => p.id)
      .sort()
  return { planeamento: pick(d.monthlyPlans), projecoes: pick(d.projectionPlans) }
}

export function isAllocated(
  d: Pick<DataSet, 'monthlyPlans' | 'projectionPlans'>,
  section: PlanSection,
  id: string,
  fromMonth: MonthKey,
): boolean {
  const { planeamento, projecoes } = allocatedMonths(d, section, id, fromMonth)
  return planeamento.length + projecoes.length > 0
}

interface Listed {
  id: string
  archived: boolean
  order: number
}

// Itens ativos + arquivados que ainda têm valor nalgum dos planos dados.
export function withResidual<T extends Listed>(all: T[], plans: PlanLike[], section: PlanSection): (T & { residual?: boolean })[] {
  const sorted = [...all].sort((a, b) => a.order - b.order)
  const out: (T & { residual?: boolean })[] = []
  for (const doc of sorted) {
    if (!doc.archived) out.push(doc)
    else if (plans.some((p) => Math.abs(valueOf(p, section, doc.id)) > 0.004)) out.push({ ...doc, residual: true })
  }
  return out
}

// Cópia de um plano só com itens ativos — usada ao copiar o plano de um mês
// para o seguinte, para que valores de itens arquivados/apagados não "viajem".
export function activeOnly<
  P extends { income: Record<string, number>; expenses: Record<string, number>; savings: Record<string, number>; autoInvestments?: Record<string, number> },
>(plan: P, d: Pick<DataSet, 'incomeSources' | 'expenseCategories' | 'savingsBuckets' | 'investmentVehicles'>): P {
  const keep = (rec: Record<string, number> | undefined, docs: { id: string; archived: boolean }[]) => {
    const ok = new Set(docs.filter((x) => !x.archived).map((x) => x.id))
    return Object.fromEntries(Object.entries(rec ?? {}).filter(([id]) => ok.has(id)))
  }
  return {
    ...plan,
    income: keep(plan.income, d.incomeSources),
    expenses: keep(plan.expenses, d.expenseCategories),
    savings: keep(plan.savings, d.savingsBuckets),
    autoInvestments: keep(plan.autoInvestments, d.investmentVehicles),
  }
}

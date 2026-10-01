import { fmtEUR } from '../lib/format'

// Explicação partilhada do que é uma "renda" e porque é descontada do valor a
// transferir para a poupança (ver IncomeSource.isRent / allocationSummary).
export function RentExplanation() {
  return (
    <div className="flex flex-col gap-1.5">
      <p>
        <strong>Renda</strong> é um income que só chega <strong>a meio do mês</strong>, depois do salário — ex.: a
        renda de uma casa arrendada.
      </p>
      <p>
        A transferência para a poupança faz-se logo quando entra o salário, e nesse dia a renda ainda não chegou.
        Por isso é <strong>descontada do valor a transferir</strong>: transferes só a diferença e, quando a renda
        chegar, vai direta para a poupança.
      </p>
      <p className="text-muted">
        Continua a contar para o total de income e para a alocação de 100% — muda apenas o que transferes à mão.
      </p>
    </div>
  )
}

// Detalhe do cálculo do cartão "Transferir para a poupança".
export function TransferToSavingsExplanation({
  totalSavings,
  rentIncome,
  transferToSavings,
}: {
  totalSavings: number
  rentIncome: number
  transferToSavings: number
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p>Quanto transferir da conta corrente para a poupança quando entra o salário.</p>
      <div className="tnum flex flex-col gap-0.5 rounded-lg bg-surface-2 px-2 py-1.5">
        <div className="flex justify-between gap-2">
          <span>Poupanças do mês</span>
          <span>{fmtEUR(totalSavings)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>− Rendas</span>
          <span>{fmtEUR(rentIncome)}</span>
        </div>
        <div className="flex justify-between gap-2 border-t border-border pt-0.5 font-semibold">
          <span>= A transferir agora</span>
          <span>{fmtEUR(transferToSavings)}</span>
        </div>
      </div>
      <p>
        As rendas chegam a meio do mês, depois do salário — por isso não as transferes agora: quando chegarem vão
        diretas para a poupança. No fim do mês, a poupança recebe o total de {fmtEUR(totalSavings)}.
      </p>
      <p className="text-muted">Marca/desmarca o que é renda nas fontes de income (Definições).</p>
    </div>
  )
}

import { fmtEUR } from '../lib/format'

// Explicação partilhada de "Quando chega?" e de porque é que um income que chega
// depois não entra na transferência de agora (ver IncomeSource.isRent / allocationSummary).
export function RentExplanation() {
  return (
    <div className="flex flex-col gap-1.5">
      <p>
        <strong>Quando chega?</strong> Faz a transferência do mês para a poupança quando entra o salário. Se um
        income (ex.: a renda de uma casa) só chega <strong>depois</strong> disso, escolhe "Chega depois".
      </p>
      <p>
        Esse valor não entra na transferência de agora: transferes só o resto e, quando ele chegar, passas-o para a
        poupança. Se chega com o salário (ou antes de aplicares o plano), deixa em "Chega com o salário".
      </p>
      <p className="text-muted">
        Conta sempre para o total de income e para a alocação de 100%. O dia previsto é só um lembrete.
      </p>
    </div>
  )
}

// Detalhe do cálculo do cartão "Transferir agora".
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
          <span>− Chega depois</span>
          <span>{fmtEUR(rentIncome)}</span>
        </div>
        <div className="flex justify-between gap-2 border-t border-border pt-0.5 font-semibold">
          <span>= Transferir agora</span>
          <span>{fmtEUR(transferToSavings)}</span>
        </div>
      </div>
      <p>
        O valor "chega depois" transfere-se quando entrar. No fim, a poupança recebe o total de {fmtEUR(totalSavings)}.
      </p>
      <p className="text-muted">Define o que chega depois nas fontes de income (Definições).</p>
    </div>
  )
}

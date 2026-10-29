import { Button, Modal } from './ui'
import { monthLabel } from '../lib/format'
import type { MonthKey } from '../types'

// Explica porque não se pode arquivar/apagar um item ainda alocado e leva o
// utilizador a corrigir (Planeamento / Projeções).
export function ArchiveBlockedModal({
  name, action, planeamento, projecoes, onClose, onGo,
}: {
  name: string
  action: 'arquivar' | 'apagar'
  planeamento: MonthKey[]
  projecoes: MonthKey[]
  onClose: () => void
  onGo: (screen: 'planeamento' | 'projecoes') => void
}) {
  const list = (ms: MonthKey[]) => ms.map((m) => monthLabel(m)).join(', ')
  return (
    <Modal open onClose={onClose} title={`Não é possível ${action} "${name}"`}>
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-muted">
          Ainda tem valor alocado no mês atual ou em meses futuros. Põe-no a 0 (ou passa o valor para outra
          linha, por exemplo a nova) e depois volta aqui — assim os 100% do plano ficam sempre certos.
        </p>
        {planeamento.length > 0 && (
          <p><strong>Planeamento:</strong> {list(planeamento)}</p>
        )}
        {projecoes.length > 0 && (
          <p><strong>Projeções:</strong> {list(projecoes)}</p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Fechar</Button>
          {projecoes.length > 0 && <Button variant="soft" size="sm" onClick={() => onGo('projecoes')}>Ir para Projeções</Button>}
          {planeamento.length > 0 && <Button size="sm" onClick={() => onGo('planeamento')}>Ir para Planeamento</Button>}
        </div>
      </div>
    </Modal>
  )
}

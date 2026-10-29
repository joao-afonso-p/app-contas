import { Input, Select } from './ui'

// Escolha "Quando chega?" de uma fonte de income. Guarda-se em isRent
// (true = chega depois da transferência do mês) + dia previsto opcional.
export function IncomeTiming({
  isRent,
  expectedDay,
  onChange,
}: {
  isRent: boolean
  expectedDay?: number
  onChange: (next: { isRent: boolean; expectedDay?: number }) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Select
        value={isRent ? 'later' : 'with'}
        onChange={(e) => {
          const later = e.target.value === 'later'
          onChange({ isRent: later, expectedDay: later ? expectedDay : undefined })
        }}
        aria-label="Quando chega?"
        className="py-1.5 text-xs"
      >
        <option value="with">Chega com o salário</option>
        <option value="later">Chega depois</option>
      </Select>
      {isRent && (
        <Input
          type="number"
          min={1}
          max={31}
          inputMode="numeric"
          placeholder="dia"
          aria-label="Dia previsto"
          value={expectedDay ?? ''}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10)
            onChange({ isRent, expectedDay: Number.isFinite(n) ? Math.min(31, Math.max(1, n)) : undefined })
          }}
          className="w-16 py-1.5 text-xs"
        />
      )}
    </div>
  )
}

export const timingLabel = (expectedDay?: number): string =>
  expectedDay ? `Chega depois · ~dia ${expectedDay}` : 'Chega depois'

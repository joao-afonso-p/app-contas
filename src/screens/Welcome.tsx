import { useState } from 'react'
import { Button, Card, Input } from '../components/ui'
import { useStore } from '../store/useStore'

export function Welcome() {
  const chooseLocal = useStore((s) => s.chooseLocal)
  const joinSpace = useStore((s) => s.joinSpace)
  const firebaseAvailable = useStore((s) => s.firebaseAvailable)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const join = async () => {
    setBusy(true)
    setError('')
    try {
      await joinSpace(code, true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível entrar no espaço')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-6">
      <div className="fade-up w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-strong text-2xl font-black text-white">
            €
          </div>
          <h1 className="text-2xl font-black">Contas</h1>
          <p className="mt-1 text-sm text-muted">As finanças da família, sem folhas de Excel.</p>
        </div>

        <Card className="mb-4">
          <h2 className="font-bold">Usar localmente</h2>
          <p className="mb-3 mt-1 text-sm text-muted">
            Os dados ficam só neste dispositivo. Podes ligar a um espaço partilhado mais tarde.
            A seguir vais passar por um pequeno onboarding para criares as tuas categorias, baldes e veículos.
          </p>
          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => void chooseLocal()}>Começar</Button>
          </div>
        </Card>

        <Card>
          <h2 className="font-bold">Entrar num espaço partilhado</h2>
          <p className="mb-3 mt-1 text-sm text-muted">
            Introduz o código de espaço para sincronizar entre dispositivos.
            {!firebaseAvailable && ' (Indisponível: falta configurar o Firebase no .env)'}
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="k7m2-9xqa-4pl3-vn8w"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={!firebaseAvailable || busy}
            />
            <Button disabled={!firebaseAvailable || busy || !code.trim()} onClick={() => void join()}>
              {busy ? '…' : 'Entrar'}
            </Button>
          </div>
          {error && <p className="mt-2 text-sm text-negative">{error}</p>}
        </Card>
      </div>
    </div>
  )
}

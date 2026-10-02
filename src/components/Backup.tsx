import { useRef, useState } from 'react'
import { Button, Card } from './ui'
import { trackEvent } from '../lib/analytics'
import { backupFileName, backupSummary, parseBackup, serializeBackup } from '../lib/backup'
import { deliverFile } from '../lib/download'
import { useStore } from '../store/useStore'
import type { DataSet } from '../types'

// Guia passo a passo (colapsável) para quem quer mudar de dispositivo.
export function MoveDeviceGuide() {
  return (
    <details className="mt-3 rounded-xl bg-surface-2 p-3 text-xs text-muted">
      <summary className="cursor-pointer text-sm font-semibold text-text">Como mudar de dispositivo?</summary>
      <ol className="mt-2 list-decimal space-y-2 pl-4 leading-relaxed">
        <li>
          <strong className="text-text">No dispositivo antigo:</strong> vai a Definições → Dados e carrega em
          &quot;Exportar dados&quot;. No iPhone abre-se o menu de partilha: escolhe &quot;Guardar em Ficheiros&quot;,
          envia por AirDrop, ou por email/WhatsApp para ti próprio. No computador, o ficheiro fica na pasta
          Transferências.
        </li>
        <li>
          <strong className="text-text">Passa o ficheiro</strong> para o dispositivo novo (AirDrop, email, WhatsApp,
          Google Drive, pen…).
        </li>
        <li>
          <strong className="text-text">No dispositivo novo:</strong> abre a app, escolhe &quot;Usar localmente&quot; e,
          no ecrã &quot;Vamos começar&quot;, carrega em &quot;Importar cópia de segurança&quot; e escolhe o ficheiro
          (chama-se contas-backup-AAAA-MM-DD.json).
        </li>
      </ol>
      <ul className="mt-3 list-disc space-y-1 pl-4 leading-relaxed">
        <li>O ficheiro contém os teus dados financeiros — guarda-o em privado e apaga-o quando já não for preciso.</li>
        <li>É uma fotografia do momento: alterações feitas no dispositivo antigo depois de exportar não vão incluídas.</li>
        <li>Importar substitui tudo o que estiver no dispositivo onde importas.</li>
      </ul>
    </details>
  )
}

export function ExportBackupButton() {
  const data = useStore((s) => s.data)
  const mode = useStore((s) => s.mode)
  const [error, setError] = useState('')
  if (mode !== 'local') return null

  const doExport = async () => {
    setError('')
    try {
      await deliverFile(backupFileName(), serializeBackup(data))
      trackEvent('backup-export')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível exportar os dados.')
    }
  }

  return (
    <div>
      <Button variant="soft" size="sm" onClick={() => void doExport()}>
        Exportar dados
      </Button>
      {error && <p className="mt-2 text-xs text-negative">{error}</p>}
    </div>
  )
}

function SummaryLine({ data }: { data: DataSet }) {
  const s = backupSummary(data)
  const parts = [
    `${s.monthsPlanned} meses planeados`,
    `${s.savingsMovements} movimentos de poupança`,
    `${s.transactions} gastos`,
    `${s.buckets} baldes`,
    `${s.categories} categorias`,
  ]
  return <p className="text-sm">{parts.join(' · ')}</p>
}

// Seleciona um ficheiro, valida-o, mostra um resumo e (após confirmação) importa.
// `confirmFirst` pede uma confirmação extra (Definições, onde já existem dados).
export function ImportBackupFlow({
  confirmFirst,
  buttonVariant = 'primary',
}: {
  confirmFirst?: boolean
  buttonVariant?: 'primary' | 'ghost'
}) {
  const importBackup = useStore((s) => s.importBackup)
  const mode = useStore((s) => s.mode)
  const inputRef = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<{ name: string; data: DataSet } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (mode !== 'local') return null

  const pick = async (file: File | undefined) => {
    if (!file) return
    setError('')
    setParsed(null)
    try {
      setParsed({ name: file.name, data: parseBackup(await file.text()) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível ler o ficheiro.')
    }
  }

  const doImport = async () => {
    if (!parsed) return
    setBusy(true)
    setError('')
    try {
      await importBackup(parsed.data)
      trackEvent('backup-import')
      setParsed(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível importar a cópia de segurança.')
    } finally {
      setBusy(false)
    }
  }

  const start = () => {
    if (
      confirmFirst &&
      !window.confirm(
        'Importar substitui TODOS os dados deste dispositivo pelos do ficheiro. Se tiveres dados que queres guardar, exporta-os primeiro. Continuar?',
      )
    ) {
      return
    }
    inputRef.current?.click()
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          void pick(e.target.files?.[0])
          e.target.value = '' // permite escolher o mesmo ficheiro outra vez
        }}
      />
      {!parsed && (
        <Button variant={buttonVariant} size="sm" onClick={start}>
          Importar cópia de segurança
        </Button>
      )}
      {parsed && (
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="mb-1 text-xs text-muted">Ficheiro: {parsed.name}</p>
          <SummaryLine data={parsed.data} />
          <p className="mt-1 text-xs text-muted">Isto substitui tudo o que estiver neste dispositivo.</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => void doImport()}>
              {busy ? 'A importar…' : 'Importar'}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setParsed(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-negative">{error}</p>}
    </div>
  )
}

// Cartão do topo do onboarding (só modo local).
export function ImportBackupCard() {
  const mode = useStore((s) => s.mode)
  if (mode !== 'local') return null
  return (
    <Card className="mb-4">
      <h2 className="text-base font-bold">Vens de outro dispositivo?</h2>
      <p className="mb-3 mt-1 text-xs text-muted">
        Se já usavas a Contas noutro telemóvel ou computador, traz tudo contigo: importa o ficheiro de cópia de
        segurança que exportaste lá e não precisas de configurar nada outra vez.
      </p>
      <ImportBackupFlow />
      <MoveDeviceGuide />
    </Card>
  )
}

// Conteúdo do bloco "Dados" em Definições (só renderizado em modo local).
export function BackupSettings() {
  return (
    <div className="mb-4 border-b border-border pb-4">
      <p className="mb-3 text-sm text-muted">
        Guarda uma cópia de segurança de todos os teus dados num ficheiro — útil para mudares de dispositivo ou
        teres uma cópia de reserva.
      </p>
      <div className="flex flex-wrap items-start gap-2">
        <ExportBackupButton />
        <ImportBackupFlow confirmFirst buttonVariant="ghost" />
      </div>
      <MoveDeviceGuide />
    </div>
  )
}

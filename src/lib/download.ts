// Entrega de ficheiros ao utilizador (DOM). Em telemóveis/tablets usa o menu de
// partilha nativo (descarregar em PWAs iOS é pouco fiável); no computador, descarrega.
export async function deliverFile(name: string, content: string): Promise<void> {
  const file = new File([content], name, { type: 'application/json' })
  const isTouch = navigator.maxTouchPoints > 0
  if (isTouch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Backup Contas' })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return // cancelou
      throw e
    }
    return
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

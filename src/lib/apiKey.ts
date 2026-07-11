// API key do OpenAI guardada só neste dispositivo (localStorage).
// Não vai para o Firestore nem é partilhada no espaço — é per-utilizador/dispositivo.

const KEY = 'contas.openaiApiKey'

export function getOpenAiKey(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function setOpenAiKey(value: string): void {
  try {
    const v = value.trim()
    if (v) localStorage.setItem(KEY, v)
    else localStorage.removeItem(KEY)
  } catch {
    /* localStorage indisponível — ignora */
  }
}

export function clearOpenAiKey(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignora */
  }
}

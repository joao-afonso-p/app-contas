// Extração de movimentos de um extrato bancário via LLM (OpenAI).
// A chamada é feita diretamente do browser com a API key do próprio utilizador
// (guardada em localStorage). Não há backend. O modelo recebe apenas texto já
// extraído do ficheiro (ver extractText.ts) e devolve linhas estruturadas que
// preenchem o mesmo campo de texto que a importação manual já usa.

import type { Transaction, TransactionCategory } from '../../types'
import { monthOfDate } from '../format'
import { normalizeDesc } from '../calc/budgets'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
// Modelo por defeito — trocar aqui se necessário.
export const OPENAI_MODEL = 'gpt-4o-mini'

const MAX_HISTORY = 150

export interface ExtractedRow {
  date: string // YYYY-MM-DD
  nome: string
  categoria: string
  valor: number // sinal do extrato (saídas negativas)
  descricao: string
}

export interface ExtractResult {
  viable: boolean
  reason?: string
  rows: ExtractedRow[]
}

export interface HistoryEntry {
  descritivo: string
  nome: string
  categoria: string
}

// Últimos ~2 meses de gastos, compactados a descritivo|nome|categoria e
// deduplicados por descritivo (mantém o mais recente). Serve de base para o
// LLM inferir categorias/nomes de transações semelhantes já vistas.
export function buildStatementHistory(
  transactions: Transaction[],
  categories: TransactionCategory[],
  todayISODate: string,
): HistoryEntry[] {
  const catName = new Map(categories.map((c) => [c.id, c.name]))
  const cutoffMonth = monthOfDate(addMonthsISO(todayISODate, -2))
  const sorted = [...transactions]
    .filter((t) => monthOfDate(t.date) >= cutoffMonth)
    .sort((a, b) => (a.date < b.date ? 1 : -1)) // mais recente primeiro
  const seen = new Set<string>()
  const out: HistoryEntry[] = []
  for (const t of sorted) {
    const desc = (t.description || '').trim()
    if (!desc) continue
    const k = normalizeDesc(desc)
    if (seen.has(k)) continue
    seen.add(k)
    out.push({
      descritivo: desc,
      nome: (t.nome || '').trim(),
      categoria: catName.get(t.categoryId) ?? '',
    })
    if (out.length >= MAX_HISTORY) break
  }
  return out
}

function addMonthsISO(iso: string, delta: number): string {
  const [y, m] = iso.split('-').map(Number)
  const d = new Date(Date.UTC(y, (m - 1) + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

const SYSTEM_PROMPT = `És um assistente que extrai movimentos de extratos bancários (Portugal, valores em EUR).
Recebes texto extraído de um PDF ou Excel de um banco. Responde SEMPRE em JSON válido.

PASSO 1 — VIABILIDADE (poupa tokens): decide primeiro se o texto é mesmo um extrato/lista de movimentos com, no mínimo, data + descrição + valor por linha. Se NÃO for (ex.: outro tipo de documento, texto sem movimentos, PDF sem dados legíveis), devolve exatamente {"viable": false, "reason": "<motivo curto>", "rows": []} e PARA. Não inventes movimentos.

PASSO 2 — EXTRAÇÃO (só se viável): extrai TODAS as linhas de movimento. Para cada uma devolve um objeto com:
- "date": data do movimento em formato "YYYY-MM-DD".
- "valor": número com o SINAL do extrato (saídas/débitos negativos, entradas/créditos positivos). Usa ponto como separador decimal.
- "descricao": o descritivo CRU do banco, tal como aparece.
- "nome": um nome curto, simples e descritivo do movimento (o utilizador afina depois). Ex.: "Pingo Doce", "Portagem", "Transferência recebida".
- "categoria": segue esta ordem, e na dúvida deixa SEMPRE "" (vazio) para o utilizador classificar à mão:
   1) MATCH DE HISTÓRICO (prioritário): procura no histórico fornecido um descritivo MUITO semelhante — mesmo comerciante, mesmo NIF, mesmo IBAN, ou o mesmo padrão de descritivo — e usa EXATAMENTE a mesma categoria que ficou atribuída a esse. Este é o método principal.
   2) DEDUÇÃO ÓBVIA (só se não houver match no histórico): apenas se tiveres MUITA certeza pelo tipo (portagens/transportes, restauração/cafés, cinema/lazer, supermercado/alimentação, farmácia/saúde…).
   3) Caso contrário, "" (vazio). É melhor deixar vazio do que arriscar uma categoria errada.
  A categoria TEM de ser exatamente uma das categorias válidas fornecidas; caso contrário deixa "".

Obrigatório por linha: date, valor e descricao. Linhas sem estes três não devem ser incluídas.
Formato de saída: {"viable": true, "reason": "", "rows": [ ... ]}`

export async function extractStatement(params: {
  text: string
  apiKey: string
  categoryNames: string[]
  history: HistoryEntry[]
  onProgress?: (latest: string) => void // último movimento visto no stream (linha viva)
}): Promise<ExtractResult> {
  const { text, apiKey, categoryNames, history, onProgress } = params

  const userContent = [
    `Categorias válidas (usa exatamente estes nomes em "categoria", ou "" se não tiveres certeza):`,
    categoryNames.length ? categoryNames.join(' | ') : '(nenhuma definida)',
    '',
    `Histórico recente (descritivo | nome | categoria) — usa-o como fonte PRINCIPAL para classificar: se um novo descritivo for muito parecido com um destes (mesmo comerciante/NIF/IBAN/padrão), reutiliza a mesma categoria:`,
    history.length
      ? history.map((h) => `${h.descritivo} | ${h.nome} | ${h.categoria}`).join('\n')
      : '(sem histórico)',
    '',
    'Texto extraído do ficheiro do banco:',
    '"""',
    text.slice(0, 120_000), // salvaguarda de tamanho
    '"""',
  ].join('\n')

  let res: Response
  try {
    res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        stream: true,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
      }),
    })
  } catch {
    throw new Error('Não foi possível contactar o OpenAI. Verifica a ligação à internet.')
  }

  if (!res.ok) {
    let detail = ''
    try {
      const err = await res.json()
      detail = err?.error?.message ?? ''
    } catch {
      /* ignora */
    }
    if (res.status === 401) throw new Error('API key do OpenAI inválida. Verifica-a nas Definições.')
    if (res.status === 429) throw new Error('Limite/saldo do OpenAI excedido. Tenta mais tarde.')
    throw new Error(`Erro do OpenAI (${res.status})${detail ? `: ${detail}` : ''}.`)
  }
  if (!res.body) throw new Error('Resposta vazia do OpenAI.')

  const content = await consumeStream(res.body, onProgress)
  if (!content.trim()) throw new Error('Resposta vazia do OpenAI.')

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('Resposta do OpenAI em formato inesperado.')
  }

  return normalizeResult(parsed, categoryNames)
}

// Lê o stream SSE do OpenAI, acumula o conteúdo e vai reportando (onProgress) o
// último descritivo/nome já emitido — dá a "linha viva" sem acumular texto.
async function consumeStream(body: ReadableStream<Uint8Array>, onProgress?: (latest: string) => void): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let lastReported = ''

  const report = () => {
    if (!onProgress) return
    // Último "nome" ou "descricao" já presente no JSON parcial acumulado.
    const matches = [...content.matchAll(/"(?:nome|descricao)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)]
    const latest = matches.length ? matches[matches.length - 1][1] : ''
    if (latest && latest !== lastReported) {
      lastReported = latest
      onProgress(latest)
    }
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? '' // guarda a linha incompleta
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const chunk = JSON.parse(payload)
        const delta = chunk?.choices?.[0]?.delta?.content
        if (typeof delta === 'string') {
          content += delta
          report()
        }
      } catch {
        /* chunk parcial/keep-alive — ignora */
      }
    }
  }
  return content
}

function normalizeResult(parsed: unknown, categoryNames: string[]): ExtractResult {
  const obj = (parsed ?? {}) as Record<string, unknown>
  if (obj.viable === false) {
    return { viable: false, reason: String(obj.reason ?? 'Não foi possível extrair movimentos deste ficheiro.'), rows: [] }
  }
  const validNames = new Set(categoryNames.map((n) => normalizeDesc(n)))
  const rawRows = Array.isArray(obj.rows) ? obj.rows : []
  const rows: ExtractedRow[] = []
  for (const r of rawRows) {
    const row = (r ?? {}) as Record<string, unknown>
    const date = String(row.date ?? '').trim()
    const valor = typeof row.valor === 'number' ? row.valor : Number(String(row.valor ?? '').replace(',', '.'))
    const descricao = String(row.descricao ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(valor) || !descricao) continue
    let categoria = String(row.categoria ?? '').trim()
    if (categoria && !validNames.has(normalizeDesc(categoria))) categoria = '' // descarta categorias inventadas
    rows.push({ date, nome: String(row.nome ?? '').trim(), categoria, valor, descricao })
  }
  return { viable: rows.length > 0, reason: rows.length ? '' : 'Não foram encontrados movimentos.', rows }
}

// Converte as linhas extraídas para o formato de texto que a importação manual
// já entende: data;nome;categoria;valor;descrição (um por linha).
export function rowsToStatementText(rows: ExtractedRow[]): string {
  const clean = (s: string) => s.replace(/[;\t\n\r]+/g, ' ').trim()
  return rows
    .map((r) => [r.date, clean(r.nome), clean(r.categoria), formatValor(r.valor), r.descricao.replace(/[\t\n\r]+/g, ' ').trim()].join(';'))
    .join('\n')
}

function formatValor(v: number): string {
  // Mantém sinal; ponto decimal (parseEuroNumber aceita ponto ou vírgula).
  return String(v)
}

// Extração de texto de ficheiros no cliente (sem backend, sem guardar nada).
// PDF → pdf.js; Excel (.xlsx/.xls) → SheetJS. O texto resultante é enviado
// depois ao LLM, que faz o parsing "inteligente".
//
// pdf.js e SheetJS são bibliotecas pesadas: são carregadas dinamicamente
// (import()) só quando o utilizador realmente importa um ficheiro, para não
// pesarem no bundle inicial da app.

const PDF_EXT = /\.pdf$/i
const EXCEL_EXT = /\.(xlsx|xls|xlsm)$/i

export function isSupportedFile(file: File): boolean {
  return PDF_EXT.test(file.name) || EXCEL_EXT.test(file.name) || file.type === 'application/pdf'
}

export async function fileToText(file: File): Promise<string> {
  if (PDF_EXT.test(file.name) || file.type === 'application/pdf') {
    return pdfToText(file)
  }
  if (EXCEL_EXT.test(file.name)) {
    return excelToText(file)
  }
  throw new Error('Só são suportados ficheiros PDF ou Excel (.xlsx/.xls).')
}

async function pdfToText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const data = new Uint8Array(await file.arrayBuffer())
  const loadingTask = pdfjs.getDocument({ data })
  const pdf = await loadingTask.promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((it) => ('str' in it ? it.str : ''))
      .join(' ')
      .replace(/[ \t]+/g, ' ')
    pages.push(text)
  }
  await loadingTask.destroy()
  return pages.join('\n').trim()
}

async function excelToText(file: File): Promise<string> {
  const XLSX = await import('xlsx')
  const data = new Uint8Array(await file.arrayBuffer())
  const wb = XLSX.read(data, { type: 'array' })
  // Junta todas as folhas em CSV (mantém as colunas legíveis para o LLM).
  const parts: string[] = []
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name]
    if (!sheet) continue
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
    if (csv.trim()) parts.push(csv)
  }
  return parts.join('\n').trim()
}

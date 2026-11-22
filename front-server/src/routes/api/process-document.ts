import { createFileRoute } from '@tanstack/react-router'

const allowed = /\.(pdf|doc|docx|ods|xlsx|jpg|jpeg|png)$/i
const maxBytes = Number(process.env.MAX_UPLOAD_BYTES || 20 * 1024 * 1024)
const timeout = Number(process.env.DOCUMENT_PROCESSOR_TIMEOUT_MS || 270_000)
if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || !Number.isSafeInteger(timeout) || timeout <= 0) {
  throw new Error('MAX_UPLOAD_BYTES and DOCUMENT_PROCESSOR_TIMEOUT_MS must be positive integers')
}

export async function processDocument(request: Request): Promise<Response> {
  const endpoint = process.env.DOCUMENT_PROCESSOR_URL || 'http://localhost:3001/upload'
  try {
    // Bound multipart bytes before buffering/parsing; allow 1 MiB for metadata.
    const reader = request.body?.getReader()
    if (!reader) return Response.json({ error: 'Brak pliku.' }, { status: 400 })
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes + 1024 * 1024) {
        await reader.cancel()
        return Response.json({ error: 'Przekroczony limit rozmiaru żądania.' }, { status: 413 })
      }
      chunks.push(value)
    }
    let form: FormData
    try {
      const bytes = new Uint8Array(total)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      form = await new Response(bytes, { headers: { 'Content-Type': request.headers.get('Content-Type') || '' } }).formData()
    } catch { return Response.json({ error: 'Niepoprawny multipart/form-data.' }, { status: 400 }) }
    const file = form.get('file')
    if (!(file instanceof File) || !allowed.test(file.name)) return Response.json({ error: 'Nieobsługiwany plik.' }, { status: 400 })
    if (Array.from(file.name).length > 250 || /[;:><\/\\|'*%$\x00-\x1f\x7f]/u.test(file.name)) return Response.json({ error: 'Niedozwolona nazwa pliku.' }, { status: 400 })
    if (file.size === 0) return Response.json({ error: 'Plik jest pusty.' }, { status: 400 })
    if (file.size > maxBytes) return Response.json({ error: `Maksymalny rozmiar pliku: ${maxBytes} bajtów.` }, { status: 413 })
    const body = new FormData()
    body.append('file', file, file.name)
    const headers = new Headers()
    const requestId = request.headers.get('X-Request-ID')
    if (requestId) headers.set('X-Request-ID', requestId)
    const result = await fetch(endpoint, { method: 'POST', body, headers, signal: AbortSignal.timeout(timeout) })
    if (!result.ok) {
      const status = [400, 401, 403, 413, 415, 422, 429, 503, 504].includes(result.status) ? result.status : 502
      const error = await result.json().catch(() => ({}))
      return Response.json({ error: error.detail || 'Serwer nie przetworzył dokumentu.' }, {
        status, headers: status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {},
      })
    }
    let data: unknown
    try { data = await result.json() } catch { return Response.json({ error: 'Serwer zwrócił niepoprawny JSON.' }, { status: 502 }) }
    return Response.json(data)
  } catch {
    return Response.json({ error: 'Nie udało się połączyć z serwerem przetwarzania dokumentu.' }, { status: 502 })
  }
}

export const Route = createFileRoute('/api/process-document')({ server: { handlers: { POST: ({ request }) => processDocument(request) } } })

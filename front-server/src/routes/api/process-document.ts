import { createFileRoute } from '@tanstack/react-router'

const allowed = /\.(pdf|doc|docx|ods|xlsx|jpg|jpeg|png)$/i
const maxBytes = 20 * 1024 * 1024

export async function processDocument(request: Request): Promise<Response> {
  const endpoint = process.env.DOCUMENT_PROCESSOR_URL || 'http://localhost:3001'
  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File) || !allowed.test(file.name)) return Response.json({ error: 'Nieobsługiwany plik.' }, { status: 400 })
    if (file.size === 0 || file.size > maxBytes) return Response.json({ error: 'Plik musi mieć od 1 bajtu do 20 MB.' }, { status: 400 })
    const body = new FormData()
    body.append('file', file, file.name)
    const headers = new Headers()
    if (process.env.DOCUMENT_PROCESSOR_TOKEN) headers.set('Authorization', `Bearer ${process.env.DOCUMENT_PROCESSOR_TOKEN}`)
    const result = await fetch(endpoint, { method: 'POST', body, headers })
    if (!result.ok) return Response.json({ error: 'Serwer nie przetworzył dokumentu. Spróbuj ponownie.' }, { status: 502 })
    let data: unknown
    try { data = await result.json() } catch { return Response.json({ error: 'Serwer zwrócił niepoprawny JSON.' }, { status: 502 }) }
    return Response.json(data)
  } catch {
    return Response.json({ error: 'Nie udało się połączyć z serwerem przetwarzania dokumentu.' }, { status: 502 })
  }
}

export const Route = createFileRoute('/api/process-document')({ server: { handlers: { POST: ({ request }) => processDocument(request) } } })

import { createFileRoute } from '@tanstack/react-router'

import { validateUpload } from '../../lib/uploadValidation'

import { serverConfig } from '../../lib/serverConfig'

export function uploadLimit(): number {
  return serverConfig().maxUploadBytes
}

export async function processDocument(request: Request): Promise<Response> {
  let config: ReturnType<typeof serverConfig>
  try { config = serverConfig() } catch {
    return Response.json({ error: 'Niepoprawna konfiguracja serwera.' }, { status: 503 })
  }
  const authorization = config.processorToken ? `Bearer ${config.processorToken}` : request.headers.get('Authorization')
  if (config.jwtEnabled && !authorization) return Response.json({ error: 'Wymagany token uwierzytelniający.' }, { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } })
  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return Response.json({ error: 'Wybierz plik.' }, { status: 400 })
    const error = validateUpload(file, config.maxUploadBytes)
    if (error) return Response.json({ error }, { status: file.size > config.maxUploadBytes ? 413 : 400 })
    const body = new FormData()
    body.append('file', file, file.name)
    const headers = new Headers()
    if (authorization) headers.set('Authorization', authorization)
    const result = await fetch(config.processorUrl, { method: 'POST', body, headers, signal: AbortSignal.timeout(config.processorTimeoutMs) })
    if (!result.ok) {
      if ([400, 401, 403, 413, 415, 422].includes(result.status)) {
        const error = await result.json().catch(() => null)
        return Response.json({ error: typeof error?.detail === 'string' ? error.detail : 'Niepoprawny plik.' }, { status: result.status, headers: result.status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {} })
      }
      return Response.json({ error: 'Serwer nie przetworzył dokumentu. Spróbuj ponownie.' }, { status: 502 })
    }
    let data: unknown
    try { data = await result.json() } catch { return Response.json({ error: 'Serwer zwrócił niepoprawny JSON.' }, { status: 502 }) }
    return Response.json(data)
  } catch (error) {
    if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) return Response.json({ error: 'Przekroczono czas przetwarzania dokumentu.' }, { status: 504 })
    return Response.json({ error: 'Nie udało się połączyć z serwerem przetwarzania dokumentu.' }, { status: 502 })
  }
}

export const Route = createFileRoute('/api/process-document')({ server: { handlers: { GET: () => Response.json({ maxUploadBytes: uploadLimit() }), POST: ({ request }) => processDocument(request) } } })

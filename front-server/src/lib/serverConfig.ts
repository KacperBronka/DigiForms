// Server-only runtime settings. Never return this object to the browser.
function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`)
  return value
}

export function serverConfig() {
  const processorUrl = process.env.DOCUMENT_PROCESSOR_URL ?? 'http://localhost:3001/upload'
  let url: URL
  try { url = new URL(processorUrl) } catch { throw new Error('DOCUMENT_PROCESSOR_URL must be an HTTP(S) URL') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('DOCUMENT_PROCESSOR_URL must be an HTTP(S) URL without credentials or fragment')
  const jwtEnabled = process.env.JWT_ENABLED ?? 'false'
  if (!['true', 'false'].includes(jwtEnabled)) throw new Error('JWT_ENABLED must be true or false')
  const timeoutSeconds = positiveInteger('DOCUMENT_PROCESSOR_TIMEOUT_SECONDS', 900)
  if (timeoutSeconds > 2147483) throw new Error('DOCUMENT_PROCESSOR_TIMEOUT_SECONDS must not exceed 2147483')
  return {
    maxUploadBytes: positiveInteger('MAX_UPLOAD_BYTES', 20 * 1024 * 1024),
    processorUrl,
    processorToken: process.env.DOCUMENT_PROCESSOR_TOKEN ?? '',
    processorTimeoutMs: timeoutSeconds * 1000,
    jwtEnabled: jwtEnabled === 'true',
  }
}

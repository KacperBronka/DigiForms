import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true }, appType: 'custom' })
const oldFetch = globalThis.fetch
const oldUrl = process.env.DOCUMENT_PROCESSOR_URL
const oldToken = process.env.DOCUMENT_PROCESSOR_TOKEN
const oldJwtEnabled = process.env.JWT_ENABLED
const oldTimeout = process.env.DOCUMENT_PROCESSOR_TIMEOUT_SECONDS
try {
  const { setDefinitionValue, moveItem, sortedQuestions, queryErrors } = await server.ssrLoadModule('/src/components/form/DefinitionEditor.tsx')
  const { validateUpload } = await server.ssrLoadModule('/src/lib/uploadValidation.ts')
  const { processDocument } = await server.ssrLoadModule('/src/routes/api/process-document.ts')
  const definition = { title: 'Test', extra: { untouched: true }, tabs: [{ title: 'Dane', questions: [{ x: 0, y: 2, field: { title: 'Pole', metadata: { id: 1 }, states: [{ type: 'SHOW', query: 'true' }] } }, { x: 0, y: 1, field: { title: 'Drugie' } }] }] }
  const edited = setDefinitionValue(definition, ['tabs', 0, 'questions', 0, 'field', 'title'], 'Nowe')
  assert.equal(edited.tabs[0].questions[0].field.title, 'Nowe')
  assert.equal(definition.tabs[0].questions[0].field.title, 'Pole')
  assert.deepEqual(edited.extra, definition.extra)
  assert.deepEqual(edited.tabs[0].questions[0].field.metadata, { id: 1 })
  assert.deepEqual(sortedQuestions(definition.tabs[0].questions).map(q => q.field.title), ['Drugie', 'Pole'])
  assert.deepEqual(moveItem([1, 2, 3], 1, -1), [2, 1, 3])
  assert.deepEqual(queryErrors(edited), [])
  assert.equal(queryErrors(setDefinitionValue(edited, ['tabs', 0, 'questions', 0, 'field', 'states', 0, 'query'], '(')).length, 1)
  for (const char of ";:></\\|'*%$") assert.ok(validateUpload(new File(['x'], `bad${char}.pdf`), 10))
  assert.equal(validateUpload(new File(['x'], 'a'.repeat(246) + '.pdf'), 1), undefined)
  assert.ok(validateUpload(new File(['x'], 'a'.repeat(247) + '.pdf'), 1))
  assert.ok(validateUpload(new File(['xx'], 'a.pdf'), 1))
  assert.ok(validateUpload(new File([], 'a.pdf'), 1))
  assert.ok(validateUpload(new File(['x'], 'a.pdf', { type: 'image/png' }), 1))
  assert.ok(validateUpload(new File(['{}'], 'a.json', { type: 'application/json' }), 1, true))
  const request = (name = 'wniosek.pdf') => { const form = new FormData(); form.append('file', new File(['sample'], name, { type: 'application/pdf' })); return new Request('http://localhost/api/process-document', { method: 'POST', body: form }) }
  delete process.env.DOCUMENT_PROCESSOR_URL
  globalThis.fetch = async (url) => { assert.equal(url, 'http://localhost:3001/upload'); return Response.json(definition) }
  assert.equal((await processDocument(request())).status, 200)
  process.env.DOCUMENT_PROCESSOR_URL = 'https://processor.example.test/process'
  process.env.DOCUMENT_PROCESSOR_TOKEN = 'test-token'
  globalThis.fetch = async (url, options) => {
    assert.equal(url, process.env.DOCUMENT_PROCESSOR_URL)
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.get('Authorization'), 'Bearer test-token')
    assert.equal(options.body.get('file').name, 'wniosek.pdf')
    return Response.json(definition)
  }
  const response = await processDocument(request())
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), definition)
  assert.equal((await processDocument(request('file.json'))).status, 400)
  globalThis.fetch = async () => Response.json({ detail: 'Zawartość nie odpowiada rozszerzeniu.' }, { status: 415 })
  const rejected = await processDocument(request())
  assert.equal(rejected.status, 415)
  assert.equal((await rejected.json()).error, 'Zawartość nie odpowiada rozszerzeniu.')
  globalThis.fetch = async () => new Response('bad', { status: 500 })
  assert.equal((await processDocument(request())).status, 502)
  globalThis.fetch = async () => new Response('not json')
  assert.equal((await processDocument(request())).status, 502)
  globalThis.fetch = async () => { throw new Error('offline') }
  assert.equal((await processDocument(request())).status, 502)
  delete process.env.DOCUMENT_PROCESSOR_TOKEN
  process.env.JWT_ENABLED = 'true'
  assert.equal((await processDocument(request())).status, 401)
  const authenticated = request()
  authenticated.headers.set('Authorization', 'Bearer user-token')
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers.get('Authorization'), 'Bearer user-token')
    assert.ok(options.signal instanceof AbortSignal)
    return Response.json({ detail: 'Invalid token' }, { status: 401 })
  }
  const unauthorized = await processDocument(authenticated)
  assert.equal(unauthorized.status, 401)
  assert.equal(unauthorized.headers.get('WWW-Authenticate'), 'Bearer')
  process.env.JWT_ENABLED = 'false'
  process.env.DOCUMENT_PROCESSOR_TIMEOUT_SECONDS = '0'
  assert.equal((await processDocument(request())).status, 503)
  process.env.DOCUMENT_PROCESSOR_TIMEOUT_SECONDS = '1'
  globalThis.fetch = async () => { throw new DOMException('Timeout', 'TimeoutError') }
  assert.equal((await processDocument(request())).status, 504)
  console.log('Przetwarzanie dokumentów i edytor: OK')
} finally {
  globalThis.fetch = oldFetch
  if (oldUrl === undefined) delete process.env.DOCUMENT_PROCESSOR_URL; else process.env.DOCUMENT_PROCESSOR_URL = oldUrl
  if (oldToken === undefined) delete process.env.DOCUMENT_PROCESSOR_TOKEN; else process.env.DOCUMENT_PROCESSOR_TOKEN = oldToken
  if (oldJwtEnabled === undefined) delete process.env.JWT_ENABLED; else process.env.JWT_ENABLED = oldJwtEnabled
  if (oldTimeout === undefined) delete process.env.DOCUMENT_PROCESSOR_TIMEOUT_SECONDS; else process.env.DOCUMENT_PROCESSOR_TIMEOUT_SECONDS = oldTimeout
  await server.close()
}

import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true }, appType: 'custom' })
const oldFetch = globalThis.fetch
const oldUrl = process.env.DOCUMENT_PROCESSOR_URL
try {
  const { setDefinitionValue, moveItem, sortedQuestions, queryErrors } = await server.ssrLoadModule('/src/components/form/DefinitionEditor.tsx')
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
  const request = (name = 'wniosek.pdf') => { const form = new FormData(); form.append('file', new File(['sample'], name, { type: 'application/pdf' })); return new Request('http://localhost/api/process-document', { method: 'POST', body: form }) }
  delete process.env.DOCUMENT_PROCESSOR_URL
  globalThis.fetch = async (url) => { assert.equal(url, 'http://localhost:3001/upload'); return Response.json(definition) }
  assert.equal((await processDocument(request())).status, 200)
  process.env.DOCUMENT_PROCESSOR_URL = 'https://processor.example.test/process'
  globalThis.fetch = async (url, options) => {
    assert.equal(url, process.env.DOCUMENT_PROCESSOR_URL)
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.get('Authorization'), null)
    assert.equal(options.body.get('file').name, 'wniosek.pdf')
    return Response.json(definition)
  }
  const response = await processDocument(request())
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), definition)
  assert.equal((await processDocument(request('file.json'))).status, 400)
  globalThis.fetch = async () => new Response('bad', { status: 500 })
  assert.equal((await processDocument(request())).status, 502)
  globalThis.fetch = async () => new Response('not json')
  assert.equal((await processDocument(request())).status, 502)
  globalThis.fetch = async () => { throw new Error('offline') }
  assert.equal((await processDocument(request())).status, 502)
  console.log('Przetwarzanie dokumentów i edytor: OK')
} finally {
  globalThis.fetch = oldFetch
  if (oldUrl === undefined) delete process.env.DOCUMENT_PROCESSOR_URL; else process.env.DOCUMENT_PROCESSOR_URL = oldUrl
  await server.close()
}

import assert from 'node:assert/strict'
import { createServer } from 'vite'
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true }, appType: 'custom' })
try {
  const { validateValue } = await server.ssrLoadModule('/src/lib/validators.ts')
  const { validatePage, contextFor } = await server.ssrLoadModule('/src/components/form/GeneratedForm.tsx')
  assert.equal(validateValue(['EMAIL'], ''), undefined)
  assert.match(validateValue(['EMAIL', 'REQUIRED'], ''), /wymagane/)
  assert.match(validateValue(['EMAIL', 'PESEL'], 'bad'), /EMAIL/)
  assert.equal(validateValue(['PESEL'], '44051401458'), undefined)
  assert.match(validateValue(['PESEL'], '44051401459'), /PESEL/)
  assert.equal(validateValue(['NIP'], '8567346215'), undefined)
  assert.match(validateValue(['DATE_ISO'], '2023-02-29'), /DATE_ISO/)
  assert.match(validateValue(['UNKNOWN'], ''), /Nieznany/)
  const definition = { title: 'Test', tabs: [{ questions: [
    { field: { type: 'TEXT_FIELD', validation: ['REQUIRED'], defaultValue: 'Gotowe' } },
    { field: { type: 'TEXT_FIELD', validation: ['REQUIRED'], states: [{ type: 'SHOW', query: 'false' }] } },
    { field: { type: 'REPEATING_SECTION', repeatingSectionGrid: [{ field: { type: 'TEXT_FIELD', validation: ['REQUIRED'] } }] } },
    { field: { type: 'CONSENT_SECTION', consentSectionConfig: { required: true, consents: [{}] } } },
  ] }] }
  const counts = { 'field-0-2': 2 }
  const answers = { 'field-0-2-0-0': 'OK' }
  const errors = await validatePage(definition, 0, answers, counts, scope => contextFor(definition, answers, counts, scope))
  assert.deepEqual(Object.keys(errors), ['field-0-2-1-0', 'field-0-3-consent-0'])
  console.log('Walidatory i walidacja kroku: OK')
} finally { await server.close() }

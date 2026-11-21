import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true }, appType: 'custom' })
try {
  const { contextFor, evaluateCondition, evaluateFieldState, isFormDefinition, GeneratedForm } = await server.ssrLoadModule('/src/components/form/GeneratedForm.tsx')
  const query = `("Osoby prawnej lub jednostki organizacyjnej" in tabs['Dane' in title].questions['podmiot_wniosku' in field.techName].field.repeatingSectionGrid['wybierz_w_czyim_imieniu_wnioskujesz' in field.techName].field.__userAnswer)`
  const definition = { title: 'Wniosek', tabs: [{ title: 'Dane', questions: [{ field: { type: 'SECTION', techName: 'podmiot_wniosku', repeatingSectionGrid: [{ field: { type: 'RADIO', techName: 'wybierz_w_czyim_imieniu_wnioskujesz', repeatingSectionGrid: [] } }] } }] }] }
  const evaluate = answers => evaluateCondition(query, contextFor(definition, answers))
  assert.equal(await evaluate({}), false)
  assert.equal(await evaluate({ 'field-0-0-0-0': 'Osoby prawnej lub jednostki organizacyjnej' }), true)
  assert.equal(await evaluate({ 'field-0-0-0-0': 'Swoim' }), false)
  const showState = [{ type: 'SHOW', query }]
  for (const [answer, expected] of [[undefined, false], ['Osoby prawnej lub jednostki organizacyjnej', true], ['Swoim', false]]) {
    const answers = answer === undefined ? {} : { 'field-0-0-0-0': answer }
    assert.equal((await evaluateFieldState(showState, contextFor(definition, answers))).visible, expected)
  }
  assert.equal(await evaluateCondition('[]', contextFor(definition, {})), false)
  await assert.rejects(() => evaluateCondition('(', contextFor(definition, {})))
  assert.equal(contextFor(definition, {}, { 'field-0-0': 3 }).tabs[0].questions[0].field.__userAnswer.length, 3)
  assert.equal(isFormDefinition(definition), true)
  const nullableDefinition = { title: 'Wniosek', tabs: [{ questions: [{ field: { type: 'TEXT_FIELD', title: 'Imię', techName: null, description: null, tooltipMessage: null, defaultValue: null, defaultValueType: null, dictionaryName: null, options: null, states: null, repeatingSectionGrid: null } }, { field: { type: 'SELECT', options: [{ id: 1, name: 'Tak', techName: null }] } }] }] }
  assert.equal(isFormDefinition(nullableDefinition), true)
  assert.doesNotThrow(() => contextFor(nullableDefinition, {}))
  assert.equal(isFormDefinition({ title: 'Błędny', tabs: [{ questions: null }] }), false)
  const multiPage = { title: 'Wniosek', tabs: [
    { title: 'Dane', questions: [{ field: { type: 'SECTION', techName: 'podmiot_wniosku', repeatingSectionGrid: [
      { field: { type: 'RADIO', techName: 'wybierz_w_czyim_imieniu_wnioskujesz', repeatingSectionGrid: [] } },
      { field: { type: 'CHECKBOX', techName: 'dokumenty', repeatingSectionGrid: [] } },
    ] } }] },
    { title: 'Szczegóły', questions: [{ field: { type: 'TEXT_FIELD', title: 'Nazwa', states: [
      { type: 'SHOW', query },
      { type: 'SHOW', query: '"Załącznik" in tabs[title="Dane"].questions.field.repeatingSectionGrid[field.techName="dokumenty"].field.__userAnswer' },
    ] } }] },
  ] }
  const conditions = multiPage.tabs[1].questions[0].field.states
  const answers = { 'field-0-0-0-0': 'Osoby prawnej lub jednostki organizacyjnej', 'field-0-0-0-1': ['Załącznik'] }
  assert.equal((await evaluateFieldState(conditions, contextFor(multiPage, {}))).visible, false)
  assert.equal((await evaluateFieldState(conditions, contextFor(multiPage, { ...answers, 'field-0-0-0-1': [] }))).visible, false)
  assert.equal((await evaluateFieldState(conditions, contextFor(multiPage, answers))).visible, true)
  assert.equal((await evaluateFieldState(conditions, contextFor(multiPage, { ...answers, 'field-0-0-0-0': 'Swoim' }))).visible, false)
  await assert.rejects(() => evaluateFieldState([{ type: 'SHOW', query: '(' }], contextFor(multiPage, answers)))
  const repeated = { title: 'Powtórzenia', tabs: [{ title: 'Dane', questions: [{ field: { type: 'REPEATING_SECTION', techName: 'osoby', repeatingSectionGrid: [{ field: { type: 'RADIO', techName: 'rodzaj' } }, { field: { type: 'SECTION', techName: 'dane', repeatingSectionGrid: [{ field: { type: 'TEXT_FIELD', techName: 'nazwa' } }] } }] } }] }] }
  const repeatedAnswers = { 'field-0-0-0-0': 'Osoba', 'field-0-0-1-0': 'Firma', 'field-0-0-1-1-0-0': 'Przykład' }
  const repeatedQuery = `tabs.questions.field.repeatingSectionGrid[field.techName="rodzaj"].field.__userAnswer = "Firma"`
  const firstContext = contextFor(repeated, repeatedAnswers, { 'field-0-0': 2 }, { 'field-0-0': 0 })
  const secondContext = contextFor(repeated, repeatedAnswers, { 'field-0-0': 2 }, { 'field-0-0': 1 })
  assert.equal(await evaluateCondition(repeatedQuery, firstContext, 0), false)
  assert.equal(await evaluateCondition(repeatedQuery, secondContext, 1), true)
  assert.equal(await evaluateCondition('$repeatingSectionIndex = 1', secondContext, 1), true)
  assert.equal(await evaluateCondition('tabs.questions.field.repeatingSectionGrid[field.techName="dane"].field.repeatingSectionGrid.field.__userAnswer = "Przykład"', secondContext, 1), true)
  assert.equal(await evaluateCondition('tabs.questions.field.__userAnswer[1][fieldTechName="rodzaj"].answers = "Firma"', secondContext, 1), true)
  for (const validation of [null, {}, { type: 'EMAIL' }, 42]) {
    const form = { title: 'Walidacja', tabs: [{ questions: [{ field: { type: 'TEXT_FIELD', title: 'Pole', validation } }] }] }
    assert.doesNotThrow(() => renderToStaticMarkup(createElement(GeneratedForm, { definition: form })))
  }
  const emailForm = { title: 'Walidacja', tabs: [{ questions: [{ field: { type: 'TEXT_FIELD', title: 'E-mail', validation: ['REQUIRED', 'EMAIL'] } }] }] }
  const emailMarkup = renderToStaticMarkup(createElement(GeneratedForm, { definition: emailForm }))
  assert.match(emailMarkup, /type="email"[^>]*required=/)
  const selectDefinition = { title: 'Wniosek', tabs: [{ questions: [{ field: { type: 'SELECT', title: 'Wybór', defaultValue: 'kod', readOnly: true, options: [{ id: '1', techName: 'kod', name: 'Opcja' }] } }] }] }
  assert.equal(contextFor(selectDefinition, {}).tabs[0].questions[0].field.__userAnswer, 'Opcja')
  const markup = renderToStaticMarkup(createElement(GeneratedForm, { definition: selectDefinition }))
  assert.match(markup, /<select[^>]*disabled=/)
  assert.match(markup, /<option value="Opcja" selected="">Opcja<\/option>/)
  console.log('Warunki JSONata: brak odpowiedzi, zgodna i inna odpowiedź, pusta lista oraz błędne wyrażenie — OK')
} finally {
  await server.close()
}

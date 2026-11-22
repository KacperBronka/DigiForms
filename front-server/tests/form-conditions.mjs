import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true }, appType: 'custom' })
try {
  const { contextFor, evaluateCondition, evaluateFieldState, sectionHasVisibleFields, isFormDefinition, GeneratedForm } = await server.ssrLoadModule('/src/components/form/GeneratedForm.tsx')
  const { getDictionary } = await server.ssrLoadModule('/src/lib/dictionaries.ts')
  const voivodeships = getDictionary(' TERYT_DOWODOWY ')
  assert.equal(voivodeships.length, 16)
  assert.deepEqual(voivodeships.find(option => option.name === 'mazowieckie'), { id: '14', name: 'mazowieckie' })
  assert.equal(getDictionary('nieznany'), undefined)
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
  const visibleIn = (field, answers = {}, counts = {}) => {
    const form = { title: 'Test', tabs: [{ questions: [{ field }] }] }
    return sectionHasVisibleFields(field, 'field-0-0', scope => contextFor(form, answers, counts, scope), counts)
  }
  assert.equal(await visibleIn({ type: 'SECTION', repeatingSectionGrid: [] }), false)
  assert.equal(await visibleIn({ type: 'SECTION', repeatingSectionGrid: [{ field: { type: 'TEXT_BLOCK' } }] }), false)
  assert.equal(await visibleIn({ type: 'SECTION', repeatingSectionGrid: [{ field: { type: 'TEXT_FIELD' } }] }), true)
  const conditionalSection = { type: 'SECTION', repeatingSectionGrid: [{ field: { type: 'SECTION', repeatingSectionGrid: [{ field: { type: 'TEXT_FIELD', states: [{ type: 'SHOW', query: 'tabs.questions.field.repeatingSectionGrid.field.repeatingSectionGrid.field.__userAnswer = "tak"' }] } }] } }] }
  assert.equal(await visibleIn(conditionalSection), false)
  assert.equal(await visibleIn(conditionalSection, { 'field-0-0-0-0-0-0': 'tak' }), true)
  assert.equal(await visibleIn(conditionalSection, { 'field-0-0-0-0-0-0': 'nie' }), false)
  const repeatedConditional = { type: 'REPEATING_SECTION', repeatingSectionGrid: [{ field: { type: 'TEXT_FIELD', states: [{ type: 'SHOW', query: '$repeatingSectionIndex = 1' }] } }] }
  assert.equal(await visibleIn(repeatedConditional), false)
  assert.equal(await visibleIn(repeatedConditional, {}, { 'field-0-0': 2 }), true)
  assert.equal(await visibleIn({ type: 'SECTION', repeatingSectionGrid: [{ field: { type: 'TEXT_FIELD', states: [{ type: 'SHOW', query: '(' }] } }] }), true)
  for (const validation of [null, {}, { type: 'EMAIL' }, 42]) {
    const form = { title: 'Walidacja', tabs: [{ questions: [{ field: { type: 'TEXT_FIELD', title: 'Pole', validation } }] }] }
    assert.doesNotThrow(() => renderToStaticMarkup(createElement(GeneratedForm, { definition: form })))
  }
  const emailForm = { title: 'Walidacja', tabs: [{ questions: [{ field: { type: 'TEXT_FIELD', title: 'E-mail', validation: ['REQUIRED', 'EMAIL'] } }] }] }
  const emailMarkup = renderToStaticMarkup(createElement(GeneratedForm, { definition: emailForm }))
  assert.match(emailMarkup, /type="email"[^>]*required=/)
  for (const type of ['DATE', 'DATEPICKER']) {
    const dateForm = { title: 'Data', tabs: [{ questions: [{ field: { type, title: 'Data', defaultValue: '2024-02-29' } }] }] }
    const dateMarkup = renderToStaticMarkup(createElement(GeneratedForm, { definition: dateForm }))
    assert.match(dateMarkup, /type="date"/)
    assert.match(dateMarkup, /value="2024-02-29"/)
  }
  const timeForm = { title: 'Godzina', tabs: [{ questions: [{ field: { type: 'TIME', title: 'Godzina', defaultValue: '14:30' } }] }] }
  const timeMarkup = renderToStaticMarkup(createElement(GeneratedForm, { definition: timeForm }))
  assert.match(timeMarkup, /type="time"/)
  assert.match(timeMarkup, /value="14:30"/)
  const voivodeshipForm = { title: 'Adres', tabs: [{ questions: [{ field: { type: 'SELECT', title: 'Województwo', dictionaryName: 'TERYT_DOWODOWY', defaultValue: '14' } }] }] }
  assert.equal(contextFor(voivodeshipForm, {}).tabs[0].questions[0].field.__userAnswer, 'mazowieckie')
  assert.doesNotMatch(renderToStaticMarkup(createElement(GeneratedForm, { definition: voivodeshipForm })), /nie jest jeszcze podłączony/)
  const selectDefinition = { title: 'Wniosek', tabs: [{ questions: [{ field: { type: 'SELECT', title: 'Wybór', defaultValue: 'kod', readOnly: true, options: [{ id: '1', techName: 'kod', name: 'Opcja' }] } }] }] }
  assert.equal(contextFor(selectDefinition, {}).tabs[0].questions[0].field.__userAnswer, 'Opcja')
  const markup = renderToStaticMarkup(createElement(GeneratedForm, { definition: selectDefinition }))
  assert.match(markup, /<button[^>]*disabled=/)
  assert.match(markup, /field-0-0-value">Opcja<\/span>/)
  console.log('Warunki JSONata: brak odpowiedzi, zgodna i inna odpowiedź, pusta lista oraz błędne wyrażenie — OK')
} finally {
  await server.close()
}

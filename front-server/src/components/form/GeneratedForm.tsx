import { useEffect, useMemo, useState } from 'react'
import { getFakeUserValue } from '../../lib/fakeUser'
import { SafeDescription } from './SafeDescription'
import { SearchableSelect } from './SearchableSelect'
import { Button, Checkbox, Fieldset, FileUpload, Notice, Radio, Textarea, TextInput } from '../gov'

import { contextFor, evaluateFieldState, fieldDefault, fieldOptions, optionValue, repetitionCount, sectionQuestions, sectionHasVisibleFields, sortedQuestions, validatePage } from '../../lib/formDefinition'
import type { Answers, Definition, Field, Question, RepeatScope } from '../../lib/formDefinition'

export { contextFor, evaluateCondition, evaluateFieldState, isFormDefinition, sectionHasVisibleFields, validatePage } from '../../lib/formDefinition'

function FieldViewContent({ field, path, getContext, scope, answers, counts, addRepetition, setAnswer, errors, repeatIndex = 0 }: { field: Field; path: string; getContext: (scope: RepeatScope) => unknown; scope: RepeatScope; answers: Answers; counts: Record<string, number>; addRepetition: (path: string) => void; setAnswer: (path: string, value: string) => void; errors: Record<string, string>; repeatIndex?: number }) {
  const context = getContext(scope)
  const type = (field.type ?? '').toUpperCase()
  const label = field.title || field.techName || 'Pole bez nazwy'
  const description = [field.description, field.tooltipMessage].filter(Boolean).join(' ')
  const hint = description ? <SafeDescription html={description} /> : undefined
  const validations = Array.isArray(field.validation) ? field.validation : []
  const required = validations.includes('REQUIRED')
  const external = field.defaultValueType === 'EXTERNAL_SYSTEM'
  const defaultValue = typeof field.defaultValue === 'string' ? field.defaultValue : undefined
  const currentValue = answers[path] ?? (type === 'SELECT' ? fieldDefault(field) : defaultValue)
  const options = fieldOptions(field)
  const children = sectionQuestions(field) ?? []
  const states = Array.isArray(field.states) ? field.states : []
  const [dynamic, setDynamic] = useState<{ visible: boolean; readOnly: boolean; error?: boolean } | null>(states.length ? null : { visible: true, readOnly: false })
  const isSection = type === 'SECTION' || type === 'REPEATING_SECTION'
  const [sectionVisibility, setSectionVisibility] = useState(false)
  useEffect(() => {
    let active = true
    if (!states.length) { setDynamic({ visible: true, readOnly: false }); return }
    evaluateFieldState(states, context, repeatIndex)
      .then(result => { if (active) setDynamic(result) })
      .catch(() => { if (active) setDynamic({ visible: false, readOnly: false, error: true }) })
    return () => { active = false }
  }, [context, field.states, repeatIndex])
  useEffect(() => {
    if (!isSection) return
    let active = true
    sectionHasVisibleFields(field, path, getContext, counts, scope, repeatIndex)
      .then(visible => { if (active) setSectionVisibility(visible) })
      .catch(() => { if (active) setSectionVisibility(true) })
    return () => { active = false }
  }, [context, field, path, getContext, counts, repeatIndex, isSection])
  if (!dynamic) return null
  if (dynamic.error) return <Notice kind="warning">Nie udało się obliczyć warunku dla pola „{label}”.</Notice>
  if (!dynamic.visible) return null
  const readOnly = Boolean(field.readOnly || dynamic.readOnly)
  if (isSection) return sectionVisibility ? <section className="form-section"><h2>{label}</h2>{hint}{Array.from({ length: type === 'REPEATING_SECTION' ? (counts[path] ?? 1) : 1 }, (_, index) => <div key={index} className="generated-fields">{type === 'REPEATING_SECTION' && <h3>{label} {index + 1}</h3>}{sortedQuestions(children).map((question, i) => question.field && <FieldView key={`${path}-${index}-${i}`} path={`${path}-${index}-${i}`} field={question.field} getContext={getContext} scope={type === 'REPEATING_SECTION' ? { ...scope, [path]: index } : scope} answers={answers} counts={counts} addRepetition={addRepetition} setAnswer={setAnswer} errors={errors} repeatIndex={type === 'REPEATING_SECTION' ? index : repeatIndex} />)}</div>)}{type === 'REPEATING_SECTION' && <Button variant="secondary" onClick={() => addRepetition(path)}>Dodaj kolejną pozycję</Button>}</section> : null
  if (type === 'TEXT_BLOCK' || type === 'INFO_SECTION') return <div className="form-text">{field.title && <h2>{field.title}</h2>}{hint}</div>
  if (type === 'CONSENT_SECTION') return <Fieldset legend={label}><div className="generated-choices">{hint}{field.consentSectionConfig?.consents?.map((consent, i) => <div key={i}><Checkbox aria-invalid={Boolean(errors[`${path}-consent-${i}`]) || undefined} aria-describedby={errors[`${path}-consent-${i}`] ? `${path}-consent-${i}-error` : undefined} id={`${path}-consent-${i}`} value="Tak" label={consent.description ? <SafeDescription html={consent.description} /> : `Zgoda ${i + 1}`} checked={answers[`${path}-consent-${i}`] === 'Tak'} onChange={() => {}} disabled={readOnly} required={consent.required ?? field.consentSectionConfig?.required} />{errors[`${path}-consent-${i}`] && <p className="validation-error" id={`${path}-consent-${i}-error`} role="alert">{errors[`${path}-consent-${i}`]}</p>}</div>)}</div></Fieldset>
  if (external && type !== 'SELECT') return <TextInput id={path} error={errors[path]} label={label} hint={hint} type={['DATE', 'DATEPICKER'].includes(type) ? 'date' : type === 'TIME' ? 'time' : 'text'} required={required} readOnly value={getFakeUserValue(defaultValue) ?? ''} />
  if (field.dictionaryName && options.length === 0) return <Notice kind="warning">Pole „{label}” wymaga słownika „{field.dictionaryName}”, który nie jest jeszcze podłączony.</Notice>
  if (type === 'RADIO' || type === 'CHECKBOX') return <Fieldset legend={`${label}${required ? ' (wymagane)' : ''}`}><div className="generated-choices">{hint}{options.length ? options.map((option, i) => type === 'RADIO' ? <Radio key={i} name={path} value={optionValue(option, i)} label={option.name || option.techName || `Opcja ${i + 1}`} required={required} disabled={readOnly} checked={currentValue === (optionValue(option, i))} onChange={() => {}} /> : <Checkbox key={i} name={path} value={optionValue(option, i)} label={option.name || option.techName || `Opcja ${i + 1}`} disabled={readOnly} checked={Array.isArray(currentValue) && currentValue.includes(optionValue(option, i))} onChange={() => {}} />) : <Notice kind="warning">Brak opcji do wyboru.</Notice>}</div></Fieldset>
  if (type === 'SELECT') {
    const value = typeof currentValue === 'string' ? currentValue : ''
    const indexedOptions = [{ value: '', label: 'Wybierz' }, ...options.map((option, index) => ({ value: optionValue(option, index), label: option.name || option.techName || `Opcja ${index + 1}` }))]
    return <SearchableSelect id={path} label={label} hint={hint} required={required} disabled={readOnly || external} value={value} options={indexedOptions} onChange={selected => setAnswer(path, selected)} />
  }
  if (type === 'TEXTAREA') return <Textarea id={path} error={errors[path]} label={label} hint={hint} required={required} readOnly={readOnly} value={typeof currentValue === 'string' ? currentValue : ''} onChange={() => {}} />
  if (type === 'FILE_UPLOADER') return <FileUpload id={path} error={errors[path]} label={label} hint={hint} required={required} disabled={readOnly} />
  if (['TEXT_FIELD', 'NUMBER', 'DATE', 'DATEPICKER', 'TIME'].includes(type)) return <TextInput id={path} error={errors[path]} label={label} hint={hint} type={type === 'NUMBER' ? 'number' : ['DATE', 'DATEPICKER'].includes(type) ? 'date' : type === 'TIME' ? 'time' : validations.includes('EMAIL') ? 'email' : 'text'} required={required} readOnly={readOnly} value={typeof currentValue === 'string' ? currentValue : ''} onChange={() => {}} />
  return <Notice kind="warning">Nieobsługiwany typ pola „{field.type || 'nieznany'}” ({label}).</Notice>
}

function FieldView(props: Parameters<typeof FieldViewContent>[0]) {
  return <><FieldViewContent {...props} />{props.errors[props.path] && !['TEXT_FIELD', 'NUMBER', 'DATE', 'DATEPICKER', 'TIME', 'TEXTAREA', 'FILE_UPLOADER'].includes((props.field.type ?? '').toUpperCase()) && <p className="validation-error" role="alert">{props.errors[props.path]}</p>}</>
}

type SummaryEntry = { label: string; value: string; section: string; html?: boolean }
type SummaryPage = { title: string; entries: SummaryEntry[] }

function FormSummary({ definition, answers, getContext, counts }: { definition: Definition; answers: Answers; getContext: (scope: RepeatScope) => unknown; counts: Record<string, number> }) {
  const [pages, setPages] = useState<SummaryPage[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    setPages(null)
    setError(false)
    async function collect() {
      const collectFields = async (questions: Question[], prefix: string, section: string, repeatIndex = 0, scope: RepeatScope = {}): Promise<SummaryEntry[]> => {
        const result: SummaryEntry[] = []
        for (const [index, question] of sortedQuestions(questions).entries()) {
          const field = question.field
          if (!field) continue
          const path = `${prefix}-${index}`
          const show = (Array.isArray(field.states) ? field.states : []).filter(state => state && state.type?.toUpperCase() === 'SHOW')
          const { visible } = await evaluateFieldState(show, getContext(scope), repeatIndex)
          if (!visible) continue
          const type = (field.type || '').toUpperCase()
          const label = field.title || field.techName || 'Pole bez nazwy'
          const children = sectionQuestions(field)
          if ((type === 'SECTION' || type === 'REPEATING_SECTION') && Array.isArray(children)) {
            const count = type === 'REPEATING_SECTION' ? repetitionCount(path, answers, counts) : 1
            for (let i = 0; i < count; i++) result.push(...await collectFields(children, `${path}-${i}`, type === 'REPEATING_SECTION' ? `${label} ${i + 1}` : label, type === 'REPEATING_SECTION' ? i : repeatIndex, type === 'REPEATING_SECTION' ? { ...scope, [path]: i } : scope))
          } else if (type === 'CONSENT_SECTION') {
            field.consentSectionConfig?.consents?.forEach((consent, i) => {
              if (answers[`${path}-consent-${i}`] === 'Tak') result.push({ section: label, label: consent.description || `Zgoda ${i + 1}`, value: 'Tak', html: Boolean(consent.description) })
            })
          } else if (['TEXT_FIELD', 'TEXTAREA', 'NUMBER', 'DATE', 'DATEPICKER', 'TIME', 'SELECT', 'RADIO', 'CHECKBOX', 'FILE_UPLOADER'].includes(type)) {
            const value = answers[path] ?? fieldDefault(field)
            const display = Array.isArray(value) ? value.join(', ') : value
            if (display && display.trim()) result.push({ section, label, value: display })
          }
        }
        return result
      }
      return Promise.all(definition.tabs.map(async (tab, index) => ({ title: tab.title || `Krok ${index + 1}`, entries: await collectFields(tab.questions ?? [], `field-${index}`, '') })))
    }
    collect().then(result => { if (active) setPages(result.filter(page => page.entries.length)) }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [definition, answers, getContext, counts])
  return <section className="form-summary" aria-labelledby="summary-title"><h2 id="summary-title">Podsumowanie</h2><p>Sprawdź wprowadzone dane. Jeśli chcesz je zmienić, wróć do odpowiedniego kroku.</p>
    {error ? <Notice kind="warning">Nie udało się przygotować podsumowania. Sprawdź warunki widoczności pól.</Notice> : !pages ? <p>Przygotowywanie podsumowania…</p> : !pages.length ? <p>Nie uzupełniono jeszcze żadnych pól.</p> : pages.map((page, i) => <section key={i}><h3>{page.title}</h3>{page.entries.map((entry, j) => <div className="summary-row" key={j}><div>{entry.html ? <SafeDescription html={entry.label} /> : <strong>{entry.label}</strong>}{entry.section && <span className="summary-section">{entry.section}</span>}</div><div>{entry.value}</div></div>)}</section>)}
  </section>
}

export function GeneratedForm({ definition }: { definition: Definition }) {
  const [page, setPage] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showSummary, setShowSummary] = useState(false)
  const [validating, setValidating] = useState(false)
  const [answers, setAnswers] = useState<Answers>({})
  const [counts, setCounts] = useState<Record<string, number>>({})
  const setAnswer = (path: string, value: string) => { setErrors(previous => { const next = { ...previous }; delete next[path]; return next }); setAnswers(previous => ({ ...previous, [path]: value })) }
  const addRepetition = (path: string) => setCounts(previous => ({ ...previous, [path]: (previous[path] ?? 1) + 1 }))
  const getContext = useMemo(() => {
    const contexts = new Map<string, ReturnType<typeof contextFor>>()
    return (scope: RepeatScope) => {
      const key = JSON.stringify(scope)
      let context = contexts.get(key)
      if (!context) {
        context = contextFor(definition, answers, counts, scope)
        contexts.set(key, context)
      }
      return context
    }
  }, [definition, answers, counts])
  function handleChange(event: React.ChangeEvent<HTMLDivElement>) {
    const input = event.target
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement)) return
    const key = input.name || input.id
    if (!key) return
    setErrors(previous => { const next = { ...previous }; delete next[key]; return next })
    if (input instanceof HTMLInputElement && input.type === 'file') {
      const names = Array.from(input.files ?? [], file => file.name)
      setAnswers(previous => ({ ...previous, [key]: names }))
      return
    }
    const value = input.value
    const checkbox = input instanceof HTMLInputElement && input.type === 'checkbox'
    const checked = checkbox && input.checked
    setAnswers(previous => {
      if (checkbox && key.includes('-consent-')) return { ...previous, [key]: checked ? 'Tak' : '' }
      if (checkbox) {
        const existing = Array.isArray(previous[key]) ? previous[key] : []
        return { ...previous, [key]: checked ? [...existing.filter(item => item !== value), value] : existing.filter(item => item !== value) }
      }
      return { ...previous, [key]: value }
    })
  }
  async function advance() {
    setValidating(true)
    try {
      const nextErrors = await validatePage(definition, page, answers, counts, getContext)
      setErrors(nextErrors)
      if (!Object.keys(nextErrors).length) {
        if (page === definition.tabs.length - 1) setShowSummary(true)
        else setPage(p => p + 1)
      }
    } finally { setValidating(false) }
  }
  const tabs = definition.tabs
  const links = definition.flow?.links
  const complexFlow = Array.isArray(links) && links.some((link, i) => link.source !== tabs[i]?.id || link.target !== tabs[i + 1]?.id) || (Array.isArray(links) && links.length !== tabs.length - 1)
  return <div className="generated-form" onChange={handleChange}><h1>{definition.title}</h1><p className="form-progress">Krok {page + 1} z {tabs.length}</p>{complexFlow && <Notice kind="warning">Formularz zawiera niestandardowy przepływ stron. Podgląd pokazuje strony w kolejności z pliku; przejścia warunkowe nie są obsługiwane.</Notice>}
    {tabs.map((tab, index) => <div key={tab.id || index} hidden={showSummary || page !== index}><h2 className="form-page-title">{tab.title || `Krok ${index + 1}`}</h2><div className="generated-fields">{sortedQuestions(tab.questions).map((question, i) => question.field && <FieldView key={i} field={question.field} path={`field-${index}-${i}`} getContext={getContext} scope={{}} answers={answers} counts={counts} addRepetition={addRepetition} setAnswer={setAnswer} errors={errors} />)}</div></div>)}
    {showSummary && <FormSummary definition={definition} answers={answers} getContext={getContext} counts={counts} />}
    <nav className="form-actions" aria-label="Nawigacja formularza">{(page > 0 || showSummary) && <Button variant="secondary" onClick={() => { setErrors({}); if (showSummary) setShowSummary(false); else setPage(p => p - 1) }}>Wstecz</Button>}{!showSummary && <Button disabled={validating} onClick={advance}>{page < tabs.length - 1 ? 'Dalej' : 'Podsumowanie'}</Button>}</nav>
    <p className="form-disclaimer">To podgląd formularza. Dane pozostają w przeglądarce i nie są wysyłane do urzędu.</p>
  </div>
}

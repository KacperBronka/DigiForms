import { useEffect, useMemo, useState } from 'react'
import jsonata from 'jsonata'
import { getFakeUserValue } from '../../lib/fakeUser'
import { getDictionary } from '../../lib/dictionaries'
import { SafeDescription } from './SafeDescription'
import { Button, Checkbox, Fieldset, FileUpload, Notice, Radio, Select, Textarea, TextInput } from '../gov'

type Option = { id?: string; name?: string; techName?: string }
type Field = { id?: string; techName?: string; type?: string; title?: string; description?: string; tooltipMessage?: string; options?: Option[]; validation?: unknown; defaultValue?: string; defaultValueType?: string; readOnly?: boolean; dictionaryName?: string; states?: { type?: string; query?: string }[]; repetingSectionGrid?: Question[]; repeatingSectionGrid?: Question[]; consentSectionConfig?: { required?: boolean; consents?: { description?: string; required?: boolean }[] } }
type Question = { x?: number; y?: number; field?: Field }
type Tab = { id?: string; title?: string; type?: string; questions?: Question[] }
type Definition = { title: string; tabs: Tab[]; flow?: { links?: { source?: string; target?: string }[] } }

export function isFormDefinition(value: unknown): value is Definition {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  return typeof data.title === 'string' && Array.isArray(data.tabs) && data.tabs.length > 0 && data.tabs.every((tab: unknown) => !!tab && typeof tab === 'object' && Array.isArray((tab as Tab).questions))
}

function ordered(questions: Question[] = []) {
  return [...questions].sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0))
}

type Answers = Record<string, string | string[]>

function selectDefault(field: Field): string | undefined {
  const value = field.defaultValueType === 'EXTERNAL_SYSTEM' ? getFakeUserValue(field.defaultValue) : field.defaultValue
  if (typeof value !== 'string' || !value) return undefined
  const options: Option[] = Array.isArray(field.options) && field.options.length ? field.options : getDictionary(field.dictionaryName) ?? []
  const index = options.findIndex(option => option && [option.name, option.techName, option.id].some(candidate => candidate != null && String(candidate) === value))
  return index < 0 ? value : options[index].name || options[index].techName || String(index)
}

type RepeatScope = Record<string, number>

export function contextFor(definition: Definition, answers: Answers, counts: Record<string, number> = {}, scope: RepeatScope = {}) {
  const enrich = (questions: Question[], prefix: string): Question[] => ordered(questions).map((question, i) => {
    const field = question.field
    if (!field) return question
    const path = `${prefix}-${i}`
    const children = field.repeatingSectionGrid ?? field.repetingSectionGrid
    const answer = answers[path] ?? (field.type?.toUpperCase() === 'SELECT' ? selectDefault(field) : field.defaultValueType === 'EXTERNAL_SYSTEM' ? getFakeUserValue(field.defaultValue) : field.defaultValue)
    const section = ['SECTION', 'REPEATING_SECTION'].includes(field.type?.toUpperCase() ?? '')
    if (!Array.isArray(children) || (!section && children.length === 0)) return { ...question, field: { ...field, __userAnswer: answer } }
    const enrichChildren = (index: number) => enrich(children, `${path}-${index}`)
    const indexes = Object.keys(answers).map(key => key.match(new RegExp(`^${path}-(\\d+)-`))).filter(Boolean).map(match => Number(match![1]))
    const count = Math.max(counts[path] ?? 1, ...indexes.map(index => index + 1))
    const repetitions = Array.from({ length: count }, (_, index) => enrichChildren(index).map(item => ({ fieldTechName: item.field?.techName, answers: (item.field as Field & { __userAnswer?: unknown })?.__userAnswer })))
    const activeChildren = enrichChildren(scope[path] ?? 0)
    return { ...question, field: { ...field, repeatingSectionGrid: activeChildren, repetingSectionGrid: activeChildren, __userAnswer: repetitions } }
  })
  return { ...definition, tabs: definition.tabs.map((tab, i) => ({ ...tab, questions: enrich(tab.questions ?? [], `field-${i}`) })) }
}

const conditionCache = new Map<string, ReturnType<typeof jsonata>>()

export async function evaluateCondition(query: string, context: unknown, repeatIndex = 0): Promise<boolean> {
  let expression = conditionCache.get(query)
  if (!expression) {
    expression = jsonata(`$boolean((${query}))`)
    if (conditionCache.size >= 500) conditionCache.delete(conditionCache.keys().next().value!)
    conditionCache.set(query, expression)
  }
  return Boolean(await expression.evaluate(context, { repeatingSectionIndex: repeatIndex }))
}

export async function evaluateFieldState(states: Field['states'], context: unknown, repeatIndex = 0) {
  const applicable = (Array.isArray(states) ? states : []).filter(state => state && ['SHOW', 'READ_ONLY'].includes(state.type?.toUpperCase() ?? ''))
  const results = await Promise.all(applicable.map(async state => ({ type: state.type?.toUpperCase(), result: await evaluateCondition(state.query || '', context, repeatIndex) })))
  return { visible: results.filter(result => result.type === 'SHOW').every(result => result.result), readOnly: results.some(result => result.type === 'READ_ONLY' && result.result) }
}

function FieldView({ field, path, getContext, scope, answers, counts, addRepetition, repeatIndex = 0 }: { field: Field; path: string; getContext: (scope: RepeatScope) => unknown; scope: RepeatScope; answers: Answers; counts: Record<string, number>; addRepetition: (path: string) => void; repeatIndex?: number }) {
  const context = getContext(scope)
  const type = (field.type ?? '').toUpperCase()
  const label = field.title || field.techName || 'Pole bez nazwy'
  const description = [field.description, field.tooltipMessage].filter(Boolean).join(' ')
  const hint = description ? <SafeDescription html={description} /> : undefined
  const validations = Array.isArray(field.validation) ? field.validation : []
  const required = validations.includes('REQUIRED')
  const external = field.defaultValueType === 'EXTERNAL_SYSTEM'
  const defaultValue = typeof field.defaultValue === 'string' ? field.defaultValue : undefined
  const currentValue = answers[path] ?? (type === 'SELECT' ? selectDefault(field) : defaultValue)
  const configuredOptions = Array.isArray(field.options) ? field.options : []
  const options: Option[] = configuredOptions.length ? configuredOptions : getDictionary(field.dictionaryName) ?? []
  const [search, setSearch] = useState('')
  const children = field.repeatingSectionGrid ?? field.repetingSectionGrid ?? []
  const states = Array.isArray(field.states) ? field.states : []
  const [dynamic, setDynamic] = useState<{ visible: boolean; readOnly: boolean; error?: boolean } | null>(states.length ? null : { visible: true, readOnly: false })
  useEffect(() => {
    let active = true
    if (!states.length) { setDynamic({ visible: true, readOnly: false }); return }
    evaluateFieldState(states, context, repeatIndex)
      .then(result => { if (active) setDynamic(result) })
      .catch(() => { if (active) setDynamic({ visible: false, readOnly: false, error: true }) })
    return () => { active = false }
  }, [context, field.states, repeatIndex])
  if (!dynamic) return null
  if (dynamic.error) return <Notice kind="warning">Nie udało się obliczyć warunku dla pola „{label}”.</Notice>
  if (!dynamic.visible) return null
  const readOnly = Boolean(field.readOnly || dynamic.readOnly)
  if (type === 'SECTION' || type === 'REPEATING_SECTION') return <section className="form-section"><h2>{label}</h2>{hint}{Array.from({ length: type === 'REPEATING_SECTION' ? (counts[path] ?? 1) : 1 }, (_, index) => <div key={index} className="generated-fields">{type === 'REPEATING_SECTION' && <h3>{label} {index + 1}</h3>}{ordered(children).map((question, i) => question.field && <FieldView key={`${path}-${index}-${i}`} path={`${path}-${index}-${i}`} field={question.field} getContext={getContext} scope={type === 'REPEATING_SECTION' ? { ...scope, [path]: index } : scope} answers={answers} counts={counts} addRepetition={addRepetition} repeatIndex={type === 'REPEATING_SECTION' ? index : repeatIndex} />)}</div>)}{type === 'REPEATING_SECTION' && <Button variant="secondary" onClick={() => addRepetition(path)}>Dodaj kolejną pozycję</Button>}</section>
  if (type === 'TEXT_BLOCK' || type === 'INFO_SECTION') return <div className="form-text">{field.title && <h2>{field.title}</h2>}{hint}</div>
  if (type === 'CONSENT_SECTION') return <Fieldset legend={label}><div className="generated-choices">{hint}{field.consentSectionConfig?.consents?.map((consent, i) => <Checkbox key={i} id={`${path}-consent-${i}`} value="Tak" label={consent.description ? <SafeDescription html={consent.description} /> : `Zgoda ${i + 1}`} checked={answers[`${path}-consent-${i}`] === 'Tak'} onChange={() => {}} disabled={readOnly} required={consent.required ?? field.consentSectionConfig?.required} />)}</div></Fieldset>
  if (external && type !== 'SELECT') return <TextInput id={path} label={label} hint={hint} type={type === 'DATEPICKER' ? 'date' : 'text'} required={required} readOnly value={getFakeUserValue(defaultValue) ?? ''} />
  if (field.dictionaryName && options.length === 0) return <Notice kind="warning">Pole „{label}” wymaga słownika „{field.dictionaryName}”, który nie jest jeszcze podłączony.</Notice>
  if (type === 'RADIO' || type === 'CHECKBOX') return <Fieldset legend={`${label}${required ? ' (wymagane)' : ''}`}><div className="generated-choices">{hint}{options.length ? options.map((option, i) => type === 'RADIO' ? <Radio key={i} name={path} value={option.name || option.techName || String(i)} label={option.name || option.techName || `Opcja ${i + 1}`} required={required} disabled={readOnly} checked={currentValue === (option.name || option.techName || String(i))} onChange={() => {}} /> : <Checkbox key={i} name={path} value={option.name || option.techName || String(i)} label={option.name || option.techName || `Opcja ${i + 1}`} disabled={readOnly} checked={Array.isArray(currentValue) && currentValue.includes(option.name || option.techName || String(i))} onChange={() => {}} />) : <Notice kind="warning">Brak opcji do wyboru.</Notice>}</div></Fieldset>
  if (type === 'SELECT') {
    const value = typeof currentValue === 'string' ? currentValue : ''
    const indexedOptions = options.map((option, index) => ({ option, value: option.name || option.techName || String(index) }))
    const filtered = indexedOptions.filter(item => (item.option.name || item.option.techName || '').toLocaleLowerCase('pl').includes(search.toLocaleLowerCase('pl')) || item.value === value)
    const missingValue = value && !indexedOptions.some(item => item.value === value)
    return <div className="dictionary-select">{options.length > 15 && <TextInput id={`${path}-search`} label={`Wyszukaj: ${label}`} disabled={readOnly || external} value={search} onChange={event => { event.stopPropagation(); setSearch(event.target.value) }} />}<Select id={path} label={label} hint={hint} required={required} disabled={readOnly || external} value={value} onChange={() => {}}><option value="">Wybierz</option>{missingValue && <option value={value}>{value}</option>}{filtered.map(item => <option key={item.option.id || item.value} value={item.value}>{item.option.name || item.option.techName || item.value}</option>)}</Select></div>
  }
  if (type === 'TEXTAREA') return <Textarea id={path} label={label} hint={hint} required={required} readOnly={readOnly} value={typeof currentValue === 'string' ? currentValue : ''} onChange={() => {}} />
  if (type === 'FILE_UPLOADER') return <FileUpload id={path} label={label} hint={hint} required={required} disabled={readOnly} />
  if (['TEXT_FIELD', 'NUMBER', 'DATEPICKER'].includes(type)) return <TextInput id={path} label={label} hint={hint} type={type === 'NUMBER' ? 'number' : type === 'DATEPICKER' ? 'date' : validations.includes('EMAIL') ? 'email' : 'text'} required={required} readOnly={readOnly} value={typeof currentValue === 'string' ? currentValue : ''} onChange={() => {}} />
  return <Notice kind="warning">Nieobsługiwany typ pola „{field.type || 'nieznany'}” ({label}).</Notice>
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
        for (const [index, question] of ordered(questions).entries()) {
          const field = question.field
          if (!field) continue
          const path = `${prefix}-${index}`
          const show = (Array.isArray(field.states) ? field.states : []).filter(state => state && state.type?.toUpperCase() === 'SHOW')
          const { visible } = await evaluateFieldState(show, getContext(scope), repeatIndex)
          if (!visible) continue
          const type = (field.type || '').toUpperCase()
          const label = field.title || field.techName || 'Pole bez nazwy'
          const children = field.repeatingSectionGrid ?? field.repetingSectionGrid
          if ((type === 'SECTION' || type === 'REPEATING_SECTION') && Array.isArray(children)) {
            const matches = Object.keys(answers).map(key => key.match(new RegExp(`^${path}-(\\d+)-`))).filter(Boolean).map(match => Number(match![1]))
            const count = type === 'REPEATING_SECTION' ? Math.max(counts[path] ?? 1, ...matches.map(i => i + 1)) : 1
            for (let i = 0; i < count; i++) result.push(...await collectFields(children, `${path}-${i}`, type === 'REPEATING_SECTION' ? `${label} ${i + 1}` : label, type === 'REPEATING_SECTION' ? i : repeatIndex, type === 'REPEATING_SECTION' ? { ...scope, [path]: i } : scope))
          } else if (type === 'CONSENT_SECTION') {
            field.consentSectionConfig?.consents?.forEach((consent, i) => {
              if (answers[`${path}-consent-${i}`] === 'Tak') result.push({ section: label, label: consent.description || `Zgoda ${i + 1}`, value: 'Tak', html: Boolean(consent.description) })
            })
          } else if (['TEXT_FIELD', 'TEXTAREA', 'NUMBER', 'DATEPICKER', 'SELECT', 'RADIO', 'CHECKBOX', 'FILE_UPLOADER'].includes(type)) {
            const value = answers[path] ?? (type === 'SELECT' ? selectDefault(field) : field.defaultValueType === 'EXTERNAL_SYSTEM' ? getFakeUserValue(field.defaultValue) : field.defaultValue)
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
  const [answers, setAnswers] = useState<Answers>({})
  const [counts, setCounts] = useState<Record<string, number>>({})
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
  const tabs = definition.tabs
  const links = definition.flow?.links
  const complexFlow = Array.isArray(links) && links.some((link, i) => link.source !== tabs[i]?.id || link.target !== tabs[i + 1]?.id) || (Array.isArray(links) && links.length !== tabs.length - 1)
  return <div className="generated-form" onChange={handleChange}><h1>{definition.title}</h1><p className="form-progress">Krok {page + 1} z {tabs.length}</p>{complexFlow && <Notice kind="warning">Formularz zawiera niestandardowy przepływ stron. Podgląd pokazuje strony w kolejności z pliku; przejścia warunkowe nie są obsługiwane.</Notice>}
    {tabs.map((tab, index) => <div key={tab.id || index} hidden={page !== index}><h2 className="form-page-title">{tab.title || `Krok ${index + 1}`}</h2><div className="generated-fields">{ordered(tab.questions).map((question, i) => question.field && <FieldView key={i} field={question.field} path={`field-${index}-${i}`} getContext={getContext} scope={{}} answers={answers} counts={counts} addRepetition={addRepetition} />)}</div></div>)}
    {page === tabs.length - 1 && <FormSummary definition={definition} answers={answers} getContext={getContext} counts={counts} />}
    <nav className="form-actions" aria-label="Nawigacja formularza">{page > 0 && <Button variant="secondary" onClick={() => setPage(p => p - 1)}>Wstecz</Button>}{page < tabs.length - 1 && <Button onClick={() => setPage(p => p + 1)}>Dalej</Button>}</nav>
    <p className="form-disclaimer">To podgląd formularza. Dane pozostają w przeglądarce i nie są wysyłane do urzędu.</p>
  </div>
}

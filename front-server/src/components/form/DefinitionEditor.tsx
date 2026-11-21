import { useEffect, useId, useRef, useState } from 'react'
import jsonata from 'jsonata'
import { Button, Checkbox, Notice, Select, Textarea, TextInput } from '../gov'

type Item = Record<string, any> // Definitions can contain server-specific properties that must be retained.
type Path = (string | number)[]
const types = ['TEXT_FIELD', 'TEXTAREA', 'NUMBER', 'DATEPICKER', 'SELECT', 'RADIO', 'CHECKBOX', 'SECTION', 'REPEATING_SECTION', 'TEXT_BLOCK', 'INFO_SECTION', 'CONSENT_SECTION', 'FILE_UPLOADER']

export function setDefinitionValue<T>(definition: T, path: Path, value: unknown): T {
  const next = structuredClone(definition)
  let node: any = next
  for (const key of path.slice(0, -1)) node = node[key]
  node[path[path.length - 1]] = value
  return next
}

export function sortedQuestions(questions: Item[]): Item[] {
  return [...questions].sort((a, b) => (a?.y ?? 0) - (b?.y ?? 0) || (a?.x ?? 0) - (b?.x ?? 0))
}

export function moveItem<T>(items: T[], index: number, direction: number): T[] {
  const next = [...items]
  const target = index + direction
  if (target < 0 || target >= next.length) return next
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export function queryErrors(definition: Item): string[] {
  const errors: string[] = []
  const visit = (questions: Item[], label: string) => {
    for (const question of questions) {
      const field = question?.field
      if (!field || typeof field !== 'object') continue
      const name = field.title || field.techName || 'pole bez nazwy'
      if (Array.isArray(field.states)) field.states.forEach((state: Item, i: number) => {
        if (!state || !['SHOW', 'READ_ONLY'].includes(state.type?.toUpperCase?.())) return
        try { if (typeof state.query !== 'string' || !state.query.trim()) throw new Error(); jsonata(`$boolean((${state.query}))`) }
        catch { errors.push(`${label} / ${name}: niepoprawny warunek ${i + 1}.`) }
      })
      const children = field.repeatingSectionGrid ?? field.repetingSectionGrid
      if (Array.isArray(children)) visit(children, `${label} / ${name}`)
    }
  }
  for (const [i, tab] of (definition.tabs ?? []).entries()) if (Array.isArray(tab?.questions)) visit(tab.questions, tab.title || `Strona ${i + 1}`)
  return errors
}

function FieldDialog({ name, children }: { name: string; children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  return <>
    <Button ref={trigger} variant="secondary" aria-haspopup="dialog" aria-label={`Edytuj pole ${name}`} onClick={() => dialog.current?.showModal()}>Edytuj</Button>
    <dialog ref={dialog} className="gp-dialog editor-dialog" aria-labelledby={titleId} onClose={() => trigger.current?.focus()}>
      <h2 id={titleId}>Edycja pola: {name}</h2>
      {children}
      <Button variant="secondary" onClick={() => dialog.current?.close()}>Zamknij</Button>
    </dialog>
  </>
}

export function DefinitionEditor({ definition, onChange, onPendingChange }: { definition: Item; onChange: (value: Item) => void; onPendingChange: (pending: boolean) => void }) {
  const [advanced, setAdvanced] = useState<Record<string, string>>({})
  const [advancedErrors, setAdvancedErrors] = useState<Record<string, string>>({})
  const [advancedBaseline, setAdvancedBaseline] = useState<Record<string, string>>({})
  useEffect(() => { onPendingChange(Object.keys(advancedErrors).length > 0) }, [advancedErrors, onPendingChange])
  const set = (path: Path, value: unknown) => onChange(setDefinitionValue(definition, path, value))
  const input = (path: Path, label: string, value: unknown) => <TextInput id={`editor-${path.join('-')}`} label={label} value={typeof value === 'string' ? value : ''} onChange={event => set(path, event.target.value)} />
  const controls = (label: string, index: number, count: number, up: () => void, down: () => void, remove: () => void) => <div className="editor-actions"><Button variant="secondary" disabled={index === 0 || Object.keys(advancedErrors).length > 0} onClick={up} aria-label={`Przenieś ${label} w górę`}>↑</Button><Button variant="secondary" disabled={index === count - 1 || Object.keys(advancedErrors).length > 0} onClick={down} aria-label={`Przenieś ${label} w dół`}>↓</Button><Button variant="secondary" disabled={Object.keys(advancedErrors).length > 0} onClick={remove} aria-label={`Usuń ${label}`}>Usuń</Button></div>
  function questionsEditor(questions: Item[], path: Path): React.ReactNode {
    const sorted = sortedQuestions(questions)
    const reorder = (index: number, direction: number) => set(path, moveItem(sorted, index, direction).map((question, i) => ({ ...question, x: 0, y: i })))
    const remove = (index: number) => set(path, sorted.filter((_, i) => i !== index))
    return <div className="editor-questions">{sorted.map((question, index) => {
      const originalIndex = questions.indexOf(question)
      const fieldPath = [...path, originalIndex, 'field']
      const field = question?.field
      if (!field || typeof field !== 'object') return <Notice key={originalIndex} kind="warning">Nie można edytować niepoprawnego pola {index + 1}.</Notice>
      const key = fieldPath.join('-')
      const fieldSet = (property: string, value: unknown) => set([...fieldPath, property], value)
      const childrenKey = Array.isArray(field.repeatingSectionGrid) ? 'repeatingSectionGrid' : Array.isArray(field.repetingSectionGrid) ? 'repetingSectionGrid' : 'repeatingSectionGrid'
      const children = Array.isArray(field[childrenKey]) ? field[childrenKey] : []
      const options: Item[] = Array.isArray(field.options) ? field.options : []
      const states: Item[] = Array.isArray(field.states) ? field.states : []
      const validation: unknown[] = Array.isArray(field.validation) ? field.validation : []
      const name = field.title || field.techName || `Pole ${index + 1}`
      return <div className="editor-field" key={originalIndex}><div className="editor-field-header"><div className="editor-field-name">{name} <span className="gp-muted">({field.type || 'brak typu'})</span></div>
        {controls(`pole ${index + 1}`, index, sorted.length, () => reorder(index, -1), () => reorder(index, 1), () => remove(index))}
        </div><FieldDialog name={name}>
        <div className="editor-grid">{input([...fieldPath, 'title'], 'Tytuł pola', field.title)}{input([...fieldPath, 'techName'], 'Nazwa techniczna', field.techName)}
          <Select id={`${key}-type`} label="Typ pola" value={field.type || ''} onChange={event => fieldSet('type', event.target.value)}><option value="">Wybierz typ</option>{field.type && !types.includes(field.type) && <option value={field.type}>{field.type}</option>}{types.map(type => <option key={type} value={type}>{type}</option>)}</Select>
          {input([...fieldPath, 'defaultValue'], 'Wartość domyślna', field.defaultValue)}{input([...fieldPath, 'defaultValueType'], 'Źródło wartości domyślnej', field.defaultValueType)}{input([...fieldPath, 'dictionaryName'], 'Nazwa słownika', field.dictionaryName)}
          <Textarea id={`${key}-description`} label="Opis" value={typeof field.description === 'string' ? field.description : ''} onChange={event => fieldSet('description', event.target.value)} />
          <Checkbox label="Tylko do odczytu" checked={!!field.readOnly} onChange={event => fieldSet('readOnly', event.target.checked)} />
          {['REQUIRED', 'EMAIL'].map(rule => <Checkbox key={rule} label={rule === 'REQUIRED' ? 'Pole wymagane' : 'Adres e-mail'} checked={validation.includes(rule)} onChange={event => fieldSet('validation', event.target.checked ? [...validation.filter(value => value !== rule), rule] : validation.filter(value => value !== rule))} />)}
          {!Array.isArray(field.validation) && field.validation != null && <p>Nietypowa konfiguracja walidacji zostanie zachowana, dopóki nie zmienisz powyższych ustawień.</p>}
        </div>
        {(['SELECT', 'RADIO', 'CHECKBOX'].includes(field.type) || options.length > 0) && <div className="editor-list"><h4>Opcje</h4>{options.map((option, i) => !option || typeof option !== 'object' ? <Notice kind="warning" key={i}>Opcja {i + 1} ma nieobsługiwany format. Popraw ją we właściwościach zaawansowanych.</Notice> : <div className="editor-subitem" key={i}>{input([...fieldPath, 'options', i, 'name'], `Nazwa opcji ${i + 1}`, option?.name)}{input([...fieldPath, 'options', i, 'techName'], `Nazwa techniczna opcji ${i + 1}`, option?.techName)}{controls(`opcję ${i + 1}`, i, options.length, () => fieldSet('options', moveItem(options, i, -1)), () => fieldSet('options', moveItem(options, i, 1)), () => fieldSet('options', options.filter((_, n) => n !== i)))}</div>)}<Button variant="secondary" onClick={() => fieldSet('options', [...options, { name: '', techName: '' }])}>Dodaj opcję</Button></div>}
        <div className="editor-list"><h4>Warunki</h4>{states.map((state, i) => !state || typeof state !== 'object' ? <Notice kind="warning" key={i}>Warunek {i + 1} ma nieobsługiwany format. Popraw go we właściwościach zaawansowanych.</Notice> : <div className="editor-subitem" key={i}><Select id={`${key}-state-${i}`} label={`Typ warunku ${i + 1}`} value={state?.type || ''} onChange={event => set([...fieldPath, 'states', i, 'type'], event.target.value)}><option value="">Wybierz</option>{state?.type && !['SHOW', 'READ_ONLY'].includes(state.type) && <option value={state.type}>{state.type}</option>}<option value="SHOW">Pokaż</option><option value="READ_ONLY">Tylko do odczytu</option></Select><Textarea id={`${key}-query-${i}`} label={`Wyrażenie JSONata ${i + 1}`} value={typeof state?.query === 'string' ? state.query : ''} onChange={event => set([...fieldPath, 'states', i, 'query'], event.target.value)} error={(() => { try { if (!state?.query?.trim()) throw new Error(); jsonata(`$boolean((${state.query}))`); return undefined } catch { return 'Niepoprawne wyrażenie JSONata.' } })()} /><Button variant="secondary" onClick={() => fieldSet('states', states.filter((_, n) => n !== i))}>Usuń warunek</Button></div>)}<Button variant="secondary" onClick={() => fieldSet('states', [...states, { type: 'SHOW', query: '' }])}>Dodaj warunek</Button></div>
        {(['SECTION', 'REPEATING_SECTION'].includes(field.type) || children.length > 0) && <div className="editor-list"><h4>Pola sekcji</h4>{questionsEditor(children, [...fieldPath, childrenKey])}{!Array.isArray(field[childrenKey]) && <Button variant="secondary" onClick={() => fieldSet(childrenKey, [])}>Utwórz listę pól sekcji</Button>}</div>}
        <details><summary>Właściwości zaawansowane pola (JSON)</summary><p>Możesz poprawić pozostałe właściwości, w tym konfigurację zgód. Zmiany zastosuj przed zatwierdzeniem formularza.</p><Textarea id={`${key}-advanced`} label="Właściwości pola" value={advanced[key] ?? JSON.stringify(field, null, 2)} onChange={event => { setAdvancedBaseline(previous => key in previous ? previous : { ...previous, [key]: JSON.stringify(field) }); setAdvanced(previous => ({ ...previous, [key]: event.target.value })); setAdvancedErrors(previous => ({ ...previous, [key]: 'Zastosuj albo odrzuć zmiany JSON.' })) }} error={advancedErrors[key]} /><div className="editor-actions"><Button variant="secondary" onClick={() => { try { if (advancedBaseline[key] && advancedBaseline[key] !== JSON.stringify(field)) { setAdvancedErrors(previous => ({ ...previous, [key]: 'Pole zostało zmienione. Odrzuć edycję JSON i rozpocznij ją ponownie.' })); return } const parsed = JSON.parse(advanced[key] ?? JSON.stringify(field)); if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error(); set(fieldPath, parsed); setAdvanced(previous => { const next = { ...previous }; delete next[key]; return next }); setAdvancedErrors(previous => { const next = { ...previous }; delete next[key]; return next }); setAdvancedBaseline(previous => { const next = { ...previous }; delete next[key]; return next }) } catch { setAdvancedErrors(previous => ({ ...previous, [key]: 'Wprowadź poprawny obiekt JSON.' })) } }}>Zastosuj JSON</Button><Button variant="secondary" onClick={() => { setAdvanced(previous => { const next = { ...previous }; delete next[key]; return next }); setAdvancedErrors(previous => { const next = { ...previous }; delete next[key]; return next }); setAdvancedBaseline(previous => { const next = { ...previous }; delete next[key]; return next }) }}>Odrzuć zmiany JSON</Button></div></details>
      </FieldDialog></div>
    })}<Button variant="secondary" disabled={Object.keys(advancedErrors).length > 0} onClick={() => set(path, [...sorted, { x: 0, y: sorted.length ? Math.max(...sorted.map(q => Number(q?.y) || 0)) + 1 : 0, field: { type: 'TEXT_FIELD', title: '', techName: '' } }])}>Dodaj pole</Button></div>
  }
  return <div className="definition-editor">{Object.keys(advancedErrors).length > 0 && <Notice kind="warning">Niezastosowane zmiany w JSON pola nie zostaną uwzględnione w podglądzie ani zatwierdzeniu.</Notice>}{input(['title'], 'Tytuł formularza', definition.title)}{definition.tabs.map((tab: Item, i: number) => <section className="editor-page" key={i}><h2>Strona {i + 1}</h2>{controls(`stronę ${i + 1}`, i, definition.tabs.length, () => set(['tabs'], moveItem(definition.tabs, i, -1)), () => set(['tabs'], moveItem(definition.tabs, i, 1)), () => { if (definition.tabs.length > 1) set(['tabs'], definition.tabs.filter((_: unknown, index: number) => index !== i)) })}{input(['tabs', i, 'title'], 'Tytuł strony', tab.title)}{questionsEditor(tab.questions, ['tabs', i, 'questions'])}</section>)}<Button variant="secondary" disabled={Object.keys(advancedErrors).length > 0} onClick={() => set(['tabs'], [...definition.tabs, { id: crypto.randomUUID(), title: '', questions: [] }])}>Dodaj stronę</Button></div>
}

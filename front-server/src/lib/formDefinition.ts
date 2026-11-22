import jsonata from 'jsonata'
import { getFakeUserValue } from './fakeUser'
import { getDictionary } from './dictionaries'
import { validateValue } from './validators'

type Option = { id?: string; name?: string; techName?: string }
export type Field = {
  id?: string
  techName?: string
  type?: string
  title?: string
  description?: string
  tooltipMessage?: string
  options?: Option[]
  validation?: unknown
  defaultValue?: string
  defaultValueType?: string
  readOnly?: boolean
  dictionaryName?: string
  states?: { type?: string; query?: string }[]
  repetingSectionGrid?: Question[]
  repeatingSectionGrid?: Question[]
  consentSectionConfig?: { required?: boolean; consents?: { description?: string; required?: boolean }[] }
}
export type Question = { x?: number; y?: number; field?: Field }
type Tab = { id?: string; title?: string; type?: string; questions?: Question[] }
export type Definition = {
  title: string
  tabs: Tab[]
  flow?: { links?: { source?: string; target?: string }[] }
}

export function isFormDefinition(value: unknown): value is Definition {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  return (
    typeof data.title === 'string' &&
    Array.isArray(data.tabs) &&
    data.tabs.length > 0 &&
    data.tabs.every(
      (tab: unknown) => !!tab && typeof tab === 'object' && Array.isArray((tab as Tab).questions),
    )
  )
}

export function sortedQuestions<T extends { x?: number; y?: number }>(questions: T[] = []) {
  return [...questions].sort((a, b) => (a?.y ?? 0) - (b?.y ?? 0) || (a?.x ?? 0) - (b?.x ?? 0))
}

export type Answers = Record<string, string | string[]>

// Older definitions use the misspelled grid key.
export function sectionQuestions(field: Field) {
  return field.repeatingSectionGrid ?? field.repetingSectionGrid
}

export function fieldOptions(field: Field): Option[] {
  return Array.isArray(field.options) && field.options.length
    ? field.options
    : (getDictionary(field.dictionaryName) ?? [])
}

export function optionValue(option: Option, index: number) {
  return option.name || option.techName || String(index)
}

function configuredDefault(field: Field) {
  return field.defaultValueType === 'EXTERNAL_SYSTEM'
    ? getFakeUserValue(field.defaultValue)
    : field.defaultValue
}

export function fieldDefault(field: Field) {
  if (field.type?.toUpperCase() === 'SELECT') return selectDefault(field)
  return configuredDefault(field)
}

export function repetitionCount(path: string, answers: Answers, counts: Record<string, number>) {
  const pattern = new RegExp(`^${path}-(\\d+)-`)
  let count = counts[path] ?? 1
  for (const key of Object.keys(answers)) {
    const match = pattern.exec(key)
    if (match) count = Math.max(count, Number(match[1]) + 1)
  }
  return count
}

function selectDefault(field: Field): string | undefined {
  const value = configuredDefault(field)
  if (typeof value !== 'string' || !value) return undefined
  const options = fieldOptions(field)
  const index = options.findIndex(
    (option) =>
      option &&
      [option.name, option.techName, option.id].some(
        (candidate) => candidate != null && String(candidate) === value,
      ),
  )
  return index < 0 ? value : optionValue(options[index], index)
}

export type RepeatScope = Record<string, number>

export function contextFor(
  definition: Definition,
  answers: Answers,
  counts: Record<string, number> = {},
  scope: RepeatScope = {},
) {
  const enrich = (questions: Question[], prefix: string): Question[] =>
    sortedQuestions(questions).map((question, i) => {
      const field = question.field
      if (!field) return question
      const path = `${prefix}-${i}`
      const children = sectionQuestions(field)
      const answer = answers[path] ?? fieldDefault(field)
      const section = ['SECTION', 'REPEATING_SECTION'].includes(field.type?.toUpperCase() ?? '')
      if (!Array.isArray(children) || (!section && children.length === 0))
        return { ...question, field: { ...field, __userAnswer: answer } }
      const enrichChildren = (index: number) => enrich(children, `${path}-${index}`)
      const count = repetitionCount(path, answers, counts)
      const repetitions = Array.from({ length: count }, (_, index) =>
        enrichChildren(index).map((item) => ({
          fieldTechName: item.field?.techName,
          answers: (item.field as Field & { __userAnswer?: unknown })?.__userAnswer,
        })),
      )
      const activeChildren = enrichChildren(scope[path] ?? 0)
      return {
        ...question,
        field: {
          ...field,
          repeatingSectionGrid: activeChildren,
          repetingSectionGrid: activeChildren,
          __userAnswer: repetitions,
        },
      }
    })
  return {
    ...definition,
    tabs: definition.tabs.map((tab, i) => ({ ...tab, questions: enrich(tab.questions ?? [], `field-${i}`) })),
  }
}

export function compileCondition(query: string) {
  return jsonata(`$boolean((${query}))`)
}

const conditionCache = new Map<string, ReturnType<typeof jsonata>>()

export async function evaluateCondition(query: string, context: unknown, repeatIndex = 0): Promise<boolean> {
  let expression = conditionCache.get(query)
  if (!expression) {
    expression = compileCondition(query)
    if (conditionCache.size >= 500) conditionCache.delete(conditionCache.keys().next().value!)
    conditionCache.set(query, expression)
  }
  return Boolean(await expression.evaluate(context, { repeatingSectionIndex: repeatIndex }))
}

export async function evaluateFieldState(states: Field['states'], context: unknown, repeatIndex = 0) {
  const applicable = (Array.isArray(states) ? states : []).filter(
    (state) => state && ['SHOW', 'READ_ONLY'].includes(state.type?.toUpperCase() ?? ''),
  )
  const results = await Promise.all(
    applicable.map(async (state) => ({
      type: state.type?.toUpperCase(),
      result: await evaluateCondition(state.query || '', context, repeatIndex),
    })),
  )
  return {
    visible: results.filter((result) => result.type === 'SHOW').every((result) => result.result),
    readOnly: results.some((result) => result.type === 'READ_ONLY' && result.result),
  }
}

// Evaluate descendants independently of rendering: a hidden section must still
// be able to become visible when an answer changes.
export async function sectionHasVisibleFields(
  field: Field,
  path: string,
  getContext: (scope: RepeatScope) => unknown,
  counts: Record<string, number>,
  scope: RepeatScope = {},
  repeatIndex = 0,
): Promise<boolean> {
  const children = sectionQuestions(field) ?? []
  const repeating = field.type?.toUpperCase() === 'REPEATING_SECTION'
  const count = repeating ? (counts[path] ?? 1) : 1
  for (let index = 0; index < count; index++) {
    const childScope = repeating ? { ...scope, [path]: index } : scope
    const childRepeatIndex = repeating ? index : repeatIndex
    for (const [i, question] of sortedQuestions(children).entries()) {
      const child = question.field
      if (!child) continue
      try {
        if (!(await evaluateFieldState(child.states, getContext(childScope), childRepeatIndex)).visible)
          continue
      } catch {
        // Keep the section mounted so FieldView can show its condition warning.
        return true
      }
      const type = (child.type ?? '').toUpperCase()
      if (type === 'SECTION' || type === 'REPEATING_SECTION') {
        if (
          await sectionHasVisibleFields(
            child,
            `${path}-${index}-${i}`,
            getContext,
            counts,
            childScope,
            childRepeatIndex,
          )
        )
          return true
      } else if (type === 'CONSENT_SECTION') {
        if (child.consentSectionConfig?.consents?.length) return true
      } else if (type !== 'TEXT_BLOCK' && type !== 'INFO_SECTION') return true
    }
  }
  return false
}

export async function validatePage(
  definition: Definition,
  page: number,
  answers: Answers,
  counts: Record<string, number>,
  getContext: (scope: RepeatScope) => unknown,
): Promise<Record<string, string>> {
  const errors: Record<string, string> = {}
  async function visit(questions: Question[], prefix: string, scope: RepeatScope = {}, repeatIndex = 0) {
    for (const [i, question] of sortedQuestions(questions).entries()) {
      const field = question.field
      if (!field) continue
      const path = `${prefix}-${i}`
      try {
        if (!(await evaluateFieldState(field.states, getContext(scope), repeatIndex)).visible) continue
      } catch {
        errors[path] = 'Nie udało się obliczyć warunku widoczności pola.'
        continue
      }
      const type = (field.type ?? '').toUpperCase()
      if (type === 'SECTION' || type === 'REPEATING_SECTION') {
        const repeating = type === 'REPEATING_SECTION'
        for (let index = 0; index < (repeating ? (counts[path] ?? 1) : 1); index++)
          await visit(
            sectionQuestions(field) ?? [],
            `${path}-${index}`,
            repeating ? { ...scope, [path]: index } : scope,
            repeating ? index : repeatIndex,
          )
      } else if (type === 'CONSENT_SECTION') {
        field.consentSectionConfig?.consents?.forEach((consent, index) => {
          if (
            (consent.required ?? field.consentSectionConfig?.required) &&
            answers[`${path}-consent-${index}`] !== 'Tak'
          )
            errors[`${path}-consent-${index}`] = 'Ta zgoda jest wymagana.'
        })
      } else if (!['TEXT_BLOCK', 'INFO_SECTION'].includes(type)) {
        const value = answers[path] ?? fieldDefault(field)
        const error = validateValue(field.validation, value)
        if (error) errors[path] = error
      }
    }
  }
  await visit(definition.tabs[page]?.questions ?? [], `field-${page}`)
  return errors
}

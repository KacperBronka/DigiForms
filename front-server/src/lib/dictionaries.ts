import countries from '../data/countries.json'

type DictionaryOption = { id: string; name: string }

const countryOptions = countries.map(country => ({ id: country.code, name: country.name }))
  .sort((a, b) => a.name.localeCompare(b.name, 'pl'))

/** Resolve locally available dictionaries by the name used in a form definition. */
export function getDictionary(name: string | undefined): DictionaryOption[] | undefined {
  if (name?.trim().toLocaleLowerCase('pl') !== 'kraje') return undefined
  return countryOptions
}

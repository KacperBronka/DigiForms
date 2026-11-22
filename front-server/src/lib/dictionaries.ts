import countries from '../data/countries.json'

type DictionaryOption = { id: string; name: string }

const countryOptions = countries.map(country => ({ id: country.code, name: country.name }))
  .sort((a, b) => a.name.localeCompare(b.name, 'pl'))

// TERYT voivodeship identifiers (WOJ), kept as strings to preserve leading zeroes.
const voivodeshipOptions = [
  ['02', 'dolnośląskie'], ['04', 'kujawsko-pomorskie'], ['06', 'lubelskie'],
  ['08', 'lubuskie'], ['10', 'łódzkie'], ['12', 'małopolskie'],
  ['14', 'mazowieckie'], ['16', 'opolskie'], ['18', 'podkarpackie'],
  ['20', 'podlaskie'], ['22', 'pomorskie'], ['24', 'śląskie'],
  ['26', 'świętokrzyskie'], ['28', 'warmińsko-mazurskie'],
  ['30', 'wielkopolskie'], ['32', 'zachodniopomorskie'],
].map(([id, name]) => ({ id, name }))

/** Resolve locally available dictionaries by the name used in a form definition. */
export function getDictionary(name: string | undefined): DictionaryOption[] | undefined {
  switch (name?.trim().toLocaleLowerCase('pl')) {
    case 'kraje': return countryOptions
    case 'teryt_dowodowy': return voivodeshipOptions
    default: return undefined
  }
}

import fakeUser from '../data/test-user.json'

/** Resolve a registry binding such as `PESEL.name` against the test data. */
export function getFakeUserValue(binding: unknown): string | undefined {
  if (typeof binding !== 'string') return undefined
  const parts = binding.split('.')
  if (parts.length !== 2) return undefined
  const [source, attribute] = parts
  if (!Object.hasOwn(fakeUser, source)) return undefined
  const registry = fakeUser[source as keyof typeof fakeUser] as Record<string, string>
  return Object.hasOwn(registry, attribute) ? registry[attribute] : undefined
}

export const DRAFT_KEY = 'digi-forms-draft'
export const FORM_KEY = 'digi-forms-json'
export type StoredFile = { name: string; data: unknown; approved?: boolean }

export function writeStored(key: string, file: StoredFile) {
  sessionStorage.setItem(key, JSON.stringify(file))
}

export function readStored(key: string): StoredFile | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) || 'null')
    if (value && typeof value === 'object' && 'name' in value && typeof value.name === 'string' && 'data' in value) return { name: value.name, data: value.data, approved: 'approved' in value && value.approved === true }
  } catch { /* Storage may be unavailable or malformed. */ }
  return null
}

export function downloadDefinition(file: StoredFile) {
  const blob = new Blob([JSON.stringify(file.data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${file.name.replace(/\.[^.]+$/, '') || 'formularz'}.json`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

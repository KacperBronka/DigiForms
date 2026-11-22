const mimeTypes: Record<string, string> = {
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', json: 'application/json',
}

export function validateUpload(file: File, maxBytes: number, allowJson = false): string | undefined {
  if (!file.name || Array.from(file.name).length > 250 || /[;:></\\|'*%$]/.test(file.name)) return "Nazwa pliku musi mieć od 1 do 250 znaków i nie może zawierać znaków ; : > < / \\ | ' * % $."
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!file.name.includes('.') || !mimeTypes[extension] || (extension === 'json' && !allowJson)) return 'Nieobsługiwany format pliku.'
  if (!file.size) return 'Plik nie może być pusty.'
  if (file.size > maxBytes) return `Maksymalny rozmiar pliku to ${maxBytes} bajtów.`
  const mime = file.type.split(';')[0].trim().toLowerCase()
  if (mime && mime !== 'application/octet-stream' && mime !== mimeTypes[extension]) return 'Typ MIME nie odpowiada rozszerzeniu pliku.'
}

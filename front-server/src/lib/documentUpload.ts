const documentExtensions = ['.pdf', '.doc', '.docx', '.ods', '.xlsx', '.jpg', '.jpeg', '.png']
export const acceptedFileTypes = [...documentExtensions, '.json'].join(',')
export const documentSizeError = 'Plik musi mieć od 1 bajtu do 20 MB.'

export function isDocumentName(name: string) {
  const extension = name.slice(name.lastIndexOf('.')).toLowerCase()
  return documentExtensions.includes(extension)
}

export function validDocumentSize(bytes: number) {
  return bytes > 0 && bytes <= 20 * 1024 * 1024
}

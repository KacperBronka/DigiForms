import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Button, FileUpload, Loader } from '#/components/gov'
import { isFormDefinition } from '#/components/form/GeneratedForm'
import { DRAFT_KEY } from '#/lib/formDraft'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const selection = useRef(0)

  function selectFile(selected: File | undefined) {
    selection.current += 1
    setFile(selected ?? null)
    setError(undefined)
    setLoading(false)
  }

  async function confirmFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    if (!file) {
      setError('Wybierz plik przed potwierdzeniem.')
      return
    }
    if (!/\.(pdf|doc|docx|ods|xlsx|jpg|jpeg|png)$/i.test(file.name)) {
      setError('Wybierz plik w jednym z dozwolonych formatów.')
      return
    }
    if (file.size === 0) {
      setError('Plik nie może być pusty.')
      return
    }
    const current = selection.current
    setLoading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      let response: Response
      try { response = await fetch('/api/process-document', { method: 'POST', body }) }
      catch { throw new Error('Nie udało się połączyć z serwerem. Spróbuj ponownie.') }
      let data: unknown
      try { data = await response.json() } catch { throw new Error('Serwer zwrócił niepoprawną odpowiedź.') }
      if (!response.ok) throw new Error(data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : 'Nie udało się przetworzyć dokumentu.')
      if (!isFormDefinition(data)) throw new Error('Serwer zwrócił JSON bez rozpoznanej definicji formularza.')
      if (current !== selection.current) return
      try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ name: file.name, data })) }
      catch { throw new Error('Nie udało się zachować pliku w tej karcie przeglądarki. Sprawdź dostępne miejsce i spróbuj ponownie.') }
      await navigate({ to: '/edit' })
    } catch (error) {
      if (current === selection.current) setError(error instanceof Error ? error.message : 'Nie udało się połączyć z serwerem. Spróbuj ponownie.')
    } finally {
      if (current === selection.current) setLoading(false)
    }
  }

  return <>
    <section className="hero"><div className="container upload-hero"><div className="eyebrow"><span /> KREATOR DOKUMENTÓW</div><h1>Rozpocznij od swojego pliku.</h1><p>Wybierz dokument, a następnie potwierdź swój wybór.</p></div></section>
    <section className="container upload-section" aria-labelledby="upload-heading">
      <div className="upload-card upload-card-centered"><div className="eyebrow">TWÓJ PLIK</div><h2 id="upload-heading">Dodaj plik</h2><p className="upload-intro">Wybierz plik ze swojego urządzenia.</p>
        <form onSubmit={event => void confirmFile(event)} noValidate>
          <FileUpload id="plik" name="plik" label="Wybierz plik" hint="Dozwolone formaty: PDF, DOC, DOCX, ODS, XLSX, JPG, JPEG, PNG." accept=".pdf,.doc,.docx,.ods,.xlsx,.jpg,.jpeg,.png" error={error} onChange={event => selectFile(event.currentTarget.files?.[0])} />
          {file && <p className="selected-file">Wybrany plik: <strong>{file.name}</strong></p>}
          {file && <p>Po potwierdzeniu dokument zostanie przesłany do zewnętrznego serwera w celu przetworzenia.</p>}
          <div className="upload-actions"><Button type="submit" disabled={loading}>Potwierdź wybór</Button>{loading && <Loader label="Przetwarzanie dokumentu…" />}</div>
        </form>
      </div>
    </section>
  </>
}

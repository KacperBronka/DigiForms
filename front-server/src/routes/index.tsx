import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Button, FileUpload, Loader } from '#/components/gov'
import { isFormDefinition } from '#/components/form/GeneratedForm'
import { DRAFT_KEY, FORM_KEY } from '#/lib/formDraft'

export const Route = createFileRoute('/')({ component: Home })

function ProcessingDialog() {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = dialog.current
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element?.showModal()
    return () => {
      element?.close()
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  return <dialog ref={dialog} className="gp-dialog processing-dialog" aria-label="Przetwarzanie dokumentu" onCancel={event => event.preventDefault()} tabIndex={-1}>
    <Loader label="Trwa przetwarzanie dokumentu, prosze czekac..." />
  </dialog>
}

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
    if (loading) return
    setError(undefined)
    if (!file) {
      setError('Wybierz plik przed potwierdzeniem.')
      return
    }
    if (!/\.(pdf|doc|docx|ods|xlsx|jpg|jpeg|png|json)$/i.test(file.name)) {
      setError('Wybierz plik w jednym z dozwolonych formatów.')
      return
    }
    const jsonFile = /\.json$/i.test(file.name)
    if (!jsonFile && (file.size === 0 || file.size > 20 * 1024 * 1024)) {
      setError('Plik musi mieć od 1 bajtu do 20 MB.')
      return
    }
    const current = selection.current
    setLoading(true)
    try {
      let data: unknown
      if (jsonFile) {
        try { data = JSON.parse(await file.text()) } catch { throw new Error('Nie udało się odczytać pliku. Sprawdź, czy zawiera poprawny JSON.') }
      } else {
        const body = new FormData()
        body.append('file', file)
        let response: Response
        try { response = await fetch('/api/process-document', { method: 'POST', body }) }
        catch { throw new Error('Nie udało się połączyć z serwerem. Spróbuj ponownie.') }
        let result: unknown
        try { result = await response.json() } catch { throw new Error('Serwer zwrócił niepoprawną odpowiedź.') }
        if (!response.ok) throw new Error(result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : 'Nie udało się przetworzyć dokumentu.')
        data = result
        if (!isFormDefinition(data)) throw new Error('Serwer zwrócił JSON bez rozpoznanej definicji formularza.')
      }
      if (current !== selection.current) return
      try { sessionStorage.setItem(jsonFile ? FORM_KEY : DRAFT_KEY, JSON.stringify({ name: file.name, data })) }
      catch { throw new Error('Nie udało się zachować pliku w tej karcie przeglądarki. Sprawdź dostępne miejsce i spróbuj ponownie.') }
      await navigate({ to: jsonFile ? '/view' : '/edit' })
    } catch (error) {
      if (current === selection.current) setError(error instanceof Error ? error.message : 'Nie udało się połączyć z serwerem. Spróbuj ponownie.')
    } finally {
      if (current === selection.current) setLoading(false)
    }
  }

  return <>
    <section className="hero"><div className="container upload-hero"><div className="eyebrow"><span /> KREATOR DOKUMENTÓW</div><h1>Rozpocznij od swojego pliku.</h1><p>Wybierz dokument lub plik JSON, a następnie potwierdź swój wybór.</p></div></section>
    <section className="container upload-section" aria-labelledby="upload-heading">
      <div className="upload-card upload-card-centered"><div className="eyebrow">TWÓJ PLIK</div><h2 id="upload-heading">Dodaj plik</h2><p className="upload-intro">Wybierz plik ze swojego urządzenia.</p>
        <form onSubmit={event => void confirmFile(event)} noValidate>
          <FileUpload id="plik" name="plik" label="Wybierz plik" hint="Dozwolone formaty: PDF, DOC, DOCX, ODS, XLSX, JPG, JPEG, PNG, JSON." accept=".pdf,.doc,.docx,.ods,.xlsx,.jpg,.jpeg,.png,.json" error={error} onChange={event => selectFile(event.currentTarget.files?.[0])} />
          {file && <p className="selected-file">Wybrany plik: <strong>{file.name}</strong></p>}
          {file && !/\.json$/i.test(file.name) && <p>Po potwierdzeniu dokument zostanie przesłany do zewnętrznego serwera w celu przetworzenia.</p>}
          <div className="upload-actions"><Button type="submit" disabled={loading}>Potwierdź wybór</Button></div>
        </form>
      </div>
    </section>
    {loading && <ProcessingDialog />}
  </>
}

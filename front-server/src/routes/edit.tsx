import { Route as rootRoute } from './__root'
import { createRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { Breadcrumbs, Button, Link, Notice } from '#/components/gov'
import { DefinitionEditor, queryErrors } from '#/components/form/DefinitionEditor'
import { GeneratedForm, isFormDefinition } from '#/components/form/GeneratedForm'
import { DRAFT_KEY, FORM_KEY, readStored, writeStored } from '#/lib/formDraft'
import type { StoredFile } from '#/lib/formDraft'

export const Route = createRoute({ getParentRoute: () => rootRoute, path: '/edit', component: Edit })

function Edit() {
  const navigate = useNavigate()
  const [file, setFile] = useState<StoredFile | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [pending, setPending] = useState(false)
  const updatePending = useCallback((value: boolean) => setPending(value), [])
  useEffect(() => { setFile(readStored(DRAFT_KEY)); setLoaded(true) }, [])
  function update(data: unknown) {
    if (!file) return
    const next = { ...file, data }
    setFile(next)
    setShowPreview(false)
    try { writeStored(DRAFT_KEY, next); setError('') }
    catch { setError('Nie udało się zapisać wersji roboczej. Zmiany pozostają dostępne tylko do zamknięcia lub odświeżenia strony.') }
  }
  function approve() {
    if (!file || !isFormDefinition(file.data) || pending || queryErrors(file.data).length) return
    try { writeStored(FORM_KEY, { ...file, approved: true }) }
    catch { setError('Nie udało się zapisać zatwierdzonego formularza. Sprawdź dostępne miejsce w przeglądarce.'); return }
    void navigate({ to: '/view' })
  }
  const definition = file && isFormDefinition(file.data) ? file.data : null
  const errors = definition ? queryErrors(definition) : []
  return <div className="container info-page"><Breadcrumbs ancestors={[{ href: '/', label: 'Strona główna' }]} current="Edycja formularza" /><div className="info-content form-view">
    <h1>Sprawdź i popraw formularz</h1>
    {!loaded ? <p>Wczytywanie…</p> : !definition ? <Notice kind="warning">Nie znaleziono poprawnej wersji roboczej. <Link href="/">Wybierz dokument</Link>.</Notice> : <>
      <p>Sprawdź wynik przetwarzania dokumentu „{file?.name}”. Twoje zmiany są zapisywane w tej karcie przeglądarki.</p>
      {error && <Notice kind="warning">{error}</Notice>}
      <DefinitionEditor definition={definition} onChange={update} onPendingChange={updatePending} />
      {errors.length > 0 && <Notice kind="warning"><p>Popraw warunki przed zatwierdzeniem:</p><ul>{errors.map((message, i) => <li key={i}>{message}</li>)}</ul></Notice>}
      <div className="editor-actions"><Button variant="secondary" disabled={pending || errors.length > 0} onClick={() => setShowPreview(value => !value)}>{showPreview ? 'Ukryj podgląd' : 'Pokaż podgląd roboczy'}</Button><Button disabled={pending || errors.length > 0} onClick={approve}>Zatwierdź formularz</Button></div>
      {showPreview && <div className="editor-preview"><h2>Podgląd roboczy</h2><GeneratedForm key={JSON.stringify(definition)} definition={definition} /></div>}
    </>}
  </div></div>
}

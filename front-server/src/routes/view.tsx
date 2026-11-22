import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useId, useRef, useState } from 'react'
import { Breadcrumbs, Button, Link, Notice } from '../components/gov'
import { GeneratedForm, isFormDefinition } from '../components/form/GeneratedForm'
import { downloadDefinition, FORM_KEY, readStored } from '../lib/formDraft'
import type { StoredFile } from '../lib/formDraft'

export const Route = createFileRoute('/view')({ component: View })

function JsonPreview({ data }: { data: unknown }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  return <>
    <Button ref={trigger} variant="secondary" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>Podgląd JSON</Button>
    <dialog ref={dialog} className="gp-dialog json-preview-dialog" aria-labelledby={titleId} onClose={() => trigger.current?.focus()}>
      <h2 id={titleId}>Podgląd JSON</h2>
      <pre tabIndex={0}><code>{JSON.stringify(data, null, 2)}</code></pre>
      <Button variant="secondary" onClick={() => dialog.current?.close()}>Zamknij</Button>
    </dialog>
  </>
}

function View() {
  const [file, setFile] = useState<StoredFile | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setFile(readStored(FORM_KEY))
    setLoaded(true)
  }, [])

  return <div className="container info-page">
    <Breadcrumbs ancestors={[{ href: '/', label: 'Strona główna' }]} current="Podgląd pliku" />
    <div className="info-content form-view"><div className="eyebrow">KREATOR DOKUMENTÓW</div>
      {!loaded ? <p>Wczytywanie danych…</p> : !file ? <Notice>Nie znaleziono pliku JSON w tej karcie przeglądarki. <Link href="/">Wybierz plik na stronie głównej</Link>.</Notice> : <>
        <div className="editor-actions"><JsonPreview data={file.data} />{file.approved && <><Button variant="secondary" onClick={() => downloadDefinition(file)}>Pobierz JSON</Button><Link href="/edit">Wróć do edycji</Link></>}</div>
        {isFormDefinition(file.data) ? <GeneratedForm definition={file.data} /> : <Notice kind="warning">Plik nie zawiera rozpoznanej definicji formularza. Oczekiwano tytułu i tablicy stron „tabs” z polami „questions”. <Link href="/">Wybierz inny plik</Link>.</Notice>}
      </>}
    </div>
  </div>
}

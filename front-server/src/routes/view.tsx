import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Breadcrumbs, Button, Link, Notice } from '../components/gov'
import { GeneratedForm, isFormDefinition } from '../components/form/GeneratedForm'
import { downloadDefinition, FORM_KEY, readStored } from '../lib/formDraft'
import type { StoredFile } from '../lib/formDraft'

export const Route = createFileRoute('/view')({ component: View })


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
      {!loaded ? <p>Wczytywanie danych…</p> : !file ? <Notice>Nie znaleziono pliku JSON w tej karcie przeglądarki. <Link href="/">Wybierz plik na stronie głównej</Link>.</Notice> : isFormDefinition(file.data) ? <>{file.approved && <div className="editor-actions"><Button variant="secondary" onClick={() => downloadDefinition(file)}>Pobierz JSON</Button><Link href="/edit">Wróć do edycji</Link></div>}<GeneratedForm definition={file.data} /></> : <Notice kind="warning">Plik nie zawiera rozpoznanej definicji formularza. Oczekiwano tytułu i tablicy stron „tabs” z polami „questions”. <Link href="/">Wybierz inny plik</Link>.</Notice>}
    </div>
  </div>
}

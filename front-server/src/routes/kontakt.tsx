import { createFileRoute } from '@tanstack/react-router'
import { InfoPage } from '../components/layout/InfoPage'
export const Route = createFileRoute('/kontakt')({ component: Page })
function Page() { return <InfoPage title="Kontakt" intro="Potrzebujesz pomocy lub chcesz przekazać nam swoją opinię?"><h2>Skontaktuj się z nami</h2><p>W tym miejscu należy podać nazwę instytucji, adres, numer telefonu, adres e-mail oraz godziny obsługi.</p><h2>Problemy z dostępnością</h2><p>Informacje o zgłaszaniu problemów z dostępnością znajdziesz w <a className="gp-link" href="/dostepnosc">deklaracji dostępności</a>.</p></InfoPage> }

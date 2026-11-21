import { createFileRoute } from '@tanstack/react-router'
import { InfoPage } from '../components/layout/InfoPage'
export const Route = createFileRoute('/cookies')({ component: Page })
function Page() { return <InfoPage title="Polityka cookies" intro="Informacje o plikach cookies i podobnych technologiach."><h2>Pliki cookies w serwisie</h2><p>Opisz rzeczywiście wykorzystywane pliki cookies i podobne technologie, ich cele, dostawców oraz czas przechowywania.</p><h2>Zarządzanie ustawieniami</h2><p>Wyjaśnij, jak użytkownik może zarządzać ustawieniami cookies i wycofać zgodę, jeśli jest ona wymagana. Treść dostosuj do faktycznej konfiguracji serwisu.</p></InfoPage> }

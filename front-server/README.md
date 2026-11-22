Welcome to your new TanStack Start app!

# Getting Started

To run this application:

```bash
npm install
npm run dev
```

# Building For Production

To build this application for production:

```bash
npm run build
```

## Styling

This project uses [Tailwind CSS](https://tailwindcss.com/) for styling.

### Removing Tailwind CSS

If you prefer not to use Tailwind CSS:

1. Remove the demo pages in `src/routes/demo/`
2. Replace the Tailwind import in `src/styles.css` with your own styles
3. Remove `tailwindcss()` from the plugins array in `vite.config.ts`
4. Remove `@tailwindcss/vite` and `tailwindcss` from `package.json`


## Deploy with Nitro

This project uses Nitro as a generic server adapter, so it can run on any Node-compatible host.

```bash
npm run build
node .output/server/index.mjs
```

The build output is a self-contained Node server. To deploy, push the `.output/` directory to your host (Render, Fly.io, your own VPS, etc.) and run the server command above.

For host-specific presets (Vercel, Netlify, Cloudflare, AWS Lambda, etc.) and tuning, see https://v3.nitro.build/deploy.


## Routing

This project uses [TanStack Router](https://tanstack.com/router) with file-based routing. Routes are managed as files in `src/routes`.

### Adding A Route

To add a new route to your application just add a new file in the `./src/routes` directory.

TanStack will automatically generate the content of the route file for you.

Now that you have two routes you can use a `Link` component to navigate between them.

### Adding Links

To use SPA (Single Page Application) navigation you will need to import the `Link` component from `@tanstack/react-router`.

```tsx
import { Link } from "@tanstack/react-router";
```

Then anywhere in your JSX you can use it like so:

```tsx
<Link to="/about">About</Link>
```

This will create a link that will navigate to the `/about` route.

More information on the `Link` component can be found in the [Link documentation](https://tanstack.com/router/v1/docs/framework/react/api/router/linkComponent).

### Using A Layout

In the File Based Routing setup the layout is located in `src/routes/__root.tsx`. Anything you add to the root route will appear in all the routes. The route content will appear in the JSX where you render `{children}` in the `shellComponent`.

Here is an example layout that includes a header:

```tsx
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'My App' },
    ],
  }),
  shellComponent: ({ children }) => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <header>
          <nav>
            <Link to="/">Home</Link>
            <Link to="/about">About</Link>
          </nav>
        </header>
        {children}
        <Scripts />
      </body>
    </html>
  ),
})
```

More information on layouts can be found in the [Layouts documentation](https://tanstack.com/router/latest/docs/framework/react/guide/routing-concepts#layouts).

## Server Functions

TanStack Start provides server functions that allow you to write server-side code that seamlessly integrates with your client components.

```tsx
import { createServerFn } from '@tanstack/react-start'

const getServerTime = createServerFn({
  method: 'GET',
}).handler(async () => {
  return new Date().toISOString()
})

// Use in a component
function MyComponent() {
  const [time, setTime] = useState('')
  
  useEffect(() => {
    getServerTime().then(setTime)
  }, [])
  
  return <div>Server time: {time}</div>
}
```

## API Routes

You can create API routes by using the `server` property in your route definitions:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

export const Route = createFileRoute('/api/hello')({
  server: {
    handlers: {
      GET: () => json({ message: 'Hello, World!' }),
    },
  },
})
```

## Data Fetching

There are multiple ways to fetch data in your application. You can use TanStack Query to fetch data from a server. But you can also use the `loader` functionality built into TanStack Router to load the data for a route before it's rendered.

For example:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/people')({
  loader: async () => {
    const response = await fetch('https://swapi.dev/api/people')
    return response.json()
  },
  component: PeopleComponent,
})

function PeopleComponent() {
  const data = Route.useLoaderData()
  return (
    <ul>
      {data.results.map((person) => (
        <li key={person.name}>{person.name}</li>
      ))}
    </ul>
  )
}
```

Loaders simplify your data fetching logic dramatically. Check out more information in the [Loader documentation](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#loader-parameters).



# Learn More

You can learn more about all of the offerings from TanStack in the [TanStack documentation](https://tanstack.com).

For TanStack Start specific documentation, visit [TanStack Start](https://tanstack.com/start).

## Komponenty GOV: ładowanie i wybór pliku

`Loader` sygnalizuje trwającą operację; renderuj go tylko w trakcie ładowania. `FileUpload` korzysta z natywnego pola wyboru pliku i przyjmuje standardowe atrybuty input, m.in. `accept`, `multiple`, `required` i `onChange`.

```tsx
import { FileUpload, Loader } from './components/gov'

<Loader label="Przesyłanie dokumentu…" />
<FileUpload
  id="dokument"
  name="dokument"
  label="Wybierz dokument"
  hint="Wybierz plik PDF."
  accept=".pdf,application/pdf"
  required
  onChange={(event) => console.log(event.currentTarget.files)}
/>
```

Komponent udostępnia wybrany plik przez `onChange`; walidację i przesyłanie należy zaimplementować w aplikacji. Opcjonalny `error` wyświetla komunikat błędu powiązany z polem.

## Przetwarzanie dokumentów i edycja formularza

Domyślny adres serwera przetwarzającego to `http://localhost:3001/upload`. Aby użyć innego adresu, ustaw po stronie serwera `DOCUMENT_PROCESSOR_URL` na pełny adres endpointu. Opcjonalnie ustaw `DOCUMENT_PROCESSOR_TOKEN`, aby dodać nagłówek `Authorization: Bearer …`. Aplikacja wysyła plik żądaniem `POST` jako `multipart/form-data` pod kluczem `file` i oczekuje bezpośrednio definicji formularza JSON w odpowiedzi. Rzeczywisty kontrakt serwera może wymagać dostosowania funkcji `processDocument` w `src/routes/api/process-document.ts`. Dane konfiguracyjne nie są udostępniane przeglądarce.

Pliki PDF, DOC, DOCX, ODS, XLSX, JPG i PNG mogą mieć do 20 MB. Po przetworzeniu użytkownik edytuje wynik i zatwierdza go przed podglądem końcowym i pobraniem JSON-a. Wersja robocza jest przechowywana w `sessionStorage` bieżącej karty; niezastosowane zmiany w polu zaawansowanego JSON-a trzeba zastosować przed opuszczeniem edytora. Lokalne pliki JSON nadal otwierają się bezpośrednio w podglądzie.

## Uruchamianie przez Docker Compose

Z katalogu głównego repozytorium:

```bash
cp .env.example .env
chmod 600 .env
# Uzupełnij EDENAI_API_KEY w .env swoim kluczem.
docker compose up --build -d
```

Klucz jest wymagany przy uruchamianiu Compose. Można go też dostarczyć przez
zmienną środowiskową `EDENAI_API_KEY` z systemu wdrożeniowego. `.env` nie jest
kopiowany do obrazu. Nie przekazuj sekretów przez `ARG`, `ENV` w Dockerfile
ani pliki źródłowe. Nie publikuj wyniku `docker compose config` / `docker inspect`,
ponieważ środowisko uruchomionego kontenera zawiera klucz; do sprawdzania
konfiguracji używaj `docker compose config --quiet`.

Aplikacja jest dostępna pod http://localhost:3000. Domyślnie jedynym portem
hosta jest `127.0.0.1:3000`; `APP_PORT` i `BIND_ADDRESS` pozwalają zmienić
wiązanie. Ustawienie `BIND_ADDRESS=0.0.0.0` udostępnia aplikację w sieci.
Publiczne wdrożenie powinno kończyć HTTPS na zewnętrznym reverse proxy.
Parser nie publikuje portu hosta i nie jest udostępniany przez ścieżkę `/api/`.
Frontend komunikuje się z nim pod `http://app:3000/upload` po wewnętrznej sieci.
`DOCUMENT_PROCESSOR_TOKEN` jest opcjonalnym tokenem integracyjnym; zasady
przekazywania i weryfikacji JWT opisano poniżej.

Aby uruchomić lokalny OCR na karcie NVIDIA, skonfiguruj sterownik zgodny z CUDA 12.8
i NVIDIA Container Toolkit dla Dockera. Uruchom aplikację z katalogu głównego:

```bash
docker compose -f compose.yaml -f compose.nvidia.yaml up --build -d
docker compose logs app
```

W logu parsera pojawi się nazwa karty po załadowaniu EasyOCR. Obraz zawiera
wagi dla `OCR_LANG` (domyślnie polski). Po zmianie języka przebuduj obraz.
Zwykłe `docker compose up --build` uruchamia Tesseract na CPU.

Konfiguracja używa oficjalnych obrazów:

- `node:22.23.5-alpine3.23` — wieloetapowy build, w obrazie runtime tylko `.output`;
- `python:3.14.10-slim-trixie` — Debian Slim dla zgodności bibliotek OCR z glibc;
- `nginx:1.30.7-alpine3.24` — proxy uruchamiane jako użytkownik `nginx`.

Wersje pochodzą z katalogu Docker Official Images:
[Node](https://github.com/docker-library/official-images/blob/master/library/node),
[Python](https://github.com/docker-library/official-images/blob/master/library/python),
[Nginx](https://github.com/docker-library/official-images/blob/master/library/nginx).
Aktualizacje wersji obrazów należy wprowadzać jawnie i weryfikować ponownym buildem.

Wszystkie usługi działają bez roota, z systemem plików tylko do odczytu,
bez capabilities i z `no-new-privileges`. Konteksty budowania mają listy
wymaganych plików; sekrety, lokalne dane i cache nie trafiają do obrazów.
Zapisy są dozwolone tylko w `tmpfs`. `PARSER_TMP_SIZE` (domyślnie `1g`)
określa miejsce na przetwarzane dokumenty, a `APP_HOME_SIZE` (domyślnie `64m`)
na katalog domowy parsera i ustawienia LibreOffice. Dopasuj je
do dostępnej pamięci i liczby równoległych żądań.
Modele OCR są w obrazie. Parser ma dostęp do Internetu dla Eden AI; frontend działa w sieciach
wewnętrznych, a proxy ma osobną sieć wejściową. Limity procesów i rotacja logów
są ustawione w Compose. Logi nie służą do przechowywania plików użytkownika.

Healthcheck parsera czeka na gotowość OCR; frontend i proxy uruchamiają się
po gotowości zależnych usług. Kontrola po wdrożeniu:

```bash
docker compose config --quiet
docker compose ps
docker compose exec proxy nginx -t
docker compose exec app id
docker compose exec front-server id
docker compose exec proxy id
```

### Walidacja przesyłanych plików

Parametr środowiskowy `MAX_UPLOAD_BYTES` określa maksymalny rozmiar pojedynczego
pliku w bajtach (domyślnie `20971520`, czyli 20 MiB). Musi być dodatnią liczbą
całkowitą. Compose przekazuje tę samą wartość do frontendu i parsera; przy
osobnym uruchamianiu ustaw ją w obu procesach. Przeglądarka pobiera limit z
`GET /api/process-document`; limit obejmuje też import JSON.

Nazwa pliku może mieć maksymalnie 250 znaków i nie może zawierać
`; : > < / \ | ' * % $`. Akceptowane dokumenty: PDF, DOC, DOCX, ODS, XLSX,
JPG/JPEG i PNG. JSON jest odczytywany lokalnie i sprawdzany przez parser JSON.
Deklarowany MIME musi odpowiadać rozszerzeniu. Brak MIME lub ogólny
`application/octet-stream` jest dopuszczalny, ponieważ parser niezależnie
sprawdza zawartość: PDF, format obrazu, strumienie Word w kontenerze OLE oraz
wewnętrzny typ dokumentu w archiwach Office/ODS. Sama zmiana rozszerzenia lub
nagłówka MIME nie wystarcza do zaakceptowania dokumentu.

Oryginalne dokumenty, wyniki OCR i pliki konwersji są przetwarzane w pamięci
lub katalogach tymczasowych ograniczonych do żądania. Są usuwane także po błędzie;
przesłany strumień jest zamykany. Proxy nie buforuje całego żądania na dysku.
Wygenerowana definicja formularza i lokalnie otwarta definicja JSON nadal są
przechowywane w `sessionStorage` na potrzeby edycji formularza.

### Parametry uruchomieniowe

Wzorzec konfiguracji znajduje się w głównym `.env.example`. Compose przekazuje
parametry do właściwych usług w runtime. Po zmianie ustawień odtwórz kontenery
(`docker compose up -d`). Poza Dockerem ustaw zmienne środowiskowe procesów;
parser obsługuje też lokalny `parser-server/.env`. Jawnie ustawione zmienne
środowiskowe mają pierwszeństwo, również gdy są puste.

| Parametr | Domyślnie | Znaczenie |
| --- | --- | --- |
| `MAX_UPLOAD_BYTES` | `20971520` | Dodatni limit pliku w bajtach, wspólny dla frontendu i parsera |
| `JWT_ENABLED` | `false` | Włączenie weryfikacji JWT dla przetwarzania dokumentów |
| `JWT_ALGORITHM` | `RS256` | Dozwolone `RS256` lub `ES256`; algorytm określa konfiguracja, nie token |
| `JWT_PUBLIC_KEY` | puste | Klucz publiczny PEM; wymagany przy włączonym JWT, obsługuje literalne `\n` |
| `JWT_ISSUER` | puste | Dokładny oczekiwany wystawca `iss`, wymagany przy JWT |
| `JWT_AUDIENCE` | puste | Oczekiwany odbiorca `aud`, wymagany przy JWT |
| `JWT_LEEWAY_SECONDS` | `30` | Tolerancja czasu JWT, od 0 do 300 sekund |
| `EDENAI_API_KEY` | brak | Sekret integracji; wymagany przez Compose |
| `EDENAI_API_URL` | `https://api.edenai.run/v3/chat/completions` | Endpoint integracji Eden AI |
| `EDENAI_MODEL` | `amazon/anthropic.claude-haiku-5-5@eu` | Identyfikator modelu |
| `EDENAI_CONNECT_TIMEOUT_SECONDS` | `15` | Dodatni timeout połączenia |
| `EDENAI_READ_TIMEOUT_SECONDS` | `600` | Dodatni timeout oczekiwania na kolejne dane strumienia, nie całego zadania |
| `DOCUMENT_PROCESSOR_URL` | `http://app:3000/upload` w Compose | Endpoint parsera; poza Compose domyślnie `http://localhost:3001/upload` |
| `DOCUMENT_PROCESSOR_TOKEN` | puste | Opcjonalny token usługowy, wyłącznie po stronie serwera |
| `DOCUMENT_PROCESSOR_TIMEOUT_SECONDS` | `900` | Czas oczekiwania frontendu na parser, od 1 do 2147483 sekund |
| `OCR_LANG` / `OCR_DEVICE` | `pl` / `cpu` | Język OCR i urządzenie parsera. Plik compose.nvidia.yaml ustawia `cuda` dla EasyOCR. |
| `MAX_OCR_CHARS` | `160000` | Maksymalny rozmiar tekstu wejściowego modelu |
| `MAX_IMAGE_PAGES` | `5` | Liczba stron przekazywanych jako obrazy; `0` wyłącza obrazy |
| `IMAGE_DPI` / `JPEG_QUALITY` | `150` / `78` | Rozdzielczość 1–600 DPI i jakość JPEG 1–95 |
| `PORT` | `3001` poza Compose | Port parsera 1–65535; w Compose porty wewnętrzne są stałe (`3000`) |

Błędne ustawienia parsera przerywają start przed ładowaniem modeli OCR. Frontend
sprawdza ustawienia podczas obsługi endpointu; niepoprawna konfiguracja integracji
zwraca `503`. Healthcheck również wymaga poprawnych ustawień. Przeglądarka otrzymuje
wyłącznie limit rozmiaru pliku, nigdy obiekt konfiguracji ani sekrety. Timeout
frontendu zwraca `504`; przerwanie oczekiwania nie gwarantuje anulowania trwającego OCR.
Zewnętrzny parser wymaga dodatkowo dostępu sieciowego — frontend w domyślnym
Compose ma wyłącznie sieci wewnętrzne.

### Włączenie JWT

Ustaw `JWT_ENABLED=true`, `JWT_PUBLIC_KEY`, `JWT_ISSUER`, `JWT_AUDIENCE` oraz
algorytm zgodny z kluczem wystawcy. RS256 wymaga klucza RSA co najmniej 2048 bitów,
a ES256 klucza P-256. Klucz prywatny pozostaje u wystawcy tokenów.

Domyślnie frontend przekazuje nagłówek `Authorization: Bearer <token>` klienta do
parsera. Parser sprawdza token **przed odczytem przesłanego pliku**. Wymagane pola
tokenu: `exp`, `iat`, `iss`, `aud`, `sub`; sprawdzane są podpis, wystawca, odbiorca
i czas ważności, w tym `nbf`, jeśli występuje. Niepoprawny token zwraca `401`
z nagłówkiem `WWW-Authenticate: Bearer`. Weryfikacja korzysta z
[PyJWT](https://pyjwt.readthedocs.io/en/stable/api.html).

Jeśli ustawisz `DOCUMENT_PROCESSOR_TOKEN`, frontend użyje go zamiast tokenu
klienta. Jest to wariant uwierzytelniania **frontend–parser**, a nie logowanie
użytkowników; wymaga osobnej ochrony dostępu do frontendu. Rotacja lub odnowienie
tego tokenu należy do systemu wdrożeniowego.

Aplikacja nie wystawia tokenów i nie zawiera ekranu logowania. Po włączeniu JWT
wariant użytkownika wymaga klienta przekazującego nagłówek Authorization lub
integracji logowania; obecny interfejs sam nie pobiera tokenów. `/health` i odczyt
limitu pliku pozostają publiczne. JWT chroni API przetwarzania, nie lokalny
podgląd formularzy ani import JSON w przeglądarce.

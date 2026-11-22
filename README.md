# DigiForms — Docker

Wymagania: Docker Engine z BuildKit i Docker Compose v2 lub nowszy.

```sh
cp .env.example .env
```

Uzupełnij `.env`, wpisując klucz `EDENAI_API_KEY`. Plik `.env` jest ignorowany
przez Git i konteksty budowania; wartości trafiają do kontenerów wyłącznie
podczas uruchamiania.
Można również dostarczyć je jako zmienne środowiskowe z systemu wdrożeniowego.
Nie przekazuj sekretów przez Dockerfile, build args ani zmienne `VITE_*`.

```sh
docker compose up --build -d
docker compose ps
docker compose logs -f
```

Aplikacja: http://localhost:3000. Budowanie obrazu workera pobiera modele OCR
i może potrwać dłużej. Worker działa offline; dostęp do Eden AI ma tylko API.
Zatrzymanie usług: `docker compose down`.

## Konfiguracja obrazów

- Oficjalne obrazy bazowe z jawnymi wersjami: Node `22.22.0-alpine3.23`,
  Python `3.14.0-slim-trixie`, nginx `1.28.0-alpine3.21`; bez tagu `latest`.
- Frontend budowany wieloetapowo; obraz runtime zawiera wynik kompilacji.
- Parser używa Debian slim ze względu na natywne zależności OCR/ONNX i LibreOffice.
- Procesy działają jako `node`, `app` i `nginx`, z `cap_drop: ALL`
  i `no-new-privileges`. Parser zapisuje dane tymczasowe w `/tmp`, a modele
  konfigurację tymczasową również w `/tmp`. Modele w obrazie workera są tylko do odczytu.
- Jedyny port publikowany na hoście to `3000` proxy. Frontend i parser są
  dostępne przez wewnętrzną sieć Compose. Proxy zachowuje trasę `/api/` do parsera.
- Parser kopiuje wyłącznie wymagane pliki aplikacji; pliki `.env` i klucze
  są wykluczone z kontekstów budowania obu aplikacji.

Przy aktualizacji wersji bazowych przebuduj i sprawdź wszystkie usługi.
Przypięte tagi nie zastępują regularnego aktualizowania obrazów i zależności.

## Sprawdzenie

```sh
docker compose config --quiet
docker compose exec app id
docker compose exec front-server id
docker compose exec proxy id
curl --fail http://localhost:3000/api/health
```

Każdy `id` powinien zwrócić UID różny od `0`. Endpoint zdrowia sprawdza działanie
API; worker ma osobny healthcheck po sockecie Unix. Nie publikuj wyniku `docker compose config`
bez `--quiet`, ponieważ może zawierać wartości sekretów.

## Budowanie i konfiguracja

Samo budowanie obrazów: `docker compose build`. Następnie uruchom je przez
`docker compose up -d`. Konfiguracja z `.env` jest wczytywana przy tworzeniu
kontenerów; po zmianie wartości wykonaj ponownie `docker compose up -d`.

| Parametr runtime | Domyślnie | Znaczenie |
| --- | --- | --- |
| `MAX_UPLOAD_BYTES` | `20971520` | Maksymalny rozmiar pojedynczego pliku w bajtach, dodatnia liczba całkowita; wspólny dla frontendu i parsera |
| `EDENAI_API_KEY` | wymagany | Klucz integracji Eden AI |
| `EDENAI_MODEL` | `gemma-4-31b-it` | Model generowania formularza |
| `EDENAI_READ_TIMEOUT_SECONDS` | `180` | Dodatni timeout odczytu Eden AI w sekundach |
| `DOCUMENT_PROCESSOR_URL` | `http://localhost:3001/upload` | Adres parsera dla frontendu; Compose ustawia `http://app:3000/upload` |
| `DOCUMENT_PROCESSOR_TIMEOUT_MS` | `270000` | Dodatni timeout połączenia frontend–parser w ms |
| `PORT` | parser: `3001` | Port procesu; Compose ustawia `3000` |

Endpointy aplikacji są publiczne i nie wymagają logowania ani tokenu dostępu.
Obowiązują limity żądań, rozmiaru pliku i zasobów przetwarzania.

## Walidacja przesyłanych dokumentów

Dozwolone rozszerzenia (bez rozróżniania wielkości liter): PDF, DOC, DOCX, ODS,
XLSX, JPG, JPEG, PNG. Nazwa musi zawierać od 1 do 250 znaków i nie może zawierać
`; : > < / \ | ' * % $` ani znaków sterujących. Puste pliki są odrzucane.
Plik o rozmiarze równym limitowi jest dozwolony.

Izolowany worker identyfikuje MIME z zawartości przez libmagic, niezależnie od nagłówka
przesłanego przez klienta. Sprawdza również strukturę dokumentów Office (typ głównej
części DOCX/XLSX, `mimetype` ODS, strumienie Word w OLE dla DOC). Deklarowany MIME
musi odpowiadać rozszerzeniu; brak MIME lub `application/octet-stream` jest
akceptowany tylko przy poprawnym wyniku weryfikacji zawartości. Konwersja dodatkowo
sprawdza poprawność dokumentu. Walidacja odbywa się przed OCR i wywołaniem Eden AI.

Frontend i parser ograniczają również całe żądanie multipart do limitu pliku +
1 MiB narzutu, także bez `Content-Length`. Nginx przekazuje upload strumieniowo,
a limit egzekwuje aplikacja. JSON nie jest akceptowany jako przesyłany plik
ani w interfejsie, ani przez API. Wynik przetwarzania i eksport formularza nadal mają format JSON.

## REST API

Adres bazowy przez Compose: `http://localhost:3000`.

| Metoda i ścieżka | Opis |
| --- | --- |
| `POST /api/process-document` | Frontend: przekazanie dokumentu do parsera; odpowiedź JSON formularza |
| `POST /api/upload` | Bezpośrednia trasa proxy do parsera; odpowiedź JSON formularza |
| `GET /api/health` | Działanie API: `{"status":"ready"}` |
| `GET /api/openapi.json` | Specyfikacja OpenAPI parsera (wewnętrzne ścieżki `/upload`, `/health`) |

Upload wymaga `multipart/form-data` z pojedynczym polem `file`. Przykład:

```sh
curl --fail-with-body http://localhost:3000/api/upload \
  -F 'file=@formularz.pdf;type=application/pdf'
```

Sukces `200` zwraca definicję formularza, m.in. `title`, `tabs`, `flow`.
Parser zwraca błędy jako `{"detail":"opis"}`, a endpoint frontendu jako
`{"error":"opis"}`. Błędy walidacji FastAPI mogą zawierać listę w `detail`.

| Status | Znaczenie |
| --- | --- |
| `400` | Niedozwolona nazwa, pusty/uszkodzony dokument lub błędne multipart |
| `413` | Przekroczenie limitu pliku lub całego żądania |
| `415` | Nieobsługiwane rozszerzenie lub niezgodność MIME/zawartości |
| `422` | Brak wymaganego pola `file` w API parsera |
| `429` | Przekroczenie limitu częstotliwości żądań |
| `502` | Błąd integracji, timeout lub niepoprawna odpowiedź generowania |
| `503` | Brak klucza Eden AI, niedostępny worker, pełna kolejka lub przekroczony czas oczekiwania |
| `504` | Przekroczony czas wykonania zadania; proces zadania zostaje zabity |

Endpoint zdrowia i specyfikacja OpenAPI są publiczne.

## Ograniczenie częstotliwości żądań

Nginx ogranicza żądania według adresu IP połączenia. Domyślne parametry runtime:

| Parametr | Domyślnie | Znaczenie |
| --- | --- | --- |
| `RATE_LIMIT_RPS` | `10` | Średnia liczba żądań na sekundę na IP, dla wszystkich tras |
| `RATE_LIMIT_BURST` | `20` | Dodatkowy chwilowy zapas żądań |
| `UPLOAD_RATE_LIMIT_RPM` | `5` | Średnia liczba żądań uploadu na minutę na IP |
| `UPLOAD_RATE_LIMIT_BURST` | `2` | Dodatkowy chwilowy zapas żądań uploadu |

Wartości muszą być dodatnimi liczbami całkowitymi. Zmień je w `.env` i wykonaj
`docker compose up --build -d`. Obraz proxy renderuje konfigurację przy starcie.
Obie trasy `/api/upload` i `/api/process-document` (również z końcowym `/`)
współdzielą jeden limit uploadu i podlegają również limitowi ogólnemu.
Przekroczenie limitu powoduje natychmiastową odpowiedź `429` z JSON `error`;
żądania nie są kolejkowane. Zapas odnawia się wraz z upływem czasu — limit nie
jest sztywnym oknem minutowym. Liczone są także nieudane żądania.

Stan limitera jest współdzielony przez procesy robocze jednej instancji nginx;
restart kontenera go resetuje. Osoby za wspólnym NAT współdzielą budżet IP.
Nagłówek klienta `X-Forwarded-For` nie zmienia klucza limitera. Jeżeli wdrożenie
stoi za dodatkowym load balancerem, trzeba osobno skonfigurować zaufane adresy
proxy i moduł real-IP; bez tego limit dotyczy adresu load balancera.
Limity obowiązują na wejściu przez nginx; nie wystawiaj portów usług aplikacji
bezpośrednio. Kilka replik proxy ma niezależne budżety.

Test integracyjny wymaga lokalnego nginx i Pythona:
`NGINX_BINARY=/ścieżka/do/nginx python front-server/tests/rate-limits.py`.
Sprawdza limit ogólny, wspólny budżet uploadu, odpowiedź JSON `429`, odporność
na podmianę `X-Forwarded-For` i odnowienie budżetu po upływie czasu.


## Izolacja, sanityzacja i zasoby

Przepływ: nginx → frontend/API → worker offline (MIME, konwersja, sanityzacja,
OCR) → API → Eden AI. Worker nie otrzymuje `EDENAI_API_KEY` ani innych sekretów integracji. `network_mode: none` odcina go od sieci; komunikacja z API
odbywa się wyłącznie przez socket Unix we współdzielonym wolumenie.
Wolumen nie przechowuje dokumentów. API montuje go tylko do odczytu.

Każdy upload otrzymuje nową nazwę UUID v4 z walidowanym rozszerzeniem.
Nazwa klienta nie jest używana jako ścieżka zapisu. Wygenerowane dokumenty i
artefakty mają również losowe nazwy. Pliki są umieszczane w osobnym katalogu
zadania na ograniczonym `tmpfs`, usuwanym po sukcesie, błędzie i timeoutcie.

Worker konwertuje Office w osobnym profilu LibreOffice z wyłączonymi makrami
oraz automatycznymi aktualizacjami linków. Następnie renderuje strony i tworzy
nowy PDF wyłącznie z ponownie zakodowanych obrazów. Nie kopiuje oryginalnych
obiektów PDF, skryptów, linków, załączników ani metadanych. OCR i Eden AI
korzystają wyłącznie z tego zrekonstruowanego obrazu dokumentu. Formularze
interaktywne, podpisy cyfrowe i tekst do zaznaczania nie są zachowywane; wygląd
widocznych stron podlega jakości rasteryzacji. To rekonstrukcja dokumentu,
nie skaner antywirusowy ani gwarancja braku podatności w bibliotekach.

Archiwa Office są sprawdzane przed konwersją: liczba wpisów, suma rozmiarów,
stopień kompresji oraz rzeczywisty odczyt i CRC z ograniczonym buforem.
Archiwa zaszyfrowane, z powtórzonymi nazwami i wykrytymi skryptami/makrami
są odrzucane. Obrazy i strony PDF są sprawdzane przed rasteryzacją.

| Parametr | Domyślnie | Ograniczenie |
| --- | --- | --- |
| `MAX_DOCUMENT_PAGES` | `30` | Liczba stron po konwersji |
| `MAX_IMAGE_PIXELS` | `20000000` | Piksele pojedynczego obrazu lub renderowanej strony |
| `MAX_TOTAL_PIXELS` | `100000000` | Suma pikseli wszystkich renderowanych stron |
| `MAX_ARCHIVE_ENTRIES` | `2000` | Wpisy ZIP w dokumencie Office |
| `MAX_ARCHIVE_BYTES` | `104857600` | Łączne dane po dekompresji (100 MiB) |
| `MAX_ARCHIVE_RATIO` | `100` | Maksymalny współczynnik rozpakowania wpisu |
| `MAX_SANITIZED_BYTES` | `67108864` | PDF po konwersji/sanityzacji i odpowiedź workera (64 MiB) |
| `SANITIZE_DPI` | `150` | Rozdzielczość rekonstrukcji |
| `MAX_ACTIVE_JOBS` | `1` | Aktywne żądania przetwarzania na proces API/workera |
| `MAX_QUEUED_JOBS` | `2` | Maksymalna liczba żądań oczekujących |
| `QUEUE_TIMEOUT_SECONDS` | `15` | Maksymalny czas oczekiwania na slot |
| `JOB_TIMEOUT_SECONDS` | `240` | Deadline procesu całego zadania, w tym Eden AI |
| `WORKER_TIMEOUT_SECONDS` | `180` | Deadline procesu konwersji, sanityzacji i OCR |

Wartości są dodatnimi liczbami całkowitymi. Kolejka przyznaje slot przed
parsowaniem multipart; pełna kolejka zwraca `503` z `Retry-After`.
Każdy job jest osobnym procesem; po deadline zabijana jest cała grupa procesów,
w tym procesy LibreOffice. Worker ładuje model OCR dla każdego zadania z wag
pobranych podczas budowania obrazu. Zwiększa to koszt startu zadania, ale
pozwala rzeczywiście przerwać OCR po timeoutcie. Używaj jednego procesu
Uvicorn na kontener — dodatkowe procesy/repliki mają osobne kolejki.

Wszystkie usługi mają `read_only: true`, limit CPU/RAM/PID i ograniczone
zapisy do `tmpfs`. Konfiguracja nginx generuje się do `/tmp/nginx-conf`.

| Usługa | CPU / RAM (parametry runtime Compose) | PID | Tymczasowy zapis |
| --- | --- | --- | --- |
| API | `API_CPUS=1.0`, `API_MEMORY=512m` | 64 | `/tmp`: 128 MiB |
| Worker | `WORKER_CPUS=2.0`, `WORKER_MEMORY=4g` | 128 | `/tmp`: 512 MiB; socket w wolumenie |
| Frontend | `FRONTEND_CPUS=1.0`, `FRONTEND_MEMORY=512m` | 64 | `/tmp`: 64 MiB |
| Proxy | `PROXY_CPUS=0.5`, `PROXY_MEMORY=128m` | 32 | `/tmp`: 16 MiB, cache nginx: 32 MiB |

`tmpfs` zużywa budżet RAM kontenera. Swap kontenerów jest ograniczony przez
ustawienie `memswap_limit` równego limitowi pamięci. Przy zwiększaniu liczby
zadań lub rozmiaru dokumentów dostosuj pamięć i rozmiary `tmpfs` w Compose.
Frontend czeka domyślnie 270 s, nginx 300 s; zwiększ te wartości, jeśli
wydłużasz deadline zadania. Brak miejsca/OOM może przerwać job zamiast zwrócić
szczegółowy błąd walidacji.

Testy backendu: w `parser-server` uruchom
`python -m unittest -v test_main test_hardening` (wymaga zależności testowych
`httpx` oraz bibliotek PDF/obrazów; test Office używa lokalnego LibreOffice).
Pełny test OCR wymaga zbudowania i uruchomienia obrazu workera.


## Logowanie

`docker compose logs -f app document-worker proxy` pokazuje logi operacyjne.
API i worker zapisują JSON z czasem UTC, poziomem, usługą, zdarzeniem,
`request_id`, statusem i czasem trwania tam, gdzie mają zastosowanie.
`LOG_LEVEL` (domyślnie `INFO`) ustawia poziom logów aplikacji.

Nginx tworzy identyfikator żądania przekazywany przez frontend, API i worker.
API zwraca go jako `X-Request-ID`. Logowane są zakończenia żądań, odrzucenia
walidacji, pełna kolejka, przekroczenia czasu oczekiwania, start/koniec procesu,
sanityzacja, OCR i integracja Eden AI. Proxy zapisuje status i wynik limitera.
Logi nie zawierają treści dokumentów, oryginalnych nazw, nagłówków autoryzacji,
sekretów ani query stringów. Wyjście bibliotek OCR jest wyciszone; logujemy
kontrolowane zdarzenia etapów zamiast surowego wyjścia bibliotek.

Docker rotuje logi każdej usługi: maksymalnie 3 pliki po 10 MiB. Dostosuj
retencję i agregację do środowiska wdrożeniowego. Błędy nginx poniżej poziomu
`crit` są zastąpione logiem dostępu JSON, żeby nie zapisywać surowych URL-i
z potencjalnie wrażliwymi parametrami.

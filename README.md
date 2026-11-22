
# digiForms - cyfryuzacja formularzy

digiForms, to system stworzony do digitalizacji istniejacych juz formularzy do podanego schematu JSON. 
Narzędzie w obecnej fazie składa się z:
 - **warstwy wizualnej** - serwera frontend
 - **warstwy technicznej** - serwera backend, który prztwarza pliki

## Uruchomienie

 Uwaga: Do samodzielnego uruchomienia aplikacji będzie potrzebny klucz API do `EdenAI`.

 - `git clone git@github.com:KacperBronka/DigiForms.git`
 - `cd DigiForms`
 - `cp .env.example .env`
 - Uzupełniamy .env kluczem EdenAI
 - `docker compose up` (jako admin)

## Działanie aplikacji

Przetwarzanie plików opiera się na warstwach. Jest to rozwiązanie wprowadzone przez nas dla usprawnienia procesu i oddelegowania lżejszego zadania do lżejszego rozwiązania. Wizualizacja znajduje się poniżej:

![flow aplikacji](./.github/dg-flow.png)
 
Użycie EdenAI jest jedynie rozwiązaniem demonstracyjnym. Podczas implementacji finalnej wersji aplikacji zamierzamy użyć modelu hostowanego lokalnie.
 
## Modele AI

W aplikacji zostały użyte modele:
 - **model OCR** - paddleOCR
 - **anthropic haiku 5.5** jako "ciężki LLM" odpowiedzialny za kontekst, dopasowania typów oraz finalne zwrócenie pliku.
 
Po przetestowaniu kilku różnych rozwiązań i dostawców AI ostatecznie użyliśmy haiku od anthropica. 
Powodem tej decyzji są:
 - Stosunkowo niski koszt przetworzenia pojedynczego dokumentu
 - Prędkość działania modelu
 - Dokładność i skuteczność
 
## Stack technologiczny:
 
*Python backend*

  - FastAPI, Uvicorn — API i serwer
  - python-multipart — obsługa przesyłania plików
  - Requests — żądania HTTP do integracji Eden AI
  - pypdfium2 — odczyt i renderowanie PDF
  - Pillow — przetwarzanie obrazów
  - python-dotenv — konfiguracja ze zmiennych środowiskowych i pliku .env
  - olefile — obsługa plików OLE
  - PyJWT z cryptography — weryfikacja tokenów JWT
  - ONNX Runtime (>=1.21,<1.27) — zależność dodana do backendu

*Narzędzia systemowe w obrazie backendu*

  - LibreOffice — konwersja dokumentów
  - Tesseract OCR — lokalne rozpoznawanie tekstu
  
*Frontend*

  - React, React DOM — interfejs
  - TanStack React Router — routing
  - JSONata — przetwarzanie danych
  - sanitize-html — oczyszczanie HTML
  - Webpack, webpack-cli, webpack-dev-server — budowanie i serwowanie frontendu
  - TypeScript, ts-loader — typowanie i kompilacja
  - css-loader, mini-css-extract-plugin — obsługa CSS
  - html-webpack-plugin — generowanie HTML

 
## Autorzy:

 - Karol Szelc
 - Kacper Kacper
 - Sebastian Drabik
 - Maciej Michalik

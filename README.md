
# digiForms - cyfryuzacja formularzy

## Uruchomienie

 Uwaga: Do samodzielnego uruchomienia aplikacji będzie potrzebny klucz API do `EdenAI`.

 - `git clone git@github.com:KacperBronka/DigiForms.git`
 - `cd DigiForms`
 - `docker compose up` (jako admin)

## Stack technologiczny:
 
  - Aplikacja webowa(interfejs uzytkownika): Tanstack Start@1.0 + React
  - Serwer przetwarzajacy pliki: python 3.14
  - docker

## Działanie aplikacji

Przetwarzanie plików opiera się na warstwach. Jest to rozwiązanie wprowadzone przez nas dla usprawnienia procesu i oddelegowania lżejszego zadania do lżejszego rozwiązania. Wizualizacja znajduje się poniżej:

![flow aplikacji](./.github/dg-flow.png)
 
## Autorzy:

 - Karol Szelc
 - Kacper Kacper
 - Sebastian Drabik
 - Maciej Michalik

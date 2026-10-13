# Syk dżungli — wyniki i wznawianie gry (Supabase)

- **Data:** 2026-10-13
- **Status:** do przeglądu
- **Uzupełnia:** `wymagania-snake.md` (po wdrożeniu sekcje 1, 6 i 8 tamtej specyfikacji zostaną zaktualizowane)

## 1. Cel i zakres

Gracz loguje się e-mailem, ma nick, a jego zakończone gry trafiają do tabeli wyników. Przerwaną grę (pauza, zamknięcie karty) można wznowić później, także na innym urządzeniu.

**W zakresie:** logowanie linkiem z e-maila, nick, zapis wyniku po końcu gry, tabela 10 najlepszych graczy, pauza, autozapis, wznowienie, praca bez sieci.

**Poza zakresem:** ochrona przed sfałszowanym wynikiem (patrz 9), logowanie hasłem lub przez Google, historia własnych gier, zmiana nicku z poziomu gry, usuwanie konta.

## 2. Backend — Supabase

Projekt **ANDZUNGLA** (`ddgolzidohleaedavoas`, eu-west-1). Schemat w `supabase/migrations/20261013120000_init.sql` — wdrożony i zweryfikowany 2026-10-13.

| Obiekt | Rola |
|---|---|
| `players` | `id` = `auth.users.id`, unikalny `nick` 3–20 znaków |
| `scores` | zakończona gra: `score` 0–397, `result` `'over'`/`'won'`, `duration_ms` |
| `saved_games` | jedna przerwana gra na gracza: `state` (jsonb), `score` |
| `leaderboard` | widok: najlepszy wynik każdego gracza z nickiem |

RLS: odczyt `players`, `scores`, `leaderboard` dla wszystkich (także niezalogowanych); zapis tylko własnych wierszy; `scores` bez edycji i kasowania; `saved_games` w pełni prywatne.

Ustawienia Auth: Site URL = `https://amyalska1983-cloud.github.io/gra-snake-AN/`. Limit wbudowanej poczty: **2 e-maile/godz. na cały projekt**.

## 3. Struktura plików

| Plik | Zmiana |
|---|---|
| `snake-logic.js` | + status `'paused'`, `pause`, `resume`, `restoreState` |
| `snake-cloud.js` | **nowy** — klient Supabase na `fetch`, bez bibliotek; wystawia `window.SnakeCloud` |
| `index.html` | panel gracza, tabela wyników, pauza, autozapis, wznowienie |
| `tests.html` | testy nowych funkcji logiki |

Bez modułów ES i bez `supabase-js` — zostaje założenie „zero zależności i uruchamianie dwuklikiem". Bez sieci gra działa, nie działa tylko zapis.

## 4. Zmiany w logice (`snake-logic.js`)

| Funkcja | Zachowanie |
|---|---|
| `pause(state)` | `'running'` → `'paused'`; inne statusy bez zmian |
| `resume(state)` | `'paused'` → `'running'`; inne statusy bez zmian |
| `restoreState(obj)` | Waliduje obiekt z bazy i zwraca świeży stan `'paused'` albo `null` |

`step()` na `'paused'` nic nie robi (już dziś wychodzi przy `status !== 'running'`).

`restoreState` traktuje dane z bazy jako niezaufane: `cols`/`rows` = 20, `status` `'running'` lub `'paused'`, wąż 3–399 segmentów (wygranej gry się nie zapisuje) w granicach planszy, współrzędne całkowite, segmenty sąsiadujące (z uwzględnieniem zawijania), bez duplikatów, `direction` jednym z czterech wektorów, `food` w granicach i poza wężem, `score` = długość − 3, `intervalMs` w 55–125. Kolejka kierunków jest czyszczona.

## 5. Klient Supabase (`snake-cloud.js`)

Adres projektu i klucz `sb_publishable_…` wpisane w pliku — klucz publikowalny jest przeznaczony do kodu w przeglądarce, ochronę zapewnia RLS.

| Funkcja | Endpoint |
|---|---|
| `sendMagicLink(email)` | `POST /auth/v1/otp` z `email_redirect_to` = bieżący adres strony |
| `init()` | odczyt sesji z `#access_token=…&refresh_token=…` po powrocie z e-maila, czyszczenie hasha z paska adresu; sesja w `localStorage` |
| `signOut()` | `POST /auth/v1/logout`, czyszczenie sesji |
| `getPlayer()` / `createPlayer(nick)` | `players` |
| `saveGame(payload)` | upsert `saved_games` (`Prefer: resolution=merge-duplicates`) |
| `loadGame()` / `deleteGame()` | `saved_games` |
| `submitScore(score, result, durationMs)` | insert `scores` |
| `getLeaderboard()` | `leaderboard?order=score.desc&limit=10` |

Token dostępu odświeżany `refresh_token`em, gdy zostało mniej niż 60 s ważności. Każda funkcja zwraca Promise; błędy sieci i HTTP są łapane i zamieniane na `{ ok: false, error }` — wywołujący nigdy nie dostaje wyjątku.

## 6. Interfejs (`index.html`)

**Panel gracza** (pod licznikiem punktów):
- niezalogowany: pole e-mail + „Wyślij link logowania"; po wysłaniu „Sprawdź skrzynkę";
- zalogowany bez nicku: pole nick + „Zapisz";
- zalogowany: „Grasz jako *nick*" + „Wyloguj".

**Tabela wyników:** 10 najlepszych (nick, punkty), obok planszy na szerokim ekranie, pod nią na wąskim. Odświeżana po starcie strony i po każdym zapisanym wyniku. Widoczna także dla niezalogowanych.

**Klawiatura:** gdy fokus jest w polu tekstowym, gra ignoruje klawisze — inaczej wpisanie „wsad" w nicku sterowałoby wężem.

**Pauza:** `P` lub `Esc` przełącza `'running'` ↔ `'paused'`. Nakładka: „Pauza · P — wznów".

## 7. Zapis i wznawianie

| Zdarzenie | Działanie (tylko zalogowany z nickiem) |
|---|---|
| pauza | `saveGame` |
| co 5 s w trakcie gry | `saveGame` |
| karta ukryta (`visibilitychange`) | pauza + `saveGame` z `keepalive: true` |
| koniec gry (`'over'` / `'won'`) | `submitScore`, potem `deleteGame`, odświeżenie tabeli |
| start strony / zalogowanie | `loadGame` → jeśli jest zapis, nakładka „Wznów grę (N pkt) — Enter · Nowa gra — N" |
| wybór „Nowa gra" przy istniejącym zapisie | `deleteGame` |

Zapisywany `payload`: `{ state, playMs }`, gdzie `playMs` to czas gry bez pauz (do `duration_ms`). Wznowiona gra startuje w pauzie — gracz rusza klawiszem kierunku lub `P`. Zapis nieprzechodzący `restoreState` jest kasowany i gracz dostaje komunikat „Zapis uszkodzony — zaczynasz od nowa".

Gra niezalogowanego gracza działa jak dotąd, bez zapisu; po końcu gry nakładka podpowiada „Zaloguj się, aby zapisać wynik".

## 8. Błędy i brak sieci

- Każda nieudana operacja pokazuje krótki komunikat w panelu gracza (np. „Brak połączenia — wynik nie zapisany") i nie przerywa gry.
- Nieudany zapis wyniku jest ponawiany raz po 3 s; potem odpuszczony.
- Limit e-maili przekroczony (HTTP 429) → „Limit wysyłki linków — spróbuj za godzinę".
- Wygasła sesja, której nie da się odświeżyć → wylogowanie i komunikat.

## 9. Bezpieczeństwo — świadome ograniczenia

- Wynik liczy przeglądarka. Zalogowany gracz może wysłać dowolny wynik 0–397 przez API. Zabezpieczenie wymagałoby weryfikacji rozgrywki po stronie serwera — poza zakresem.
- Zapis gry jest prywatny (RLS), ale gracz może zapisać sobie spreparowany stan; `restoreState` odrzuca stany niemożliwe na planszy, nie odrzuca „zbyt dobrych".

## 10. Testy

**Automatyczne (`tests.html`):**
1. `pause` przełącza `'running'` → `'paused'`; `step` na `'paused'` nic nie zmienia.
2. `resume` przełącza `'paused'` → `'running'`.
3. `pause`/`resume` nie ruszają statusów `'ready'`, `'over'`, `'won'`.
4. `restoreState` na stanie z prawdziwej gry zwraca równoważny stan w `'paused'` z pustą kolejką.
5. `restoreState` zwraca `null` dla: `null`, złego `cols`, segmentu poza planszą, rozerwanego węża, duplikatu segmentu, złego kierunku, jedzenia na wężu, `score` niezgodnego z długością, `intervalMs` poza zakresem.
6. `restoreState` akceptuje węża przechodzącego przez krawędź (zawinięcie).

**Ręczne (GitHub Pages):**
1. Niezalogowany widzi tabelę wyników i może grać.
2. Link z e-maila loguje i wraca do gry; hash z tokenem znika z paska adresu.
3. Pierwsze logowanie prosi o nick; zajęty nick daje komunikat.
4. Wpisywanie w pola nie steruje wężem.
5. Koniec gry dodaje wynik do tabeli.
6. `P` pauzuje i wznawia.
7. Zamknięcie karty w trakcie gry, ponowne otwarcie → propozycja wznowienia z tą samą liczbą punktów i ułożeniem węża.
8. Wznowienie na drugim urządzeniu po zalogowaniu tym samym e-mailem.
9. „Nowa gra" przy istniejącym zapisie kasuje zapis.
10. Wyłączona sieć (DevTools → Offline): gra działa, komunikat o braku zapisu.

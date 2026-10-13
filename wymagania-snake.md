# Snake — specyfikacja projektowa

- **Data:** 2026-09-29
- **Status:** zatwierdzona, gotowa do planu implementacji
- **Aktualizacja:** 2026-10-13 — wyniki i wznawianie (Supabase)
- **Stos:** HTML5 + Canvas 2D + JavaScript (ES5/ES2015, bez modułów), zero zależności

## 1. Cel i zakres

Klasyczny Snake uruchamiany dwuklikiem na pliku `index.html`, bez serwera, bez `npm install`, bez kroku budowania. Wąż porusza się po siatce, zjada jedzenie, rośnie i przyspiesza. Plansza zawija się na krawędziach — wyjście poza krawędź przenosi głowę na przeciwległą stronę, bez utraty gry. Gra trwa najwyżej 60 sekund czasu gry (pauza zatrzymuje zegar); wcześniej kończy ją tylko ugryzienie własnego ciała.

**W zakresie:** siatka, ruch, jedzenie, wzrost, punktacja, rosnące tempo, zawijanie planszy na krawędziach, kolizja z własnym ciałem, ekran startowy, ekran końca gry, ekran wygranej, restart, automatyczne testy logiki.

**Poza zakresem:** poziomy trudności, przeszkody, bonusowe jedzenie, dźwięk, sterowanie dotykowe, tryb dwuosobowy, animacje ruchu między komórkami.

Wyniki, logowanie i wznawianie gry: `docs/superpowers/specs/2026-10-13-wyniki-i-wznawianie-design.md`.

## 2. Struktura plików

| Plik | Odpowiedzialność | Zależności |
|---|---|---|
| `snake-logic.js` | Czysta logika gry. Zero DOM, zero Canvas, zero `window` poza jednym eksportem. | brak |
| `index.html` | Prezentacja: Canvas, style, pętla czasu, rysowanie, odczyt klawiatury. | `snake-logic.js`, `snake-cloud.js` |
| `snake-cloud.js` | Klient Supabase na fetch: logowanie, zapis gry, wyniki. | brak |
| `tests.html` | Runner testów logiki z wypisem wyników w przeglądarce. | `snake-logic.js` |

Oba pliki HTML ładują logikę zwykłym `<script src="snake-logic.js"></script>`.

**Twardy zakaz:** żadnych modułów ES (`type="module"`, `import`, `export`). Przeglądarki blokują moduły wczytywane przez `file://` polityką CORS, co zabiłoby uruchamianie dwuklikiem. Logika wystawia się przez `window.SnakeLogic`.

## 3. Parametry gry

| Parametr | Wartość |
|---|---|
| Siatka | 20 × 20 komórek |
| Komórka | 24 px |
| Canvas | 480 × 480 px |
| Wąż na starcie | 3 segmenty, głowa `(10, 10)`, kierunek w prawo |
| Interwał startowy | 125 ms na krok |
| Przyspieszenie | −4 ms za każde zjedzone jedzenie |
| Interwał minimalny | 55 ms |
| Punkty | +1 za jedzenie |
| Wygrana | długość węża = 400 segmentów |
| Limit czasu | 60 s czasu gry (`TIME_LIMIT_MS`), bez pauz |

## 4. Model stanu

```js
{
  cols: 20,
  rows: 20,
  snake: [{x, y}, ...],   // indeks 0 = głowa, ostatni = koniec ogona
  direction: {x, y},      // aktualny kierunek, jeden z (1,0) (-1,0) (0,1) (0,-1)
  queue: [{x, y}, ...],   // bufor kierunków, maksymalnie 2 pozycje
  food: {x, y},
  score: 0,
  intervalMs: 125,
  status: 'ready'         // 'ready' | 'running' | 'paused' | 'over' | 'won' | 'timeup'
}
```

Oś Y rośnie w dół (zgodnie z Canvas). Stan jest jedynym źródłem prawdy — warstwa prezentacji go nie modyfikuje poza wywołaniami API z sekcji 7.

## 5. Reguły kroku

`step(state)` wykonuje dokładnie jeden krok logiki, w tej kolejności:

1. Jeżeli `status !== 'running'` — brak zmian, wyjście.
2. Zdejmij pierwszy kierunek z `queue` i ustaw jako `direction` (jeśli kolejka niepusta).
3. Policz nową głowę: `head + direction`.
4. **Zawijanie planszy:** jeśli nowa głowa wypada poza `0..cols-1` lub `0..rows-1`, przenieś ją na przeciwległą krawędź: `x = (x + cols) % cols`, `y = (y + rows) % rows`. Ściana nigdy nie kończy gry.
5. **Kolizja z ciałem:** porównaj zawiniętą już głowę z segmentami węża. Jeżeli głowa *nie* trafia na jedzenie, ostatni segment jest w tym kroku zwalniany i **nie liczy się** jako kolizja — wejście na zwalniane pole ogona jest legalne. Jeżeli głowa trafia na jedzenie, ogon nie ustępuje i liczy się całe ciało. Kolizja → `status = 'over'`, wyjście.
6. Dołóż nową głowę na początek `snake`.
7. Jeśli głowa trafiła na jedzenie: `score += 1`, `intervalMs = max(55, intervalMs - 4)`, wylosuj nowe jedzenie. W przeciwnym razie usuń ostatni segment.
8. Jeśli `snake.length === cols * rows` → `status = 'won'`.

## 6. Sterowanie

- **Klawisze kierunku:** strzałki oraz `W` / `S` / `A` / `D` (wielkość liter bez znaczenia).
- **Start gry:** pierwszy klawisz kierunku przy `status === 'ready'` przełącza na `'running'`.
- **Restart:** `Spacja` lub `Enter` przy `status` `'over'` albo `'won'` tworzy świeży stan.
- **Zakaz zawracania:** kierunek przeciwny do obowiązującego jest odrzucany.
- **Bufor kierunków:** wciśnięcia trafiają do `queue` (maks. 2 pozycje), nie prosto do `direction`. Bez bufora dwa szybkie skręty między krokami logiki (np. góra → lewo) omijają walidację i wprowadzają węża w samego siebie — dla gracza wygląda to jak błąd gry.
- Walidacja kandydata odbywa się względem *ostatniego elementu kolejki*, a gdy kolejka jest pusta — względem `direction`. Duplikat bieżącego kierunku jest odrzucany.
- `keydown` dla strzałek i spacji wywołuje `preventDefault()`, żeby strona się nie przewijała.
- **Pauza:** `P` lub `Esc`; wznowienie `P` lub klawiszem kierunku.
- **Oferta wznowienia zapisanej gry** (ekran startowy): `Enter` — wznów zapisaną grę, `N` — nowa gra; inne klawisze nic nie robią.
- Gdy fokus jest w polu tekstowym (`INPUT`, `TEXTAREA`), gra ignoruje klawisze.

## 7. API `snake-logic.js`

Jeden obiekt globalny `window.SnakeLogic`:

| Funkcja | Sygnatura | Opis |
|---|---|---|
| `createState` | `(rng?) => state` | Nowy stan startowy, `status: 'ready'`, jedzenie wylosowane. |
| `step` | `(state, rng?) => void` | Jeden krok wg sekcji 5. Mutuje stan w miejscu. |
| `enqueueDirection` | `(state, dir) => boolean` | Dokłada kierunek do kolejki. `false` gdy odrzucony. |
| `spawnFood` | `(state, rng?) => void` | Losuje jedzenie wyłącznie z pól wolnych od węża. |
| `start` | `(state) => void` | `'ready'` → `'running'`. |
| `pause` | `(state) => void` | `'running'` → `'paused'`; inne statusy bez zmian. |
| `resume` | `(state) => void` | `'paused'` → `'running'`; inne statusy bez zmian. |
| `timeUp` | `(state) => void` | `'running'`/`'paused'` → `'timeup'`; inne statusy bez zmian. Czas odmierza warstwa prezentacji. |
| `TIME_LIMIT_MS` | stała | 60000 |
| `restoreState` | `(obj) => state \| null` | Waliduje zapisany stan (np. z bazy); zwraca kopię w `'paused'` z pustą kolejką albo `null` dla stanu niemożliwego. |
| `DIRECTIONS` | stała | `{ up, down, left, right }` jako wektory. |

`rng` to opcjonalna funkcja zwracająca liczbę z `[0, 1)`; domyślnie `Math.random`. Wstrzykiwalność `rng` jest wymogiem, bez niej losowanie jedzenia nie da się przetestować deterministycznie.

## 8. Warstwa prezentacji (`index.html`)

- Pętla `requestAnimationFrame` z akumulatorem czasu: rysowanie w każdej klatce, `step()` dopiero gdy akumulator przekroczy `intervalMs`. Dzięki temu tempo gry nie zależy od częstotliwości odświeżania monitora.
- Akumulator jest ograniczony z góry (maks. 5 kroków w jednej klatce), żeby po powrocie z nieaktywnej karty gra nie wykonała setek kroków naraz.
- Nad planszą licznik: `Punkty: N`.
- Nakładka na Canvas zależna od `status`:
  - `ready` — „Strzałki lub WSAD — start"; gdy jest zapisana gra — „Wznów grę (N pkt) — Enter" + „Nowa gra — N"
  - `paused` — „Pauza" + „P lub strzałka — wznów"
  - `over` — „Koniec gry · Punkty: N" + „Spacja — nowa gra"; niezalogowany gracz widzi dodatkowo „Zaloguj się, aby zapisać wynik"
  - `won` — „Wygrana! Plansza zapełniona" + „Spacja — nowa gra"
  - `timeup` — „Czas minął! · Punkty: N" + „Spacja — nowa gra" (niezalogowanym także „Zaloguj się, aby zapisać wynik"); wynik trafia do bazy jako `'over'`
- Motyw dżungli, tytuł „Syk dżungli": plansza w szachownicę `#1f4a1c`/`#1a4118` z fazą kafelków i winietą, wąż w odcieniach 66–96 (limonka → złoto) z cieniem i odblaskiem, głowa złota z oczami patrzącymi w kierunku ruchu, jedzenie `#ef4444` z listkiem, tło strony `tlo-dzungla/tlo-dzungla.jpg`.
- Głowa odróżniona kolorem od ciała, żeby kierunek był czytelny.

## 9. Kryteria akceptacji

### 9.1 Testy automatyczne (`tests.html`)

Każdy punkt to osobna asercja; runner wypisuje nazwę i wynik.

1. `createState` daje węża o długości 3, `status: 'ready'`, punkty 0, interwał 125.
2. Krok bez jedzenia: długość węża się nie zmienia, głowa przesuwa się o wektor kierunku.
3. Krok bez jedzenia: ostatni segment znika z planszy.
4. Zjedzenie jedzenia: długość rośnie dokładnie o 1, punkty rosną o 1.
5. Zjedzenie jedzenia: nowe jedzenie pojawia się na polu wolnym od węża.
6. Zjedzenie jedzenia: interwał maleje o 4 ms.
7. Interwał nie schodzi poniżej 55 ms mimo dalszych zjedzeń.
8. Wyjście poza lewą, prawą, górną i dolną krawędź przenosi głowę na przeciwległą krawędź, a `status` pozostaje `'running'` (cztery przypadki).
9. Zawinięcie przez krawędź nie zmienia długości węża ani punktów.
10. Jedzenie leżące tuż za krawędzią (na przeciwległym brzegu) zostaje zjedzone po zawinięciu — punkty rosną o 1.
11. Zawinięcie na pole zajęte przez własne ciało ustawia `status: 'over'`.
12. Wejście głową w środkowy segment ciała ustawia `status: 'over'`.
13. Wejście na pole zwalniane przez ogon (bez jedzenia) **nie** kończy gry.
14. `enqueueDirection` odrzuca kierunek przeciwny do bieżącego i zwraca `false`.
15. `enqueueDirection` odrzuca kierunek identyczny z bieżącym.
16. Dwa skręty dołożone między krokami są wykonane w dwóch kolejnych krokach, a nie zgubione.
17. `enqueueDirection` nie przyjmuje trzeciego kierunku, gdy kolejka ma już 2 pozycje.
18. Kierunek przeciwny do *ostatniego w kolejce* (nie do bieżącego) jest odrzucany.
19. `spawnFood` z deterministycznym `rng` na planszy niemal pełnej trafia w jedyne wolne pole.
20. `step` na stanie `'ready'`, `'over'` i `'won'` nie zmienia niczego.
21. Zapełnienie planszy ustawia `status: 'won'`.
22. `pause`: `'running'` → `'paused'`; `step` na stanie `'paused'` nic nie zmienia.
23. `resume`: `'paused'` → `'running'`.
24. `pause` i `resume` nie ruszają statusów `'ready'`, `'over'`, `'won'`.
25. `restoreState` z poprawnego stanu zwraca kopię w `'paused'` z pustą kolejką.
26. `restoreState` przyjmuje węża zawiniętego przez krawędź.
27. `restoreState` przyjmuje stan w `'paused'`.
28. `restoreState` odrzuca stany niemożliwe (m.in. zły rozmiar planszy, status `'over'`, rozerwany wąż, duplikat segmentu, jedzenie na wężu, punkty niezgodne z długością, interwał poza 55–125).

### 9.2 Weryfikacja ręczna (`index.html`)

1. Otwarcie pliku dwuklikiem z dysku pokazuje planszę i ekran startowy — bez błędów w konsoli.
2. Pierwszy klawisz kierunku uruchamia ruch.
3. Wąż reaguje na strzałki i na WSAD.
4. Szybkie wciśnięcie dwóch strzałek pod rząd (np. góra, potem lewo) nie zabija węża.
5. Po zjedzeniu licznik punktów rośnie, a wąż wydłuża się widocznie.
6. Po kilkunastu punktach gra jest wyraźnie szybsza niż na starcie.
7. Dojście do krawędzi planszy przenosi węża na przeciwległą stronę i gra toczy się dalej — bez końca gry i bez utraty punktów.
8. Ugryzienie własnego ciała pokazuje nakładkę końca gry z poprawnym wynikiem — to jedyny sposób na przegraną.
9. Spacja po przegranej startuje nową grę od zera punktów i tempa startowego.
10. Strzałki i spacja nie przewijają strony.
11. Przełączenie na inną kartę na kilkanaście sekund i powrót nie powoduje skokowego przeskoku węża.

## 10. Decyzje odrzucone

| Odrzucone | Powód |
|---|---|
| Jeden plik `index.html` ze wszystkim inline | `tests.html` nie ma jak sięgnąć po skrypt inline z innego pliku; `fetch` po `file://` blokuje CORS. |
| Moduły ES | Blokowane przez CORS przy `file://` — psuje uruchamianie dwuklikiem. |
| Koniec gry po uderzeniu w ścianę | Zastąpione zawijaniem planszy: wąż wychodzi poza krawędź i wraca po przeciwnej stronie. |
| Siatka `<div>` zamiast Canvas | Wolniejsza i nietypowa dla gier 2D. |
| Vitest / npm | Łamie założenie „bez instalacji i bez serwera". |

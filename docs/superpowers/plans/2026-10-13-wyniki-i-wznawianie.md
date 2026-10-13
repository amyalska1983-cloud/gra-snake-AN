# Syk dżungli — wyniki i wznawianie gry: plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Logowanie e-mailem, tabela wyników i wznawianie przerwanej gry przez Supabase, bez dokładania zależności.

**Architecture:** Logika gry (`snake-logic.js`) dostaje pauzę i walidowane wczytywanie stanu. Nowy `snake-cloud.js` rozmawia z Supabase przez `fetch` (Auth + PostgREST) i nigdy nie rzuca wyjątków — zwraca `{ ok, data | error }`. `index.html` skleja jedno z drugim: panel gracza, tabela wyników, pauza, autozapis, wznowienie.

**Tech Stack:** HTML5 + Canvas 2D + JavaScript ES5/ES2015 bez modułów; Supabase (projekt `ddgolzidohleaedavoas`) przez REST.

**Spec:** `docs/superpowers/specs/2026-10-13-wyniki-i-wznawianie-design.md`

## Global Constraints

- Zero zależności: żadnego `supabase-js`, żadnego npm, żadnego kroku budowania.
- Żadnych modułów ES (`type="module"`, `import`, `export`) — gra musi działać po dwukliku z dysku.
- Każdy plik JS to IIFE `(function (global) { 'use strict'; ... })(window);` z jednym eksportem na `window`.
- Komentarze i teksty interfejsu po polsku; komentarze tylko tam, gdzie wyjaśniają „dlaczego".
- Adres Supabase: `https://ddgolzidohleaedavoas.supabase.co`; klucz: `sb_publishable_3M3SAZsIqgYPKwzV_QpqVw_PPyczGad`. Nigdy kluczy `secret` / `service_role`.
- Teksty od użytkowników (nicki) wstawiane wyłącznie przez `textContent`, nigdy `innerHTML`.
- Git: żadnych commitów w trakcie zadań. Jeden commit na końcu (Task 7), i to tylko na wyraźne polecenie użytkowniczki.

## Uruchamianie testów

Testy logiki działają w przeglądarce. Z PowerShella:

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu --virtual-time-budget=2000 --dump-dom "file:///C:/Szkolenie AI/29.09/tests.html" 2>$null | Select-String -Pattern 'id="summary"|class="fail"'
```

Wynik pokazuje linię `Zaliczone: X / Y` i każdą linię z błędem.

---

### Task 1: Pauza w logice gry

**Files:**
- Modify: `snake-logic.js` (nowe funkcje przed `global.SnakeLogic`, eksport)
- Test: `tests.html` (nowe testy przed `var list = document.getElementById('results');`)

**Interfaces:**
- Produces: `SnakeLogic.pause(state) => void`, `SnakeLogic.resume(state) => void`; nowy status `'paused'`.

- [ ] **Step 1: Dopisz testy w `tests.html`** (po teście 21)

```js
      test('22. pause: running → paused, step na paused nic nie zmienia', function () {
        var s = runningState([{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }], D.right, FAR_FOOD);
        L.pause(s);
        eq(s.status, 'paused', 'status');
        var before = JSON.stringify(s);
        L.step(s);
        eq(JSON.stringify(s), before, 'stan po step');
      });

      test('23. resume: paused → running', function () {
        var s = runningState([{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }], D.right, FAR_FOOD);
        L.pause(s);
        L.resume(s);
        eq(s.status, 'running');
      });

      test('24. pause i resume nie ruszają statusów ready, over, won', function () {
        ['ready', 'over', 'won'].forEach(function (status) {
          var s = L.createState(fixedRng(0.3));
          s.status = status;
          L.pause(s);
          eq(s.status, status, 'pause na ' + status);
          L.resume(s);
          eq(s.status, status, 'resume na ' + status);
        });
      });
```

- [ ] **Step 2: Uruchom testy — mają nie przejść**

Run: polecenie z sekcji „Uruchamianie testów".
Expected: `Zaliczone: 21 / 24`, błędy w 22–24 („L.pause is not a function").

- [ ] **Step 3: Zaimplementuj w `snake-logic.js`** (po funkcji `start`)

```js
  function pause(state) {
    if (state.status === 'running') state.status = 'paused';
  }

  function resume(state) {
    if (state.status === 'paused') state.status = 'running';
  }
```

i w eksporcie:

```js
  global.SnakeLogic = {
    createState: createState,
    step: step,
    enqueueDirection: enqueueDirection,
    spawnFood: spawnFood,
    start: start,
    pause: pause,
    resume: resume,
    DIRECTIONS: DIRECTIONS
  };
```

- [ ] **Step 4: Uruchom testy — mają przejść**

Expected: `Zaliczone: 24 / 24`.

---

### Task 2: `restoreState` — walidowane wczytanie zapisu

**Files:**
- Modify: `snake-logic.js`
- Test: `tests.html`

**Interfaces:**
- Consumes: stałe `COLS`, `ROWS`, `START_INTERVAL_MS`, `MIN_INTERVAL_MS`, `DIRECTIONS` z `snake-logic.js`.
- Produces: `SnakeLogic.restoreState(obj) => state | null` — świeża kopia w statusie `'paused'` z pustą `queue`, albo `null`.

- [ ] **Step 1: Dopisz testy w `tests.html`** (po teście 24)

```js
      // Poprawny stan w trakcie gry, po przejściu przez JSON — tak jak wraca z bazy.
      function savedState() {
        var s = runningState([{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }], D.right, { x: 15, y: 15 });
        return JSON.parse(JSON.stringify(s));
      }

      test('25. restoreState: poprawny stan → kopia w pauzie z pustą kolejką', function () {
        var saved = savedState();
        saved.queue = [{ x: 0, y: -1 }];
        var r = L.restoreState(saved);
        assert(r !== null, 'odrzucony poprawny stan');
        assert(r !== saved && r.snake !== saved.snake, 'to nie jest kopia');
        eq(r.status, 'paused', 'status');
        eq(r.queue, [], 'kolejka');
        eq(r.snake, saved.snake, 'wąż');
        eq(r.food, saved.food, 'jedzenie');
        eq(r.score, 0, 'punkty');
        eq(r.intervalMs, 125, 'interwał');
      });

      test('26. restoreState: wąż zawinięty przez krawędź jest poprawny', function () {
        var saved = savedState();
        saved.snake = [{ x: 0, y: 5 }, { x: 19, y: 5 }, { x: 18, y: 5 }];
        assert(L.restoreState(saved) !== null);
      });

      test('27. restoreState: stan w pauzie też jest poprawny', function () {
        var saved = savedState();
        saved.status = 'paused';
        assert(L.restoreState(saved) !== null);
      });

      test('28. restoreState odrzuca stany niemożliwe', function () {
        var cases = {
          'null': function () { return null; },
          'tekst': function () { return 'stan'; },
          'zły cols': function (s) { s.cols = 30; return s; },
          'status over': function (s) { s.status = 'over'; return s; },
          'segment poza planszą': function (s) { s.snake[2] = { x: 20, y: 10 }; return s; },
          'niecałkowita współrzędna': function (s) { s.snake[2] = { x: 8.5, y: 10 }; return s; },
          'rozerwany wąż': function (s) { s.snake[2] = { x: 5, y: 10 }; return s; },
          'duplikat segmentu': function (s) { s.snake[2] = { x: 10, y: 10 }; return s; },
          'za krótki wąż': function (s) { s.snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }]; return s; },
          'zły kierunek': function (s) { s.direction = { x: 1, y: 1 }; return s; },
          'brak jedzenia': function (s) { s.food = null; return s; },
          'jedzenie na wężu': function (s) { s.food = { x: 9, y: 10 }; return s; },
          'punkty niezgodne z długością': function (s) { s.score = 5; return s; },
          'interwał za duży': function (s) { s.intervalMs = 200; return s; },
          'interwał za mały': function (s) { s.intervalMs = 10; return s; }
        };
        Object.keys(cases).forEach(function (name) {
          eq(L.restoreState(cases[name](savedState())), null, name);
        });
      });
```

- [ ] **Step 2: Uruchom testy — mają nie przejść**

Expected: `Zaliczone: 24 / 28`, błędy w 25–28 („L.restoreState is not a function").

- [ ] **Step 3: Zaimplementuj w `snake-logic.js`** (po funkcji `resume`)

```js
  function isCell(c) {
    return c !== null && typeof c === 'object' &&
      Number.isInteger(c.x) && Number.isInteger(c.y) &&
      c.x >= 0 && c.x < COLS && c.y >= 0 && c.y < ROWS;
  }

  // Sąsiedztwo z uwzględnieniem zawijania: kolumna 0 sąsiaduje z kolumną 19.
  function isNeighbour(a, b) {
    var dx = Math.abs(a.x - b.x);
    var dy = Math.abs(a.y - b.y);
    var nx = dx === 1 || dx === COLS - 1;
    var ny = dy === 1 || dy === ROWS - 1;
    return (nx && dy === 0) || (ny && dx === 0);
  }

  function isDirection(d) {
    if (d === null || typeof d !== 'object') return false;
    for (var k in DIRECTIONS) {
      if (sameCell(DIRECTIONS[k], d)) return true;
    }
    return false;
  }

  // Dane z bazy są niezaufane: odrzucamy każdy stan, który nie mógł powstać w prawdziwej grze.
  function restoreState(obj) {
    if (obj === null || typeof obj !== 'object') return null;
    if (obj.cols !== COLS || obj.rows !== ROWS) return null;
    if (obj.status !== 'running' && obj.status !== 'paused') return null;

    var snake = obj.snake;
    // Wygranej gry (400 pól) się nie zapisuje, a 3 to długość startowa.
    if (!Array.isArray(snake) || snake.length < 3 || snake.length >= COLS * ROWS) return null;
    var seen = {};
    for (var i = 0; i < snake.length; i++) {
      var c = snake[i];
      if (!isCell(c) || seen[c.x + ',' + c.y]) return null;
      if (i > 0 && !isNeighbour(snake[i - 1], c)) return null;
      seen[c.x + ',' + c.y] = true;
    }

    if (!isDirection(obj.direction)) return null;
    if (!isCell(obj.food) || seen[obj.food.x + ',' + obj.food.y]) return null;
    if (obj.score !== snake.length - 3) return null;
    if (!Number.isInteger(obj.intervalMs) ||
        obj.intervalMs < MIN_INTERVAL_MS || obj.intervalMs > START_INTERVAL_MS) return null;

    return {
      cols: COLS,
      rows: ROWS,
      snake: snake.map(function (s) { return { x: s.x, y: s.y }; }),
      direction: { x: obj.direction.x, y: obj.direction.y },
      queue: [],
      food: { x: obj.food.x, y: obj.food.y },
      score: obj.score,
      intervalMs: obj.intervalMs,
      status: 'paused'
    };
  }
```

i `restoreState: restoreState,` w eksporcie (po `resume: resume,`).

- [ ] **Step 4: Uruchom testy — mają przejść**

Expected: `Zaliczone: 28 / 28`.

---

### Task 3: Klient Supabase `snake-cloud.js`

**Files:**
- Create: `snake-cloud.js`
- Test (jednorazowy, poza repo): `<scratchpad>/cloud-smoke.html`

**Interfaces:**
- Produces: `window.SnakeCloud` z funkcjami (każda poza `init`/`isSignedIn` zwraca `Promise<{ok:true, data} | {ok:false, error:string, status:number}>` i nigdy nie odrzuca):
  - `init() => { signedIn: boolean, linkError: string|null }` — synchronicznie
  - `isSignedIn() => boolean`
  - `sendMagicLink(email)`
  - `signOut()`
  - `getPlayer()` → `data`: `{ nick } | null`
  - `createPlayer(nick)` → `data`: `{ id, nick, created_at }`; błąd `'nick_taken'` przy zajętym nicku
  - `saveGame(payload, keepalive)` — `payload` = `{ state, playMs }`
  - `loadGame()` → `data`: `{ state: payload, score } | null`
  - `deleteGame()`
  - `submitScore(score, result, durationMs)`
  - `getLeaderboard()` → `data`: `[{ nick, score }]` (max 10, malejąco)
  - kody błędów: `'network'`, `'not_signed_in'`, `'session_expired'`, `'nick_taken'`, kody Supabase (np. `'over_email_send_rate_limit'`, `'otp_expired'`) albo `'http_<status>'`.

- [ ] **Step 1: Utwórz `snake-cloud.js`**

```js
// Klient Supabase na fetch: logowanie linkiem z e-maila, profil gracza, zapis gry i wyniki.
// Bez bibliotek; jedyny kontakt z otoczeniem to eksport window.SnakeCloud.
// Żadna funkcja nie rzuca wyjątku — zwraca { ok: true, data } albo { ok: false, error, status }.
(function (global) {
  'use strict';

  var BASE = 'https://ddgolzidohleaedavoas.supabase.co';
  // Klucz publikowalny jest przeznaczony do kodu w przeglądarce; dostępu do danych pilnuje RLS.
  var KEY = 'sb_publishable_3M3SAZsIqgYPKwzV_QpqVw_PPyczGad';
  var SESSION_KEY = 'syk-dzungli.session';
  var REFRESH_MARGIN_S = 60;

  var session = null;

  function fail(error, status) {
    return { ok: false, error: error, status: status || 0 };
  }

  function readStored() {
    try { return JSON.parse(global.localStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
  }

  function store(s) {
    session = s;
    try {
      if (s) global.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else global.localStorage.removeItem(SESSION_KEY);
    } catch (e) { /* tryb prywatny — sesja zostaje tylko w pamięci */ }
  }

  function userIdFromToken(token) {
    try {
      var part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(global.atob(part)).sub || null;
    } catch (e) {
      return null;
    }
  }

  function toSession(t) {
    var expiresAt = t.expires_at
      ? Number(t.expires_at)
      : Math.floor(Date.now() / 1000) + Number(t.expires_in || 3600);
    return {
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: expiresAt,
      userId: userIdFromToken(t.access_token)
    };
  }

  // Jedyne miejsce z fetch: zamienia każdy błąd sieci i HTTP na { ok: false }.
  function request(method, path, opts) {
    opts = opts || {};
    var headers = { apikey: KEY };
    if (opts.auth) headers.Authorization = 'Bearer ' + session.accessToken;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.prefer) headers.Prefer = opts.prefer;
    return global.fetch(BASE + path, {
      method: method,
      headers: headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      keepalive: !!opts.keepalive
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
        if (res.ok) return { ok: true, data: data };
        var code = data && (data.code || data.error_code || data.error);
        return fail(code ? String(code) : 'http_' + res.status, res.status);
      });
    }, function () {
      return fail('network');
    });
  }

  function refresh() {
    return request('POST', '/auth/v1/token?grant_type=refresh_token', {
      body: { refresh_token: session.refreshToken }
    }).then(function (r) {
      if (r.ok) {
        store(toSession(r.data));
        return { ok: true };
      }
      // Bez sieci sesja zostaje na później; odrzucony refresh token oznacza wylogowanie.
      if (r.error !== 'network') store(null);
      return r;
    });
  }

  // Zapewnia ważny token przed wywołaniem wymagającym zalogowania.
  function authed(fn) {
    if (!session) return Promise.resolve(fail('not_signed_in'));
    var left = session.expiresAt - Math.floor(Date.now() / 1000);
    var ready = left < REFRESH_MARGIN_S ? refresh() : Promise.resolve({ ok: true });
    return ready.then(function (r) {
      if (r.ok) return fn();
      return session ? r : fail('session_expired');
    });
  }

  function parseHash() {
    var params = {};
    global.location.hash.replace(/^#/, '').split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > 0) params[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
    });
    return params;
  }

  // Po kliknięciu linku z e-maila sesja przychodzi w hashu adresu.
  // Czyścimy hash, żeby token nie został w pasku adresu ani w historii.
  function init() {
    var params = parseHash();
    var linkError = null;
    if (params.access_token && params.refresh_token) {
      store(toSession(params));
    } else {
      session = readStored();
      if (params.error) linkError = params.error_code || params.error;
    }
    if (params.access_token || params.error) {
      global.history.replaceState(null, '', global.location.pathname + global.location.search);
    }
    return { signedIn: !!session, linkError: linkError };
  }

  function isSignedIn() {
    return !!session;
  }

  function sendMagicLink(email) {
    var back = global.location.origin + global.location.pathname;
    return request('POST', '/auth/v1/otp?redirect_to=' + encodeURIComponent(back), {
      body: { email: email, create_user: true }
    });
  }

  function signOut() {
    if (!session) return Promise.resolve({ ok: true });
    return request('POST', '/auth/v1/logout', { auth: true }).then(function () {
      store(null);
      return { ok: true };
    });
  }

  function getPlayer() {
    return authed(function () {
      return request('GET', '/rest/v1/players?select=nick&id=eq.' + session.userId, { auth: true })
        .then(function (r) { return r.ok ? { ok: true, data: r.data[0] || null } : r; });
    });
  }

  function createPlayer(nick) {
    return authed(function () {
      return request('POST', '/rest/v1/players', {
        auth: true, body: { nick: nick }, prefer: 'return=representation'
      }).then(function (r) {
        if (r.ok) return { ok: true, data: r.data[0] };
        // 23505 = naruszenie unikalności w Postgresie, czyli zajęty nick.
        return r.error === '23505' ? fail('nick_taken', r.status) : r;
      });
    });
  }

  function saveGame(payload, keepalive) {
    return authed(function () {
      return request('POST', '/rest/v1/saved_games?on_conflict=user_id', {
        auth: true,
        keepalive: keepalive,
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: { state: payload, score: payload.state.score, updated_at: new Date().toISOString() }
      });
    });
  }

  function loadGame() {
    return authed(function () {
      return request('GET', '/rest/v1/saved_games?select=state,score', { auth: true })
        .then(function (r) { return r.ok ? { ok: true, data: r.data[0] || null } : r; });
    });
  }

  function deleteGame() {
    return authed(function () {
      return request('DELETE', '/rest/v1/saved_games?user_id=eq.' + session.userId, { auth: true });
    });
  }

  function submitScore(score, result, durationMs) {
    return authed(function () {
      return request('POST', '/rest/v1/scores', {
        auth: true,
        prefer: 'return=minimal',
        body: { score: score, result: result, duration_ms: Math.round(durationMs) }
      });
    });
  }

  function getLeaderboard() {
    return request('GET', '/rest/v1/leaderboard?select=nick,score&order=score.desc,created_at.asc&limit=10');
  }

  global.SnakeCloud = {
    init: init,
    isSignedIn: isSignedIn,
    sendMagicLink: sendMagicLink,
    signOut: signOut,
    getPlayer: getPlayer,
    createPlayer: createPlayer,
    saveGame: saveGame,
    loadGame: loadGame,
    deleteGame: deleteGame,
    submitScore: submitScore,
    getLeaderboard: getLeaderboard
  };
})(window);
```

- [ ] **Step 2: Test dymny na żywej bazie** — plik w scratchpadzie (nie w repo), `cloud-smoke.html`:

```html
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body><pre id="out">czekam</pre>
<script src="file:///C:/Szkolenie AI/29.09/snake-cloud.js"></script>
<script>
  var C = window.SnakeCloud, out = {};
  out.init = C.init();
  Promise.all([
    C.getLeaderboard().then(function (r) { out.leaderboard = r; }),
    C.getPlayer().then(function (r) { out.playerWhenSignedOut = r; }),
    C.submitScore(1, 'over', 100).then(function (r) { out.scoreWhenSignedOut = r; })
  ]).then(function () { document.getElementById('out').textContent = JSON.stringify(out); });
</script></body></html>
```

Run:
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu --virtual-time-budget=10000 --dump-dom "file:///<scratchpad>/cloud-smoke.html" 2>$null | Select-String 'id="out"'
```

Expected (jedna linia JSON):
- `init`: `{"signedIn":false,"linkError":null}`
- `leaderboard`: `{"ok":true,"data":[]}` (pusta tabela — baza jeszcze bez wyników)
- `playerWhenSignedOut` i `scoreWhenSignedOut`: `{"ok":false,"error":"not_signed_in","status":0}`

Jeśli `leaderboard` zwraca `network` — sprawdzić, czy Chrome nie blokuje `fetch` z `file://` (dodać `--allow-file-access-from-files`). Jeśli `http_401` — zły klucz.

---

### Task 4: Pauza, ochrona pól tekstowych i licznik czasu gry w `index.html`

**Files:**
- Modify: `index.html` (skrypt gry)

**Interfaces:**
- Consumes: `SnakeLogic.pause`, `SnakeLogic.resume` (Task 1).
- Produces (w zasięgu skryptu `index.html`, dla Task 5–6): zmienna `playMs` (czas gry bez pauz, ms), funkcja `togglePause()`, nakładka pauzy.

- [ ] **Step 1: Zmienne** — pod `var lastTime = null;` dodaj:

```js
      var playMs = 0;          // czas gry bez pauz — trafia do scores.duration_ms
```

- [ ] **Step 2: Obsługa klawiatury** — zastąp cały `document.addEventListener('keydown', ...)`:

```js
      document.addEventListener('keydown', function (e) {
        // Pisanie w polach formularza nie może sterować wężem (np. „wsad" w nicku).
        var tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;

        var key = e.key.toLowerCase();
        var dirName = KEY_TO_DIR[key];
        var isRestartKey = key === ' ' || key === 'enter';

        if (key.indexOf('arrow') === 0 || key === ' ') e.preventDefault();

        if (key === 'p' || key === 'escape') {
          togglePause();
        } else if (dirName) {
          if (state.status === 'ready') {
            L.start(state);
            accumulator = 0;
          }
          if (state.status === 'paused') {
            L.resume(state);
            accumulator = 0;
          }
          if (state.status === 'running') L.enqueueDirection(state, L.DIRECTIONS[dirName]);
        } else if (isRestartKey && (state.status === 'over' || state.status === 'won')) {
          state = L.createState();
          accumulator = 0;
          playMs = 0;
        }
      });

      function togglePause() {
        if (state.status === 'running') {
          L.pause(state);
        } else if (state.status === 'paused') {
          L.resume(state);
          accumulator = 0;
        }
      }
```

- [ ] **Step 3: Nakładka pauzy** — w `render(now)` zastąp blok nakładek:

```js
        if (state.status === 'ready') {
          drawOverlay(['Strzałki lub WSAD — start']);
        } else if (state.status === 'paused') {
          drawOverlay(['Pauza', 'P lub strzałka — wznów']);
        } else if (state.status === 'over') {
          drawOverlay(['Koniec gry · Punkty: ' + state.score, 'Spacja — nowa gra']);
        } else if (state.status === 'won') {
          drawOverlay(['Wygrana! Plansza zapełniona', 'Spacja — nowa gra']);
        }
```

- [ ] **Step 4: Licznik czasu** — w `frame(now)`, w gałęzi `if (state.status === 'running') {`, jako pierwsza linia:

```js
          playMs += Math.min(dt, 1000);
```

- [ ] **Step 5: Weryfikacja ręczna** — otwórz `index.html` dwuklikiem:
  1. strzałka startuje grę; `P` pokazuje „Pauza", wąż stoi; `P` lub strzałka wznawia;
  2. `Esc` działa jak `P`;
  3. testy: `Zaliczone: 28 / 28` (Task 1–2 bez regresji).

---

### Task 5: Panel gracza i tabela wyników

**Files:**
- Modify: `index.html` (CSS, HTML, skrypt)

**Interfaces:**
- Consumes: `SnakeCloud.init/isSignedIn/sendMagicLink/signOut/getPlayer/createPlayer/getLeaderboard` (Task 3).
- Produces (dla Task 6): zmienna `player` (`{ nick } | null`), funkcje `say(text)`, `errorText(r)`, `refreshPlayer()`, `refreshLeaderboard()`; hak `onPlayerReady()` wołany, gdy gracz ma nick (w Task 5 pusta funkcja, Task 6 ją wypełnia).

- [ ] **Step 1: CSS** — przed `</style>` dodaj:

```css
    .layout {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 32px;
    }
    .panel {
      padding: 10px 16px;
      border-radius: 12px;
      background: rgba(4, 18, 8, 0.72);
      border: 1px solid rgba(160, 220, 120, 0.25);
    }
    #player form, #whoami { display: flex; gap: 8px; align-items: center; }
    #player input {
      padding: 6px 10px;
      border-radius: 8px;
      border: 1px solid rgba(160, 220, 120, 0.35);
      background: rgba(0, 0, 0, 0.35);
      color: inherit;
      font: inherit;
    }
    #player button {
      padding: 6px 12px;
      border: 0;
      border-radius: 8px;
      background: #8bc34a;
      color: #0b1d08;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    #msg { min-height: 1.2em; margin-top: 6px; font-size: 14px; color: #f2d64a; }
    #msg:empty { display: none; }
    #leaderboard { width: 210px; }
    #leaderboard h2 { margin: 0 0 8px; font-size: 16px; letter-spacing: 0.04em; text-transform: uppercase; }
    #leaders { margin: 0; padding-left: 22px; font-variant-numeric: tabular-nums; }
    #leaders li { display: list-item; margin: 3px 0; }
    #leaders .pts { float: right; font-weight: 600; }
```

- [ ] **Step 2: HTML** — zastąp blok od `<div id="score">` do zamknięcia `<div class="stage">…</div>` oraz linię `<script src="snake-logic.js"></script>`:

```html
  <div id="score">Punkty: 0</div>
  <div id="player" class="panel">
    <form id="login-form" hidden>
      <input id="email" type="email" required placeholder="Twój e-mail" autocomplete="email">
      <button type="submit">Wyślij link logowania</button>
    </form>
    <form id="nick-form" hidden>
      <input id="nick" type="text" required minlength="3" maxlength="20" placeholder="Wybierz nick">
      <button type="submit">Zapisz nick</button>
    </form>
    <div id="whoami" hidden>Grasz jako <strong id="nick-label"></strong> <button id="logout" type="button">Wyloguj</button></div>
    <div id="msg" role="status"></div>
  </div>
  <div class="layout">
    <div class="stage">
      <canvas id="board" width="480" height="480"></canvas>
    </div>
    <aside id="leaderboard" class="panel">
      <h2>Najlepsi</h2>
      <ol id="leaders"></ol>
    </aside>
  </div>

  <script src="snake-logic.js"></script>
  <script src="snake-cloud.js"></script>
```

- [ ] **Step 3: Skrypt** — pod `var scoreEl = document.getElementById('score');` dodaj:

```js
      var C = window.SnakeCloud;
      var loginForm = document.getElementById('login-form');
      var nickForm = document.getElementById('nick-form');
      var whoami = document.getElementById('whoami');
      var emailInput = document.getElementById('email');
      var nickInput = document.getElementById('nick');
      var nickLabel = document.getElementById('nick-label');
      var msgEl = document.getElementById('msg');
      var leadersEl = document.getElementById('leaders');

      var player = null;       // { nick } gdy zalogowany i z nickiem — tylko wtedy zapisujemy

      var ERRORS = {
        network: 'Brak połączenia — zapis niedostępny',
        nick_taken: 'Ten nick jest zajęty',
        over_email_send_rate_limit: 'Limit wysyłki linków — spróbuj za godzinę',
        session_expired: 'Sesja wygasła — zaloguj się ponownie',
        otp_expired: 'Link logowania wygasł — wyślij nowy'
      };

      function errorText(r) {
        if (r.status === 429) return ERRORS.over_email_send_rate_limit;
        return ERRORS[r.error] || 'Błąd: ' + r.error;
      }

      function say(text) {
        msgEl.textContent = text || '';
      }

      // name: 'login' | 'nick' | 'player' | null (nic poza komunikatem)
      function setView(name) {
        loginForm.hidden = name !== 'login';
        nickForm.hidden = name !== 'nick';
        whoami.hidden = name !== 'player';
      }

      // Po kliknięciu przycisku fokus zostaje na nim, a Enter/Spacja kliknęłyby go ponownie zamiast sterować grą.
      function releaseFocus() {
        if (document.activeElement) document.activeElement.blur();
      }

      function refreshPlayer() {
        if (!C.isSignedIn()) {
          player = null;
          setView('login');
          return;
        }
        C.getPlayer().then(function (r) {
          if (!r.ok) {
            setView(C.isSignedIn() ? null : 'login');
            say(errorText(r));
            return;
          }
          if (!r.data) {
            player = null;
            setView('nick');
            return;
          }
          player = r.data;
          nickLabel.textContent = player.nick;
          setView('player');
          onPlayerReady();
        });
      }

      function onPlayerReady() {}

      function refreshLeaderboard() {
        C.getLeaderboard().then(function (r) {
          leadersEl.textContent = '';
          if (!r.ok || !r.data.length) {
            var empty = document.createElement('li');
            empty.textContent = r.ok ? 'Jeszcze nikt nie grał' : 'Brak połączenia';
            leadersEl.appendChild(empty);
            return;
          }
          r.data.forEach(function (row) {
            var li = document.createElement('li');
            var pts = document.createElement('span');
            pts.className = 'pts';
            pts.textContent = row.score;
            li.appendChild(pts);
            li.appendChild(document.createTextNode(row.nick));
            leadersEl.appendChild(li);
          });
        });
      }

      loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        releaseFocus();
        var email = emailInput.value.trim();
        say('Wysyłam link…');
        C.sendMagicLink(email).then(function (r) {
          say(r.ok ? 'Sprawdź skrzynkę ' + email + ' i kliknij link logowania' : errorText(r));
        });
      });

      nickForm.addEventListener('submit', function (e) {
        e.preventDefault();
        releaseFocus();
        C.createPlayer(nickInput.value.trim()).then(function (r) {
          if (!r.ok) {
            say(errorText(r));
            return;
          }
          say('');
          refreshPlayer();
        });
      });

      document.getElementById('logout').addEventListener('click', function () {
        releaseFocus();
        C.signOut().then(function () {
          player = null;
          setView('login');
          say('Wylogowano');
        });
      });

      var boot = C.init();
      if (boot.linkError) say(errorText({ error: boot.linkError }));
      refreshPlayer();
      refreshLeaderboard();
```

- [ ] **Step 4: Zrzut ekranu** — headless Chrome 1600×900 (polecenie jak w Task 6 Step 6, tylko na `index.html`). Expected: tytuł, licznik, panel z polem e-mail, plansza, po prawej „Najlepsi" z „Jeszcze nikt nie grał".

- [ ] **Step 5: Testy logiki** — `Zaliczone: 28 / 28`.

---

### Task 6: Autozapis, wznawianie i zapis wyniku

**Files:**
- Modify: `index.html` (skrypt)

**Interfaces:**
- Consumes: `SnakeLogic.restoreState` (Task 2); `SnakeCloud.saveGame/loadGame/deleteGame/submitScore` (Task 3); `player`, `say`, `errorText`, `refreshLeaderboard`, `onPlayerReady`, `playMs`, `togglePause` (Task 4–5).

- [ ] **Step 1: Zmienne i kolejka zapisów** — pod `var player = null;` dodaj:

```js
      var resumeOffer = null;  // { state, playMs } — zapis czekający na decyzję gracza
      var lastSaveAt = 0;
      var AUTOSAVE_MS = 5000;

      // Zapisy idą po kolei: autozapis wysłany tuż przed końcem gry nie może
      // dotrzeć po skasowaniu zapisu i „wskrzesić" zakończonej gry.
      var writes = Promise.resolve();
      function queueWrite(fn) {
        writes = writes.then(fn);
        return writes;
      }

      function canSave() {
        return !!player && (state.status === 'running' || state.status === 'paused');
      }

      function saveNow(keepalive) {
        if (!canSave()) return;
        lastSaveAt = performance.now();
        // Kopia teraz, bo stan zmieni się, zanim zapis wyjdzie z kolejki.
        var payload = JSON.parse(JSON.stringify({ state: state, playMs: playMs }));
        queueWrite(function () {
          return C.saveGame(payload, keepalive).then(function (r) {
            if (r.ok) return;
            say(errorText(r));
            if (r.error === 'session_expired') {
              player = null;
              setView('login');
            }
          });
        });
      }

      function discardSave() {
        queueWrite(function () { return C.deleteGame(); });
      }

      function submitScore(score, result, ms, retried) {
        queueWrite(function () {
          return C.submitScore(score, result, ms).then(function (r) {
            if (r.ok) {
              say('Wynik zapisany');
              refreshLeaderboard();
            } else if (!retried) {
              setTimeout(function () { submitScore(score, result, ms, true); }, 3000);
            } else {
              say(r.error === 'network' ? 'Brak połączenia — wynik nie zapisany' : errorText(r));
            }
          });
        });
      }

      function onGameEnd() {
        if (!player) return;
        submitScore(state.score, state.status, playMs, false);
        discardSave();
      }
```

- [ ] **Step 2: Wczytanie zapisu po zalogowaniu** — zastąp `function onPlayerReady() {}`:

```js
      function onPlayerReady() {
        C.loadGame().then(function (r) {
          if (!r.ok || !r.data) return;
          var payload = r.data.state;
          var restored = payload && L.restoreState(payload.state);
          if (!restored) {
            discardSave();
            say('Zapis uszkodzony — zaczynasz od nowa');
            return;
          }
          // Gra zaczęta, zanim zapis zdążył się wczytać, ma pierwszeństwo.
          if (state.status !== 'ready') return;
          resumeOffer = { state: restored, playMs: Number(payload.playMs) || 0 };
        });
      }
```

- [ ] **Step 3: Klawiatura** — w handlerze `keydown`, zaraz po `if (key.indexOf('arrow') === 0 || key === ' ') e.preventDefault();` wstaw:

```js
        // Dopóki gracz nie wybierze „wznów" albo „nowa gra", inne klawisze nic nie robią.
        if (resumeOffer && state.status === 'ready') {
          if (key === 'enter') {
            state = resumeOffer.state;
            playMs = resumeOffer.playMs;
            resumeOffer = null;
            accumulator = 0;
          } else if (key === 'n') {
            resumeOffer = null;
            discardSave();
          }
          return;
        }
```

oraz w `togglePause()` zmień gałąź pauzy na:

```js
        if (state.status === 'running') {
          L.pause(state);
          saveNow(false);
        } else if (state.status === 'paused') {
```

- [ ] **Step 4: Pętla gry** — w `frame(now)` zastąp blok `if (state.status === 'running') { ... }` (bez gałęzi `else`):

```js
        if (state.status === 'running') {
          playMs += Math.min(dt, 1000);
          // Górny limit akumulatora chroni przed lawiną kroków po powrocie z nieaktywnej karty.
          accumulator = Math.min(accumulator + dt, state.intervalMs * MAX_STEPS_PER_FRAME);
          var steps = 0;
          while (accumulator >= state.intervalMs && state.status === 'running' && steps < MAX_STEPS_PER_FRAME) {
            accumulator -= state.intervalMs;
            L.step(state);
            steps++;
          }
          if (state.status === 'over' || state.status === 'won') {
            onGameEnd();
          } else if (now - lastSaveAt >= AUTOSAVE_MS) {
            saveNow(false);
          }
        }
```

- [ ] **Step 5: Zamknięcie / przełączenie karty i nakładki** — pod `function togglePause() {...}` dodaj:

```js
      document.addEventListener('visibilitychange', function () {
        if (document.hidden && state.status === 'running') {
          L.pause(state);
          saveNow(true);
        }
      });
```

i w `render(now)` zastąp gałęzie `ready` i `over`:

```js
        if (state.status === 'ready') {
          drawOverlay(resumeOffer
            ? ['Wznów grę (' + resumeOffer.state.score + ' pkt) — Enter', 'Nowa gra — N']
            : ['Strzałki lub WSAD — start']);
        } else if (state.status === 'paused') {
          drawOverlay(['Pauza', 'P lub strzałka — wznów']);
        } else if (state.status === 'over') {
          drawOverlay(player
            ? ['Koniec gry · Punkty: ' + state.score, 'Spacja — nowa gra']
            : ['Koniec gry · Punkty: ' + state.score, 'Spacja — nowa gra', 'Zaloguj się, aby zapisać wynik']);
        } else if (state.status === 'won') {
```

- [ ] **Step 6: Weryfikacja** — testy `28 / 28`; zrzut ekranu:

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=1600,900 --virtual-time-budget=5000 "--screenshot=<scratchpad>\index.png" "file:///C:/Szkolenie AI/29.09/index.html" 2>$null
```

Expected: brak błędów w układzie; „Najlepsi" wczytane. Logowanie, autozapis i wznowienie sprawdzane w Task 7 na GitHub Pages (link z e-maila wraca na adres Pages).

---

### Task 7: Specyfikacja gry, publikacja i weryfikacja na żywo

**Files:**
- Modify: `wymagania-snake.md` (sekcje 1, 2, 6, 8)

- [ ] **Step 1: `wymagania-snake.md`**
  - Sekcja 1, „Poza zakresem": usuń „rekordy w `localStorage`" i „tabela wyników"; dopisz pod listą: „Wyniki, logowanie i wznawianie gry: `docs/superpowers/specs/2026-10-13-wyniki-i-wznawianie-design.md`."
  - Sekcja 2, tabela: dodaj wiersz `| snake-cloud.js | Klient Supabase na fetch: logowanie, zapis gry, wyniki. | brak |` i zmień zależności `index.html` na `snake-logic.js, snake-cloud.js`.
  - Sekcja 6: dodaj punkty „**Pauza:** `P` lub `Esc`; wznowienie `P` lub klawiszem kierunku." oraz „Gdy fokus jest w polu tekstowym, gra ignoruje klawisze."
  - Sekcja 8, „Paleta": zastąp opisem motywu dżungli — plansza `#1f4a1c`/`#1a4118` z fazą, wąż w odcieniach 66–96 (limonka → złoto) z cieniem i odblaskiem, głowa złota z oczami, jedzenie `#ef4444` z listkiem, tło strony `tlo-dzungla/tlo-dzungla.jpg`.

- [ ] **Step 2: Commit i PR — tylko na polecenie użytkowniczki.** Gałąź `wyniki-supabase` od `main`; commit plików `snake-logic.js`, `snake-cloud.js`, `index.html`, `tests.html`, `wymagania-snake.md`, `supabase/`, `docs/superpowers/`; PR do `main`; scalenie dopiero po „scal".

- [ ] **Step 3: Weryfikacja ręczna na GitHub Pages** (spec, sekcja 10, punkty 1–10). Po każdym punkcie sprawdzić w bazie (Management API, token z `~/.supabase/access-token`):

```sql
select (select count(*) from players) players,
       (select count(*) from scores) scores,
       (select count(*) from saved_games) saves;
```

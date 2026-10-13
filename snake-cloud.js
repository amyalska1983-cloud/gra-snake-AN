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

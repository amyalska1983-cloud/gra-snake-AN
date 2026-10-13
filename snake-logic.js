// Czysta logika gry Snake. Bez DOM i Canvas; jedyny kontakt z otoczeniem to eksport window.SnakeLogic.
(function (global) {
  'use strict';

  var COLS = 20;
  var ROWS = 20;
  var START_INTERVAL_MS = 125;
  var SPEEDUP_MS = 4;
  var MIN_INTERVAL_MS = 55;
  var MAX_QUEUE = 2;

  var DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  function sameCell(a, b) {
    return a.x === b.x && a.y === b.y;
  }

  function isOpposite(a, b) {
    return a.x === -b.x && a.y === -b.y;
  }

  function spawnFood(state, rng) {
    rng = rng || Math.random;
    var occupied = {};
    for (var i = 0; i < state.snake.length; i++) {
      occupied[state.snake[i].x + ',' + state.snake[i].y] = true;
    }
    var free = [];
    for (var y = 0; y < state.rows; y++) {
      for (var x = 0; x < state.cols; x++) {
        if (!occupied[x + ',' + y]) free.push({ x: x, y: y });
      }
    }
    // Brak wolnych pól oznacza zapełnioną planszę; jedzenia nie ma gdzie położyć.
    state.food = free.length ? free[Math.floor(rng() * free.length)] : null;
  }

  function createState(rng) {
    var state = {
      cols: COLS,
      rows: ROWS,
      snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
      direction: { x: DIRECTIONS.right.x, y: DIRECTIONS.right.y },
      queue: [],
      food: null,
      score: 0,
      intervalMs: START_INTERVAL_MS,
      status: 'ready'
    };
    spawnFood(state, rng);
    return state;
  }

  function start(state) {
    if (state.status === 'ready') state.status = 'running';
  }

  function pause(state) {
    if (state.status === 'running') state.status = 'paused';
  }

  function resume(state) {
    if (state.status === 'paused') state.status = 'running';
  }

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

  function enqueueDirection(state, dir) {
    if (state.queue.length >= MAX_QUEUE) return false;
    var ref = state.queue.length ? state.queue[state.queue.length - 1] : state.direction;
    if (sameCell(dir, ref) || isOpposite(dir, ref)) return false;
    state.queue.push({ x: dir.x, y: dir.y });
    return true;
  }

  function step(state, rng) {
    if (state.status !== 'running') return;

    if (state.queue.length) state.direction = state.queue.shift();

    var head = state.snake[0];
    var next = {
      x: (head.x + state.direction.x + state.cols) % state.cols,
      y: (head.y + state.direction.y + state.rows) % state.rows
    };

    var eats = state.food !== null && sameCell(next, state.food);
    // Bez jedzenia ogon ustępuje w tym samym kroku, więc jego pole nie jest kolizją.
    var checkLen = eats ? state.snake.length : state.snake.length - 1;
    for (var i = 0; i < checkLen; i++) {
      if (sameCell(next, state.snake[i])) {
        state.status = 'over';
        return;
      }
    }

    state.snake.unshift(next);

    if (eats) {
      state.score += 1;
      state.intervalMs = Math.max(MIN_INTERVAL_MS, state.intervalMs - SPEEDUP_MS);
      if (state.snake.length === state.cols * state.rows) {
        state.food = null;
        state.status = 'won';
        return;
      }
      spawnFood(state, rng);
    } else {
      state.snake.pop();
    }

    if (state.snake.length === state.cols * state.rows) state.status = 'won';
  }

  global.SnakeLogic = {
    createState: createState,
    step: step,
    enqueueDirection: enqueueDirection,
    spawnFood: spawnFood,
    start: start,
    pause: pause,
    resume: resume,
    restoreState: restoreState,
    DIRECTIONS: DIRECTIONS
  };
})(window);

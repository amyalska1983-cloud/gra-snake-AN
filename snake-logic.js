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
    DIRECTIONS: DIRECTIONS
  };
})(window);

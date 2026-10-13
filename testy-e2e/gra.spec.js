// Testy wizualne „Syk dżungli”: 5 momentów gry porównywanych z wzorcowymi zrzutami.
// Powtarzalność: zegar strony kontroluje Playwright (page.clock), Math.random jest stały
// (jedzenie zawsze w polu (18, 9)), a Supabase odpowiada pustą listą zamiast prawdziwych danych.
const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const GAME = pathToFileURL(path.join(ROOT, 'index.html')).href;
const LOGIC_TESTS = pathToFileURL(path.join(ROOT, 'tests.html')).href;
const STEP_MS = 125;

test('testy logiki w tests.html przechodzą', async ({ page }) => {
  await page.goto(LOGIC_TESTS);
  const summary = page.locator('#summary');
  await expect(summary).toHaveClass('pass');
  await expect(summary).toHaveText(/^Zaliczone: (\d+) \/ \1$/);
});

test('przebieg gry: start, punkt, pauza, ostatnie sekundy, koniec czasu', async ({ page }) => {
  await page.route('https://ddgolzidohleaedavoas.supabase.co/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.addInitScript(() => { Math.random = () => 0.5; });

  const t0 = new Date('2026-10-13T12:00:00Z');
  await page.clock.install({ time: t0 });
  await page.goto(GAME);
  await expect(page.locator('#leaders li')).toHaveText('Jeszcze nikt nie grał');
  await page.clock.pauseAt(new Date(t0.getTime() + 20000));
  await page.clock.runFor(200);

  const score = page.locator('#score');

  await expect(score).toHaveText('Punkty: 0 · Czas: 1:00');
  await expect(page).toHaveScreenshot('01-ekran-startowy.png');

  // W górę o jedno pole, potem 8 pól w prawo do jedzenia w (18, 9).
  await page.keyboard.press('ArrowUp');
  await page.clock.runFor(STEP_MS + 15);
  await page.keyboard.press('ArrowRight');
  await page.clock.runFor(STEP_MS * 8 + 300);
  await expect(score).toHaveText('Punkty: 1 · Czas: 0:59');
  await expect(page).toHaveScreenshot('02-gra-zdobyty-punkt.png');

  // Pauza zatrzymuje grę i zegar.
  await page.keyboard.press('p');
  await page.clock.runFor(3000);
  await expect(score).toHaveText('Punkty: 1 · Czas: 0:59');
  await expect(page).toHaveScreenshot('03-pauza.png');

  // Do ~55 s czasu gry; dotąd gra naliczyła ~1,4 s, pauza się nie liczy.
  await page.keyboard.press('p');
  await page.clock.runFor(55000 - (STEP_MS * 9 + 315));
  await expect(score).toHaveText('Punkty: 1 · Czas: 0:06');
  await expect(page.locator('#score .time')).toHaveClass(/\blow\b/);
  await expect(page).toHaveScreenshot('04-ostatnie-sekundy.png');

  // Po 60 s gra się kończy.
  await page.clock.runFor(6000);
  await expect(score).toHaveText('Punkty: 1 · Czas: 0:00');
  await expect(page).toHaveScreenshot('05-czas-minal.png');
});

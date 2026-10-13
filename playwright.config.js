// Testy Playwright. Używają zainstalowanego Chrome (channel: 'chrome'), więc nie trzeba pobierać przeglądarek.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './testy-e2e',
  // Wzorcowe zrzuty zależą od systemu (czcionki), stąd {platform} w nazwie.
  snapshotPathTemplate: '{testDir}/zrzuty-wzorcowe/{arg}-{platform}{ext}',
  reporter: 'list',
  // Przewinięcie minuty gry przez page.clock rysuje wszystkie klatki — trwa dłużej niż domyślne 30 s.
  timeout: 180000,
  use: {
    channel: 'chrome',
    viewport: { width: 1280, height: 720 }
  },
  expect: {
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.01 }
  }
});

/** Playwright config for BuildBanner e2e smoke tests — the system Google Chrome only. */
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.',
  timeout: 30000,
  retries: 0,
  projects: [
    {
      // channel 'chrome' launches the installed Google Chrome, which updates itself, instead of
      // the Chromium build that `npx playwright install` downloads for the pinned Playwright.
      name: 'chrome',
      use: { browserName: 'chromium', channel: 'chrome' },
    },
  ],
});

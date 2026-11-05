// Browser tests (npm.cmd run test:e2e): Chromium drives the real pages of a throw-away copy of the app with the made-up people of
// test/fixture-round4.js and the fake AI. Never the real data.json. One worker, so the tests never step on each other.
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: 'test/e2e',
  testMatch: /.*\.spec\.js/,
  globalSetup: require.resolve('./test/e2e/global-setup.js'),
  workers: 1, fullyParallel: false, retries: 0, timeout: 60000,
  expect: { timeout: 10000 },
  reporter: [['list']],
  outputDir: require('os').tmpdir() + '/qsmart-e2e-results',
  use: { browserName: 'chromium', headless: true, viewport: { width: 1366, height: 800 }, actionTimeout: 10000, trace: 'off' }
});

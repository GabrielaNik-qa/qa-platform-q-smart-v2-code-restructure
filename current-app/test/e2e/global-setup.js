// Starts the fake AI and the app on a new temp copy (made-up people only) before the browser tests, and stops both after.
// The address is handed to the tests in E2E_BASE.
const { startApp } = require('../fixture-round4');
const fakeAi = require('../fake-ai');

module.exports = async () => {
  const fake = await fakeAi.start(0);
  const app = await startApp({ env: { ANTHROPIC_BASE_URL: fake.url } });
  process.env.E2E_BASE = app.base; process.env.E2E_DATA = app.DATA;
  return async () => { app.stop(); fake.srv.close(); };
};

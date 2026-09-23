/** Vitest configuration for tests/ at the root, without the Playwright tests in tests/e2e. */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Collect only the root tests/ directory. The `tests/` filter in `npm test` matches every
    // path that contains "tests/", so without this list the root run also ran client/tests and
    // node/tests, which `make test-js` runs with their own configs.
    include: ['tests/**/*.test.js'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'tests/e2e/**',
      '.autopilot/**',
    ],
    // Node 25 and later define globalThis.localStorage, which is undefined unless
    // --localstorage-file is set. Vitest 3.0.7 does not copy a jsdom window key that already
    // exists on the Node global, so jsdom's localStorage never replaces it. Turning off Node's
    // Web Storage in the forked test workers leaves the key free for jsdom. Node accepts the
    // flag from 22.4 on.
    pool: 'forks',
    poolOptions: { forks: { execArgv: ['--no-experimental-webstorage'] } },
  },
});

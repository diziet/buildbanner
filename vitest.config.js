/** Root vitest configuration — excludes Playwright e2e tests. */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'tests/e2e/**',
      '.autopilot/**',
    ],
  },
});

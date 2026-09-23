/** Vitest configuration for BuildBanner client tests. */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    // Node 25 and later define globalThis.localStorage, which is undefined unless
    // --localstorage-file is set. Vitest 3.0.7 does not copy a jsdom window key that already
    // exists on the Node global, so jsdom's localStorage never replaces it. Turning off Node's
    // Web Storage in the forked test workers leaves the key free for jsdom. Node accepts the
    // flag from 22.4 on.
    pool: "forks",
    poolOptions: { forks: { execArgv: ["--no-experimental-webstorage"] } },
  },
});

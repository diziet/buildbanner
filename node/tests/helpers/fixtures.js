/** Shared test fixtures for BuildBanner middleware tests. */

export const DEFAULT_PATH = '/buildbanner.json';
export const FAKE_SHA = 'a1b2c3d';
export const FAKE_SHA_FULL = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
export const FAKE_BRANCH = 'main';
export const FAKE_TOKEN = 'abcdefghijklmnop';

export const FAKE_BANNER_DATA = {
  _buildbanner: { version: 1 },
  sha: FAKE_SHA,
  sha_full: FAKE_SHA_FULL,
  branch: FAKE_BRANCH,
  server_started: '2026-02-13T14:25:00.000Z',
};

/** Create a fake createBanner factory with optional token auth and extras. */
export function fakeCreateBanner(token = null) {
  return (opts = {}) => ({
    getBannerData: () => {
      const data = { ...FAKE_BANNER_DATA };
      if (typeof opts.extras === 'function') {
        try {
          const extra = opts.extras();
          if (extra && typeof extra === 'object') {
            Object.assign(data, extra);
          }
        } catch {
          // extras threw — omit them
        }
      }
      return data;
    },
    checkAuth: (header) => {
      if (!token) return { authorized: true };
      if (!header || !header.startsWith('Bearer ')) {
        return { authorized: false };
      }
      return { authorized: header.slice('Bearer '.length) === token };
    },
  });
}

/** Create a factory where getBannerData always throws. */
export function throwingCreateBanner() {
  return () => ({
    getBannerData: () => {
      throw new Error('unexpected failure');
    },
    checkAuth: () => ({ authorized: true }),
  });
}

/** Save and restore env vars around tests. */
export function withEnvOverrides(varNames) {
  const saved = {};

  return {
    save() {
      for (const name of varNames) {
        saved[name] = process.env[name];
      }
    },
    restore() {
      for (const name of varNames) {
        if (saved[name] === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = saved[name];
        }
      }
    },
  };
}

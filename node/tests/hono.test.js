/** Tests for node/hono.js — BuildBanner Hono middleware integration. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { buildBannerHono } from '../hono.js';
import {
  DEFAULT_PATH,
  FAKE_SHA,
  FAKE_SHA_FULL,
  FAKE_BRANCH,
  FAKE_TOKEN,
  fakeCreateBanner,
  throwingCreateBanner,
  withEnvOverrides,
} from './helpers/fixtures.js';

/** Create a Hono app with the middleware and an extra test route. */
function createApp(options = {}) {
  const mergedOptions = {
    _createBanner: fakeCreateBanner(options.token),
    ...options,
  };
  const app = new Hono();
  app.use('*', buildBannerHono(mergedOptions));
  app.get('/health', (c) => c.json({ status: 'ok' }));
  return app;
}

/** Helper to make a request against a Hono app. */
function req(app, method, path, headers = {}) {
  const url = `http://localhost${path}`;
  const init = { method, headers };
  return app.request(url, init);
}

describe('Hono middleware — happy path', () => {
  it('returns 200 with valid JSON on default path', async () => {
    const app = createApp();
    const res = await req(app, 'GET', DEFAULT_PATH);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body._buildbanner).toEqual({ version: 1 });
    expect(body.sha).toBe(FAKE_SHA);
    expect(body.sha_full).toBe(FAKE_SHA_FULL);
    expect(body.branch).toBe(FAKE_BRANCH);
    expect(typeof body.server_started).toBe('string');
  });
});

describe('Hono middleware — response headers', () => {
  it('sets Cache-Control: no-store', async () => {
    const app = createApp();
    const res = await req(app, 'GET', DEFAULT_PATH);

    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('sets Content-Type: application/json', async () => {
    const app = createApp();
    const res = await req(app, 'GET', DEFAULT_PATH);

    expect(res.headers.get('content-type')).toMatch(/application\/json/);
  });
});

describe('Hono middleware — passthrough', () => {
  it('calls next() for non-matching paths', async () => {
    const app = createApp();
    const res = await req(app, 'GET', '/health');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });

  it('calls next() for non-GET methods on the banner path', async () => {
    const app = createApp();
    const res = await req(app, 'POST', DEFAULT_PATH);

    expect(res.status).not.toBe(200);
  });
});

describe('Hono middleware — env var overrides (via core)', () => {
  const envHelper = withEnvOverrides([
    'BUILDBANNER_SHA',
    'BUILDBANNER_BRANCH',
  ]);

  beforeEach(() => envHelper.save());
  afterEach(() => envHelper.restore());

  it('env vars override git values when using real core', async () => {
    process.env.BUILDBANNER_SHA = 'ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00';
    process.env.BUILDBANNER_BRANCH = 'env-branch';

    const app = new Hono();
    app.use('*', buildBannerHono());
    const res = await req(app, 'GET', DEFAULT_PATH);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sha).toBe('ff00ff0');
    expect(body.branch).toBe('env-branch');
  });
});

describe('Hono middleware — extras callback', () => {
  it('merges extras into response', async () => {
    const app = createApp({
      extras: () => ({ uptime: 42 }),
    });
    const res = await req(app, 'GET', DEFAULT_PATH);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.uptime).toBe(42);
  });

  it('responds without extras when callback throws', async () => {
    const app = createApp({
      extras: () => {
        throw new Error('boom');
      },
    });
    const res = await req(app, 'GET', DEFAULT_PATH);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body._buildbanner).toEqual({ version: 1 });
    expect(body.sha).toBe(FAKE_SHA);
  });
});

describe('Hono middleware — BUILDBANNER_CUSTOM_* env vars', () => {
  const envHelper = withEnvOverrides([
    'BUILDBANNER_CUSTOM_TEAM',
    'BUILDBANNER_CUSTOM_REGION',
  ]);

  beforeEach(() => {
    envHelper.save();
    process.env.BUILDBANNER_CUSTOM_TEAM = 'platform';
    process.env.BUILDBANNER_CUSTOM_REGION = 'us-east-1';
  });

  afterEach(() => envHelper.restore());

  it('populates custom map from env vars', async () => {
    const app = new Hono();
    app.use('*', buildBannerHono());
    const res = await req(app, 'GET', DEFAULT_PATH);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.custom).toBeDefined();
    expect(body.custom.team).toBe('platform');
    expect(body.custom.region).toBe('us-east-1');
  });
});

describe('Hono middleware — token auth', () => {
  it('returns 401 when token configured and header missing', async () => {
    const app = createApp({ token: FAKE_TOKEN });
    const res = await req(app, 'GET', DEFAULT_PATH);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 when token configured and header is wrong', async () => {
    const app = createApp({ token: FAKE_TOKEN });
    const res = await req(app, 'GET', DEFAULT_PATH, {
      Authorization: 'Bearer wrong-token',
    });

    expect(res.status).toBe(401);
  });

  it('returns 200 when token configured and header is correct', async () => {
    const app = createApp({ token: FAKE_TOKEN });
    const res = await req(app, 'GET', DEFAULT_PATH, {
      Authorization: `Bearer ${FAKE_TOKEN}`,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body._buildbanner).toEqual({ version: 1 });
  });

  it('returns 200 when no token configured', async () => {
    const app = createApp();
    const res = await req(app, 'GET', DEFAULT_PATH);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body._buildbanner).toEqual({ version: 1 });
  });
});

describe('Hono middleware — internal error handling', () => {
  it('returns 500 with generic message when getBannerData throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = new Hono();
    app.use('*', buildBannerHono({ _createBanner: throwingCreateBanner() }));
    const res = await req(app, 'GET', DEFAULT_PATH);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
    errorSpy.mockRestore();
  });
});

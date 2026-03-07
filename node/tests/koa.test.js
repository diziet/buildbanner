/** Tests for node/koa.js — BuildBanner Koa middleware integration. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Koa from 'koa';
import request from 'supertest';
import { buildBannerKoa } from '../koa.js';
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

/** Create a Koa app with the middleware and an extra test route. */
function createApp(options = {}) {
  const mergedOptions = {
    _createBanner: fakeCreateBanner(options.token),
    ...options,
  };
  const app = new Koa();
  app.use(buildBannerKoa(mergedOptions));
  app.use(async (ctx) => {
    if (ctx.path === '/health' && ctx.method === 'GET') {
      ctx.body = { status: 'ok' };
    }
  });
  return app;
}

describe('Koa middleware — happy path', () => {
  it('returns 200 with valid JSON on default path', async () => {
    const app = createApp();
    const res = await request(app.callback()).get(DEFAULT_PATH);

    expect(res.status).toBe(200);
    expect(res.body._buildbanner).toEqual({ version: 1 });
    expect(res.body.sha).toBe(FAKE_SHA);
    expect(res.body.sha_full).toBe(FAKE_SHA_FULL);
    expect(res.body.branch).toBe(FAKE_BRANCH);
    expect(typeof res.body.server_started).toBe('string');
  });
});

describe('Koa middleware — response headers', () => {
  it('sets Cache-Control: no-store', async () => {
    const app = createApp();
    const res = await request(app.callback()).get(DEFAULT_PATH);

    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('sets Content-Type: application/json', async () => {
    const app = createApp();
    const res = await request(app.callback()).get(DEFAULT_PATH);

    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

describe('Koa middleware — passthrough', () => {
  it('calls next() for non-matching paths', async () => {
    const app = createApp();
    const res = await request(app.callback()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('calls next() for non-GET methods on the banner path', async () => {
    const app = createApp();
    const res = await request(app.callback()).post(DEFAULT_PATH);

    expect(res.status).not.toBe(200);
  });
});

describe('Koa middleware — env var overrides (via core)', () => {
  const envHelper = withEnvOverrides([
    'BUILDBANNER_SHA',
    'BUILDBANNER_BRANCH',
  ]);

  beforeEach(() => envHelper.save());
  afterEach(() => envHelper.restore());

  it('env vars override git values when using real core', async () => {
    process.env.BUILDBANNER_SHA = 'ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00';
    process.env.BUILDBANNER_BRANCH = 'env-branch';

    const app = new Koa();
    app.use(buildBannerKoa());
    const res = await request(app.callback()).get(DEFAULT_PATH);

    expect(res.status).toBe(200);
    expect(res.body.sha).toBe('ff00ff0');
    expect(res.body.branch).toBe('env-branch');
  });
});

describe('Koa middleware — extras callback', () => {
  it('merges extras into response', async () => {
    const app = createApp({
      extras: () => ({ uptime: 42 }),
    });
    const res = await request(app.callback()).get(DEFAULT_PATH);

    expect(res.status).toBe(200);
    expect(res.body.uptime).toBe(42);
  });

  it('responds without extras when callback throws', async () => {
    const app = createApp({
      extras: () => {
        throw new Error('boom');
      },
    });
    const res = await request(app.callback()).get(DEFAULT_PATH);

    expect(res.status).toBe(200);
    expect(res.body._buildbanner).toEqual({ version: 1 });
    expect(res.body.sha).toBe(FAKE_SHA);
  });
});

describe('Koa middleware — BUILDBANNER_CUSTOM_* env vars', () => {
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
    const app = new Koa();
    app.use(buildBannerKoa());
    const res = await request(app.callback()).get(DEFAULT_PATH);

    expect(res.status).toBe(200);
    expect(res.body.custom).toBeDefined();
    expect(res.body.custom.team).toBe('platform');
    expect(res.body.custom.region).toBe('us-east-1');
  });
});

describe('Koa middleware — token auth', () => {
  it('returns 401 when token configured and header missing', async () => {
    const app = createApp({ token: FAKE_TOKEN });
    const res = await request(app.callback()).get(DEFAULT_PATH);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('returns 401 when token configured and header is wrong', async () => {
    const app = createApp({ token: FAKE_TOKEN });
    const res = await request(app.callback())
      .get(DEFAULT_PATH)
      .set('Authorization', 'Bearer wrong-token');

    expect(res.status).toBe(401);
  });

  it('returns 200 when token configured and header is correct', async () => {
    const app = createApp({ token: FAKE_TOKEN });
    const res = await request(app.callback())
      .get(DEFAULT_PATH)
      .set('Authorization', `Bearer ${FAKE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body._buildbanner).toEqual({ version: 1 });
  });

  it('returns 200 when no token configured', async () => {
    const app = createApp();
    const res = await request(app.callback()).get(DEFAULT_PATH);

    expect(res.status).toBe(200);
    expect(res.body._buildbanner).toEqual({ version: 1 });
  });
});

describe('Koa middleware — internal error handling', () => {
  it('returns 500 with generic message when getBannerData throws', async () => {
    const app = new Koa();
    app.use(buildBannerKoa({ _createBanner: throwingCreateBanner() }));
    const res = await request(app.callback()).get(DEFAULT_PATH);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });
});

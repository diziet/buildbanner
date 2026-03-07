/** Tests for node/server.js — BuildBanner Express middleware integration. */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { buildBannerMiddleware } from '../server.js';
import {
  FAKE_SHA,
  FAKE_SHA_FULL,
  FAKE_BRANCH,
  FAKE_TOKEN,
  fakeCreateBanner,
} from './helpers/fixtures.js';

/** Create an Express app with the middleware and an extra test route. */
function createApp(options = {}) {
  const mergedOptions = {
    _createBanner: fakeCreateBanner(options.token),
    ...options,
  };
  const app = express();
  app.use(buildBannerMiddleware(mergedOptions));
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  return app;
}

describe('Express middleware — happy path', () => {
  it('returns 200 with valid JSON on default path', async () => {
    const app = createApp();
    const res = await request(app).get('/buildbanner.json');

    expect(res.status).toBe(200);
    expect(res.body._buildbanner).toEqual({ version: 1 });
    expect(res.body.sha).toBe(FAKE_SHA);
    expect(res.body.sha_full).toBe(FAKE_SHA_FULL);
    expect(res.body.branch).toBe(FAKE_BRANCH);
    expect(typeof res.body.server_started).toBe('string');
  });
});

describe('Express middleware — response headers', () => {
  it('sets Cache-Control: no-store', async () => {
    const app = createApp();
    const res = await request(app).get('/buildbanner.json');

    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('sets Content-Type: application/json', async () => {
    const app = createApp();
    const res = await request(app).get('/buildbanner.json');

    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

describe('Express middleware — passthrough', () => {
  it('calls next() for non-matching paths', async () => {
    const app = createApp();
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('calls next() for non-GET methods on the banner path', async () => {
    const app = createApp();
    const res = await request(app).post('/buildbanner.json');

    expect(res.status).not.toBe(200);
  });
});

describe('Express middleware — custom path', () => {
  it('serves on a custom path', async () => {
    const app = createApp({ path: '/api/info' });
    const res = await request(app).get('/api/info');

    expect(res.status).toBe(200);
    expect(res.body._buildbanner).toEqual({ version: 1 });
  });

  it('does not serve on default path when custom path is set', async () => {
    const app = createApp({ path: '/api/info' });
    const res = await request(app).get('/buildbanner.json');

    expect(res.status).toBe(404);
  });
});

describe('Express middleware — token auth', () => {
  it('returns 401 when token configured and header missing', async () => {
    const app = createApp({ token: FAKE_TOKEN });
    const res = await request(app).get('/buildbanner.json');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('returns 401 when token configured and header is wrong', async () => {
    const app = createApp({ token: FAKE_TOKEN });
    const res = await request(app)
      .get('/buildbanner.json')
      .set('Authorization', 'Bearer wrong-token');

    expect(res.status).toBe(401);
  });

  it('returns 200 when token configured and header is correct', async () => {
    const app = createApp({ token: FAKE_TOKEN });
    const res = await request(app)
      .get('/buildbanner.json')
      .set('Authorization', `Bearer ${FAKE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body._buildbanner).toEqual({ version: 1 });
  });

  it('returns 200 when no token configured', async () => {
    const app = createApp();
    const res = await request(app).get('/buildbanner.json');

    expect(res.status).toBe(200);
    expect(res.body._buildbanner).toEqual({ version: 1 });
  });
});

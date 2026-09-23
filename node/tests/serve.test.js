/** Tests for node/tests/helpers/serve.js, the loopback test server for supertest. */
import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { closeLoopbackServers, serveOnLoopback } from './helpers/serve.js';

/** Try to listen on host:port; resolve with the server, or null when the bind fails. */
function tryListen(server, port, host) {
  return new Promise((resolve) => {
    server.once('error', () => resolve(null));
    server.listen(port, host, () => resolve(server));
  });
}

afterEach(closeLoopbackServers);

describe('serveOnLoopback', () => {
  it('binds 127.0.0.1', async () => {
    const server = await serveOnLoopback((_req, res) => res.end('app'));

    expect(server.address().address).toBe('127.0.0.1');
  });

  it('sends the request to the app when another listener tries 127.0.0.1 on its port', async () => {
    const server = await serveOnLoopback((_req, res) => res.end('app'));
    const squatter = http.createServer((_req, res) => {
      res.statusCode = 404;
      res.end('squatter');
    });
    const bound = await tryListen(squatter, server.address().port, '127.0.0.1');

    try {
      const res = await request(server).get('/');

      expect(res.status).toBe(200);
      expect(res.text).toBe('app');
    } finally {
      if (bound) await new Promise((resolve) => bound.close(resolve));
    }
  });
});

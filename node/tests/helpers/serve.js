/** Test servers for supertest, bound to 127.0.0.1. */
import http from 'node:http';

const openServers = new Set();

/**
 * Listen on 127.0.0.1 with an OS-assigned port and resolve with the listening server.
 *
 * Given a handler, supertest listens on the wildcard address and sends the request to
 * 127.0.0.1:<port>. On macOS another process can bind 127.0.0.1 on that same port, and its
 * listener then receives the request. A server bound to 127.0.0.1 gets a port that no other
 * 127.0.0.1 listener holds, and a later bind to it fails with EADDRINUSE.
 */
export function serveOnLoopback(handler) {
  const server = http.createServer(handler);
  openServers.add(server);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

/** Close every server that serveOnLoopback started. */
export async function closeLoopbackServers() {
  const closing = [...openServers].map(
    (server) => new Promise((resolve) => server.close(() => resolve())),
  );
  openServers.clear();
  await Promise.all(closing);
}

/** Test server — Express + BuildBanner middleware serving a minimal HTML page. */
'use strict';

const path = require('path');
const express = require('express');
const { buildBannerMiddleware } = require('../../node/server');

const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

/**
 * Create a test Express server with BuildBanner middleware.
 * @param {object} fixture - JSON data to serve from /buildbanner.json.
 * @param {object} [opts] - Server options.
 * @returns {Promise<{ server, baseUrl, setFixture }>}
 */
async function createServer(fixture, opts = {}) {
  let currentFixture = { ...fixture };
  const app = express();

  app.use('/dist', express.static(CLIENT_DIST));

  if (opts.forceError) {
    app.get('/buildbanner.json', (_req, res) => {
      res.status(500).json({ error: 'Internal Server Error' });
    });
  } else {
    const fakeBanner = _createFakeBanner(() => currentFixture);
    _verifyBannerHook(fakeBanner);
    app.use(buildBannerMiddleware({ _createBanner: () => fakeBanner }));
  }

  app.get('/', (_req, res) => {
    const pollAttr = opts.poll ? ` data-poll="${opts.poll}"` : '';
    const envHideAttr = opts.envHide ? ` data-env-hide="${opts.envHide}"` : '';
    res.type('html').send(_buildHtml(pollAttr, envHideAttr));
  });

  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${port}`,
        setFixture: (f) => { currentFixture = { ...f }; },
      });
    });
  });
}

/** Verify the _createBanner hook produces the expected interface. */
function _verifyBannerHook(banner) {
  if (typeof banner.getBannerData !== 'function') {
    throw new Error('_createBanner hook failed: getBannerData is not a function');
  }
  if (typeof banner.checkAuth !== 'function') {
    throw new Error('_createBanner hook failed: checkAuth is not a function');
  }
}

/** Create a fake banner object that returns dynamic fixture data. */
function _createFakeBanner(getFixture) {
  const serverStarted = new Date().toISOString();
  return {
    getBannerData: () => ({
      _buildbanner: { version: 1 },
      ...getFixture(),
      server_started: serverStarted,
    }),
    checkAuth: () => ({ authorized: true }),
  };
}

/** Close an HTTP server and return a promise. */
async function closeServer(srv) {
  return new Promise((resolve) => srv.close(resolve));
}

/** Build minimal HTML page with BuildBanner script tag. */
function _buildHtml(pollAttr, envHideAttr) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Smoke Test</title></head>
<body>
  <h1>Smoke Test Page</h1>
  <script src="/dist/buildbanner.min.js"${pollAttr}${envHideAttr}></script>
</body>
</html>`;
}

module.exports = { createServer, closeServer };

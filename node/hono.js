/** BuildBanner Hono middleware — serves build info as JSON. */
'use strict';

const { createMiddlewareCore } = require('./lib/middleware-common');

/**
 * Create Hono middleware that serves BuildBanner JSON.
 * @param {object} [options] - Configuration options.
 * @param {string} [options.path] - URL path to serve (default: /buildbanner.json).
 * @param {string} [options.token] - Auth token for endpoint protection.
 * @param {Function} [options.extras] - Callback returning dynamic fields.
 * @param {Function} [options._createBanner] - Override for testing (do not use in production).
 * @returns {Function} Hono middleware (c, next).
 */
function buildBannerHono(options = {}) {
  const { servePath, banner } = createMiddlewareCore(options);

  return async function buildBannerHandler(c, next) {
    if (c.req.method !== 'GET' || new URL(c.req.url).pathname !== servePath) {
      await next();
      return;
    }

    try {
      const authResult = banner.checkAuth(c.req.header('authorization'));
      if (!authResult.authorized) {
        return c.json({ error: 'Unauthorized' }, 401);
      }

      const data = banner.getBannerData();
      c.header('Cache-Control', 'no-store');
      return c.json(data, 200);
    } catch {
      return c.json({ error: 'Internal server error' }, 500);
    }
  };
}

module.exports = { buildBannerHono };

/** BuildBanner Koa middleware — serves build info as JSON. */
'use strict';

const { createMiddlewareCore } = require('./lib/middleware-common');

/**
 * Create Koa middleware that serves BuildBanner JSON.
 * @param {object} [options] - Configuration options.
 * @param {string} [options.path] - URL path to serve (default: /buildbanner.json).
 * @param {string} [options.token] - Auth token for endpoint protection.
 * @param {Function} [options.extras] - Callback returning dynamic fields.
 * @param {Function} [options._createBanner] - Override for testing (do not use in production).
 * @returns {Function} Koa middleware (ctx, next).
 */
function buildBannerKoa(options = {}) {
  const { servePath, banner } = createMiddlewareCore(options);

  return async function buildBannerHandler(ctx, next) {
    if (ctx.method !== 'GET' || ctx.path !== servePath) {
      await next();
      return;
    }

    try {
      const authResult = banner.checkAuth(ctx.headers.authorization);
      if (!authResult.authorized) {
        ctx.status = 401;
        ctx.body = { error: 'Unauthorized' };
        return;
      }

      const data = banner.getBannerData();
      ctx.set('Cache-Control', 'no-store');
      ctx.body = data;
    } catch {
      ctx.status = 500;
      ctx.body = { error: 'Internal server error' };
    }
  };
}

module.exports = { buildBannerKoa };

/** BuildBanner Koa middleware — serves build info as JSON. */
'use strict';

const { createBanner } = require('./lib/core');

const DEFAULT_PATH = '/buildbanner.json';

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
  const servePath = options.path || DEFAULT_PATH;
  const factory = options._createBanner || createBanner;
  const banner = factory({
    token: options.token,
    extras: options.extras,
  });

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
    } catch (err) {
      ctx.throw(500, err.message);
    }
  };
}

module.exports = { buildBannerKoa };

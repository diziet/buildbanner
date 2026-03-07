/** BuildBanner Express middleware — serves build info as JSON. */
'use strict';

const { createBanner } = require('./lib/core');

const DEFAULT_PATH = '/buildbanner.json';

/**
 * Create Express middleware that serves BuildBanner JSON.
 * @param {object} [options] - Configuration options.
 * @param {string} [options.path] - URL path to serve (default: /buildbanner.json).
 * @param {string} [options.token] - Auth token for endpoint protection.
 * @param {Function} [options.extras] - Callback returning dynamic fields.
 * @returns {Function} Express middleware (req, res, next).
 */
function buildBannerMiddleware(options = {}) {
  const servePath = options.path || DEFAULT_PATH;
  const banner = createBanner({
    token: options.token,
    extras: options.extras,
  });

  return function buildBannerHandler(req, res, next) {
    if (req.method !== 'GET' || req.path !== servePath) {
      return next();
    }

    const authResult = banner.checkAuth(req.headers.authorization);
    if (!authResult.authorized) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const data = banner.getBannerData();
    res.set('Cache-Control', 'no-store');
    res.set('Content-Type', 'application/json');
    res.json(data);
  };
}

module.exports = { buildBannerMiddleware };

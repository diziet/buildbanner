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
 * @param {Function} [options._createBanner] - Override for testing (do not use in production).
 * @returns {Function} Express middleware (req, res, next).
 */
function buildBannerMiddleware(options = {}) {
  const servePath = options.path || DEFAULT_PATH;
  const factory = options._createBanner || createBanner;
  const banner = factory({
    token: options.token,
    extras: options.extras,
  });

  return function buildBannerHandler(req, res, next) {
    if (req.method !== 'GET' || req.path !== servePath) {
      return next();
    }

    try {
      const authResult = banner.checkAuth(req.headers.authorization);
      if (!authResult.authorized) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const data = banner.getBannerData();
      res.set('Cache-Control', 'no-store');
      res.json(data);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { buildBannerMiddleware };

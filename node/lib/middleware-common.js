/** Shared middleware setup for BuildBanner framework adapters. */
'use strict';

const { createBanner, DEFAULT_PATH } = require('./core');

/**
 * Parse middleware options and create a banner instance.
 * @param {object} [options] - Middleware configuration options.
 * @returns {{ servePath: string, banner: object }}
 */
function createMiddlewareCore(options = {}) {
  const servePath = options.path || DEFAULT_PATH;
  const factory = options._createBanner || createBanner;
  const banner = factory({
    token: options.token,
    extras: options.extras,
  });

  return { servePath, banner };
}

module.exports = { createMiddlewareCore };

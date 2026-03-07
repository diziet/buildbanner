/** Tests for buildbanner-server package structure and exports. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
);

describe('buildbanner-server packaging', () => {
  it('require("buildbanner-server") works via index.js', async () => {
    const mod = await import('../index.js');
    expect(mod).toBeDefined();
    expect(mod.buildBannerMiddleware).toBeDefined();
  });

  it.each([
    ['../server.js', 'buildBannerMiddleware'],
    ['../koa.js', 'buildBannerKoa'],
    ['../hono.js', 'buildBannerHono'],
  ])('%s exports %s as a function', async (path, exportName) => {
    const mod = await import(path);
    expect(typeof mod[exportName]).toBe('function');
  });

  it('package.json has correct name', () => {
    expect(pkg.name).toBe('buildbanner-server');
  });

  it('package.json has correct exports map', () => {
    expect(pkg.exports).toEqual({
      '.': './index.js',
      './server': './server.js',
      './koa': './koa.js',
      './hono': './hono.js',
    });
  });
});

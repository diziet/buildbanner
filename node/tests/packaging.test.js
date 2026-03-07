/** Tests for buildbanner-server package structure and exports. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('buildbanner-server packaging', () => {
  it('require("buildbanner-server") works via index.js', async () => {
    const mod = await import('../index.js');
    expect(mod).toBeDefined();
    expect(mod.buildBannerMiddleware).toBeDefined();
  });

  it('require("buildbanner-server/server") exports a function', async () => {
    const mod = await import('../server.js');
    expect(typeof mod.buildBannerMiddleware).toBe('function');
  });

  it('require("buildbanner-server/koa") exports a function', async () => {
    const mod = await import('../koa.js');
    expect(typeof mod.buildBannerKoa).toBe('function');
  });

  it('require("buildbanner-server/hono") exports a function', async () => {
    const mod = await import('../hono.js');
    expect(typeof mod.buildBannerHono).toBe('function');
  });

  it('package.json has correct name', () => {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    expect(pkg.name).toBe('buildbanner-server');
  });

  it('package.json has correct exports map', () => {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    expect(pkg.exports).toEqual({
      '.': './index.js',
      './server': './server.js',
      './koa': './koa.js',
      './hono': './hono.js',
    });
  });
});

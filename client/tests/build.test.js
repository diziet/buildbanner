/** Build output validation tests for BuildBanner client. */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const DIST_DIR = resolve(__dirname, "..", "dist");
const MIN_PATH = resolve(DIST_DIR, "buildbanner.min.js");
const SRC_PATH = resolve(__dirname, "..", "buildbanner.js");
const BUDGET_BYTES = 3072;

beforeAll(() => {
  execSync("npm run build", { cwd: resolve(__dirname, "..") });
});

describe("build output", () => {
  it("dist/buildbanner.min.js exists after build", () => {
    expect(existsSync(MIN_PATH)).toBe(true);
  });

  it("file is valid JavaScript (no syntax errors)", () => {
    const code = readFileSync(MIN_PATH, "utf8");
    expect(() => new Function(code)).not.toThrow();
  });

  it("gzipped size is under 3072 bytes", () => {
    const source = readFileSync(MIN_PATH);
    const gzipped = gzipSync(source);
    expect(gzipped.byteLength).toBeLessThan(BUDGET_BYTES);
  });

  it("output is IIFE (contains no import/export statements)", () => {
    const code = readFileSync(MIN_PATH, "utf8");
    expect(code).not.toMatch(/\bimport\s/);
    expect(code).not.toMatch(/\bexport\s/);
  });

  it("source contains no eval() or innerHTML", () => {
    const source = readFileSync(SRC_PATH, "utf8");
    expect(source).not.toMatch(/\beval\s*\(/);
    expect(source).not.toMatch(/\.innerHTML\b/);
  });
});

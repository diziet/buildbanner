/** Build output validation tests for BuildBanner client. */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { BUDGET_BYTES, getGzippedSize } = require("../scripts/size-budget.js");

const DIST_DIR = resolve(import.meta.dirname, "..", "dist");
const MIN_PATH = resolve(DIST_DIR, "buildbanner.min.js");
const SRC_PATH = resolve(import.meta.dirname, "..", "buildbanner.js");

beforeAll(() => {
  execSync("npm run build", { cwd: resolve(import.meta.dirname, "..") });
});

describe("build output", () => {
  it("dist/buildbanner.min.js exists after build", () => {
    expect(existsSync(MIN_PATH)).toBe(true);
  });

  it("file is valid JavaScript (no syntax errors)", () => {
    const code = readFileSync(MIN_PATH, "utf8");
    expect(() => new Function(code)).not.toThrow();
  });

  it("gzipped size is within budget", () => {
    const size = getGzippedSize(MIN_PATH);
    expect(size).toBeLessThanOrEqual(BUDGET_BYTES);
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

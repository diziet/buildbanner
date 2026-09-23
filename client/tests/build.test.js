/** Build output validation tests for BuildBanner client. */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { buildToTempDir, removeBuildDir } from "./build-output.js";

const require = createRequire(import.meta.url);
const { BUDGET_BYTES, getGzippedSize } = require("../scripts/size-budget.js");

const SRC_PATH = resolve(import.meta.dirname, "..", "buildbanner.js");

let outDir;
let MIN_PATH;

beforeAll(() => {
  outDir = buildToTempDir();
  MIN_PATH = resolve(outDir, "buildbanner.min.js");
});

afterAll(() => {
  removeBuildDir(outDir);
});

describe("build output", () => {
  it("buildbanner.min.js exists after build", () => {
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

/** Bundle output validation tests for BuildBanner client. */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { BUDGET_BYTES, getGzippedSize } = require("../scripts/size-budget.js");

const DIST_DIR = resolve(import.meta.dirname, "..", "dist");
const MIN_PATH = resolve(DIST_DIR, "buildbanner.min.js");
const UNMIN_PATH = resolve(DIST_DIR, "buildbanner.js");
const CSS_PATH = resolve(DIST_DIR, "buildbanner.css");

beforeAll(() => {
  execSync("npm run build", { cwd: resolve(import.meta.dirname, "..") });
});

describe("bundle output", () => {
  it("buildbanner.min.js exists and is valid JS", () => {
    expect(existsSync(MIN_PATH)).toBe(true);
    const code = readFileSync(MIN_PATH, "utf8");
    expect(() => new Function(code)).not.toThrow();
  });

  it("buildbanner.js (unminified) exists", () => {
    expect(existsSync(UNMIN_PATH)).toBe(true);
  });

  it("buildbanner.css exists", () => {
    expect(existsSync(CSS_PATH)).toBe(true);
  });

  it("minified file is smaller than unminified", () => {
    const minSize = readFileSync(MIN_PATH).byteLength;
    const unminSize = readFileSync(UNMIN_PATH).byteLength;
    expect(minSize).toBeLessThan(unminSize);
  });

  it("gzipped size is within budget", () => {
    const size = getGzippedSize(MIN_PATH);
    expect(size).toBeLessThanOrEqual(BUDGET_BYTES);
  });

  it("IIFE format (no import/export statements)", () => {
    const code = readFileSync(MIN_PATH, "utf8");
    expect(code).not.toMatch(/\bimport\s/);
    expect(code).not.toMatch(/\bexport\s/);
  });

  it("window.BuildBanner is defined after evaluation", () => {
    const code = readFileSync(MIN_PATH, "utf8");
    const fn = new Function("window", "document", "HTMLElement", code);
    const fakeWindow = {};
    const fakeDoc = {
      readyState: "complete",
      querySelectorAll: () => [],
      addEventListener: () => {},
    };
    const fakeHTMLElement = { prototype: {} };
    fn(fakeWindow, fakeDoc, fakeHTMLElement);
    expect(fakeWindow.BuildBanner).toBeDefined();
  });

  it("BuildBanner.init is a function", () => {
    const code = readFileSync(MIN_PATH, "utf8");
    const fakeWindow = {};
    const fakeDoc = {
      readyState: "complete",
      querySelectorAll: () => [],
      addEventListener: () => {},
    };
    const fn = new Function("window", "document", "HTMLElement", code);
    fn(fakeWindow, fakeDoc, { prototype: {} });
    expect(typeof fakeWindow.BuildBanner.init).toBe("function");
  });

  it("BuildBanner.destroy is a function", () => {
    const code = readFileSync(MIN_PATH, "utf8");
    const fakeWindow = {};
    const fakeDoc = {
      readyState: "complete",
      querySelectorAll: () => [],
      addEventListener: () => {},
    };
    const fn = new Function("window", "document", "HTMLElement", code);
    fn(fakeWindow, fakeDoc, { prototype: {} });
    expect(typeof fakeWindow.BuildBanner.destroy).toBe("function");
  });

  it("BuildBanner.refresh is a function", () => {
    const code = readFileSync(MIN_PATH, "utf8");
    const fakeWindow = {};
    const fakeDoc = {
      readyState: "complete",
      querySelectorAll: () => [],
      addEventListener: () => {},
    };
    const fn = new Function("window", "document", "HTMLElement", code);
    fn(fakeWindow, fakeDoc, { prototype: {} });
    expect(typeof fakeWindow.BuildBanner.refresh).toBe("function");
  });

  it("BuildBanner.update is a function", () => {
    const code = readFileSync(MIN_PATH, "utf8");
    const fakeWindow = {};
    const fakeDoc = {
      readyState: "complete",
      querySelectorAll: () => [],
      addEventListener: () => {},
    };
    const fn = new Function("window", "document", "HTMLElement", code);
    fn(fakeWindow, fakeDoc, { prototype: {} });
    expect(typeof fakeWindow.BuildBanner.update).toBe("function");
  });
});

describe("fallback CSS content", () => {
  it("contains __buildbanner-* rules", () => {
    const css = readFileSync(CSS_PATH, "utf8");
    expect(css).toContain(".__buildbanner-host");
    expect(css).toContain(".__buildbanner-wrapper");
    expect(css).toContain(".__buildbanner-clickable");
  });
});

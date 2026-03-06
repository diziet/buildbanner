/** Tests that the monorepo scaffold has all expected structure. */
import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { resolve } from "path";
import { ROOT, readJson } from "./helpers.js";

describe("monorepo scaffold", () => {
  describe("expected directories exist", () => {
    const dirs = [
      "client",
      "node",
      "python",
      "python/buildbanner",
      "ruby",
      "ruby/lib",
      "shared",
      "tests",
    ];

    for (const dir of dirs) {
      it(`directory ${dir}/ exists`, () => {
        expect(existsSync(resolve(ROOT, dir))).toBe(true);
      });
    }
  });

  describe("expected placeholder files exist", () => {
    const files = [
      "client/buildbanner.js",
      "client/package.json",
      "node/index.js",
      "node/server.js",
      "node/package.json",
      "python/pyproject.toml",
      "python/buildbanner/__init__.py",
      "ruby/buildbanner.gemspec",
      "ruby/Gemfile",
      "ruby/lib/buildbanner.rb",
      "shared/schema.json",
      "shared/test_fixtures.json",
      "LICENSE",
      ".gitignore",
    ];

    for (const file of files) {
      it(`file ${file} exists`, () => {
        expect(existsSync(resolve(ROOT, file))).toBe(true);
      });
    }
  });

  describe("root package.json", () => {
    it("has correct workspaces", () => {
      const pkg = readJson("package.json");
      expect(pkg.name).toBe("buildbanner-monorepo");
      expect(pkg.private).toBe(true);
      expect(pkg.workspaces).toContain("client/");
      expect(pkg.workspaces).toContain("node/");
    });
  });

  describe("client/package.json", () => {
    it("has correct name and main entry", () => {
      const pkg = readJson("client/package.json");
      expect(pkg.name).toBe("buildbanner");
      expect(pkg.main).toBe("buildbanner.js");
    });
  });

  describe("node/package.json", () => {
    const pkg = readJson("node/package.json");

    it("has correct name", () => {
      expect(pkg.name).toBe("buildbanner-server");
    });

    it("has vitest and supertest as devDependencies", () => {
      expect(pkg.devDependencies).toHaveProperty("vitest");
      expect(pkg.devDependencies).toHaveProperty("supertest");
    });
  });
});

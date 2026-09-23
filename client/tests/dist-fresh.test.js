/** The committed dist/ matches a fresh build of the current source. */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DIST_DIR, buildToTempDir, removeBuildDir } from "./build-output.js";

const COMMITTED_FILES = ["buildbanner.js", "buildbanner.min.js", "buildbanner.css"];

let outDir;

beforeAll(() => {
  outDir = buildToTempDir();
});

afterAll(() => {
  removeBuildDir(outDir);
});

describe("committed dist", () => {
  it.each(COMMITTED_FILES)("dist/%s matches a fresh build", (name) => {
    const fresh = readFileSync(join(outDir, name), "utf8");
    const committed = readFileSync(join(DIST_DIR, name), "utf8");
    expect(
      committed === fresh,
      `expected dist/${name} to match a fresh build; run npm run build in client/ and commit dist/`,
    ).toBe(true);
  });
});

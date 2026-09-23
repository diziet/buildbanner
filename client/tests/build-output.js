/** Build the client into a temporary directory, so tests never rewrite the committed dist/. */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const DIST_DIR = resolve(import.meta.dirname, "..", "dist");
const BUILD_SCRIPT = resolve(import.meta.dirname, "..", "scripts", "build.js");

/** Run scripts/build.js into a new temporary directory and return its path. */
export function buildToTempDir() {
  const outDir = mkdtempSync(join(tmpdir(), "buildbanner-build-"));
  execFileSync(process.execPath, [BUILD_SCRIPT, outDir], { stdio: "pipe" });
  return outDir;
}

/** Remove a directory created by buildToTempDir. */
export function removeBuildDir(outDir) {
  rmSync(outDir, { recursive: true, force: true });
}

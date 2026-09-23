/** Build buildbanner.min.js, buildbanner.js and buildbanner.css into dist/ or a given directory. */
// Usage: node scripts/build.js [outDir]. The tests pass a temporary directory, so a test run
// never rewrites the committed dist/.
const { resolve } = require("node:path");
const { buildSync } = require("esbuild");
const { writeFallbackCss } = require("./build-css.js");

const CLIENT_DIR = resolve(__dirname, "..");
const DEFAULT_OUT_DIR = resolve(CLIENT_DIR, "dist");
// absWorkingDir fixes the source paths esbuild writes into the unminified bundle's comments,
// so the output does not depend on the caller's working directory.
const BUNDLE_OPTIONS = {
  absWorkingDir: CLIENT_DIR,
  entryPoints: ["buildbanner.js"],
  bundle: true,
  format: "iife",
  target: "es2017",
  logLevel: "warning",
};

/** Write the minified bundle, the unminified bundle and the fallback CSS into outDir. */
function build(outDir) {
  buildSync({ ...BUNDLE_OPTIONS, outfile: resolve(outDir, "buildbanner.min.js"), minify: true });
  buildSync({ ...BUNDLE_OPTIONS, outfile: resolve(outDir, "buildbanner.js") });
  writeFallbackCss(outDir);
}

module.exports = { build, DEFAULT_OUT_DIR };

if (require.main === module) {
  const outDir = resolve(process.argv[2] || DEFAULT_OUT_DIR);
  build(outDir);
  console.log(`OK: built buildbanner.min.js, buildbanner.js and buildbanner.css in ${outDir}`);
}

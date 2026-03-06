/** Check gzipped size of the minified bundle stays under budget. */
const { readFileSync } = require("node:fs");
const { gzipSync } = require("node:zlib");
const { resolve } = require("node:path");

const BUDGET_BYTES = 3072;
const distPath = resolve(__dirname, "..", "dist", "buildbanner.min.js");

const source = readFileSync(distPath);
const gzipped = gzipSync(source);
const size = gzipped.byteLength;

if (size > BUDGET_BYTES) {
  console.error(
    `ERROR: gzipped size ${size} bytes exceeds budget of ${BUDGET_BYTES} bytes`
  );
  process.exit(1);
}

console.log(`OK: gzipped size ${size} bytes (budget: ${BUDGET_BYTES} bytes)`);

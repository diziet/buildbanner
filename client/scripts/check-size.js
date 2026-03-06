/** Check gzipped size of the minified bundle stays under budget. */
const { resolve } = require("node:path");
const { BUDGET_BYTES, getGzippedSize } = require("./size-budget.js");

const distPath = resolve(__dirname, "..", "dist", "buildbanner.min.js");
const size = getGzippedSize(distPath);

if (size > BUDGET_BYTES) {
  console.error(
    `ERROR: gzipped size ${size} bytes exceeds budget of ${BUDGET_BYTES} bytes`
  );
  process.exit(1);
}

console.log(`OK: gzipped size ${size} bytes (budget: ${BUDGET_BYTES} bytes)`);

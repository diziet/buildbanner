/** The client's gzipped size budget and a helper to measure a file against it. */
const { readFileSync } = require("node:fs");
const { gzipSync } = require("node:zlib");

// Raised from 8000 in Task 50 for the localStorage cache module (bundle then about 8277 bytes).
const BUDGET_BYTES = 8500;

/** Return the gzipped byte size of a file. */
function getGzippedSize(filePath) {
  const source = readFileSync(filePath);
  const gzipped = gzipSync(source);
  return gzipped.byteLength;
}

module.exports = { BUDGET_BYTES, getGzippedSize };

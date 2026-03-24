/** Shared size budget constants and helpers for BuildBanner client. */
const { readFileSync } = require("node:fs");
const { gzipSync } = require("node:zlib");

// Increased from 8000 for localStorage cache module in Task 50 (actual ~8277)
const BUDGET_BYTES = 8500;

/** Return the gzipped byte size of a file. */
function getGzippedSize(filePath) {
  const source = readFileSync(filePath);
  const gzipped = gzipSync(source);
  return gzipped.byteLength;
}

module.exports = { BUDGET_BYTES, getGzippedSize };

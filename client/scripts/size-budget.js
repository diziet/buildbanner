/** Shared size budget constants and helpers for BuildBanner client. */
const { readFileSync } = require("node:fs");
const { gzipSync } = require("node:zlib");

// Increased from 7500 for theme-observer module in Task 48 (actual ~7754)
const BUDGET_BYTES = 8000;

/** Return the gzipped byte size of a file. */
function getGzippedSize(filePath) {
  const source = readFileSync(filePath);
  const gzipped = gzipSync(source);
  return gzipped.byteLength;
}

module.exports = { BUDGET_BYTES, getGzippedSize };

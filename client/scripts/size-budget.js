/** Shared size budget constants and helpers for BuildBanner client. */
const { readFileSync } = require("node:fs");
const { gzipSync } = require("node:zlib");

// Increased from 6800 for SHA color derivation module in Task 44 (actual ~7360)
const BUDGET_BYTES = 7500;

/** Return the gzipped byte size of a file. */
function getGzippedSize(filePath) {
  const source = readFileSync(filePath);
  const gzipped = gzipSync(source);
  return gzipped.byteLength;
}

module.exports = { BUDGET_BYTES, getGzippedSize };

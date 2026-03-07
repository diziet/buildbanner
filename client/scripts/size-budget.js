/** Shared size budget constants and helpers for BuildBanner client. */
const { readFileSync } = require("node:fs");
const { gzipSync } = require("node:zlib");

// Increased from 5632 for push.js module added in Task 17
const BUDGET_BYTES = 6144;

/** Return the gzipped byte size of a file. */
function getGzippedSize(filePath) {
  const source = readFileSync(filePath);
  const gzipped = gzipSync(source);
  return gzipped.byteLength;
}

module.exports = { BUDGET_BYTES, getGzippedSize };

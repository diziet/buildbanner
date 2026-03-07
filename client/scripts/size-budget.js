/** Shared size budget constants and helpers for BuildBanner client. */
const { readFileSync } = require("node:fs");
const { gzipSync } = require("node:zlib");

// Increased from 4096 for links.js module added in Task 12
const BUDGET_BYTES = 4608;

/** Return the gzipped byte size of a file. */
function getGzippedSize(filePath) {
  const source = readFileSync(filePath);
  const gzipped = gzipSync(source);
  return gzipped.byteLength;
}

module.exports = { BUDGET_BYTES, getGzippedSize };

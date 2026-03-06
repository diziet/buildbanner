/** Shared test utilities for BuildBanner test suite. */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

/** Project root directory. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Read and parse a JSON file relative to the project root. */
export function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(ROOT, relativePath), "utf-8"));
}

/** Create a configured Ajv instance with format validation. */
export function createAjv() {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  return ajv;
}

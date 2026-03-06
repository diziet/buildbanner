/** Tests for shared JSON Schema and test fixtures. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const ROOT = resolve(import.meta.dirname, "..");

/** Read and parse a JSON file relative to the project root. */
function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(ROOT, relativePath), "utf-8"));
}

const schema = readJson("shared/schema.json");
const fixtures = readJson("shared/test_fixtures.json");

/** Create a configured Ajv instance with format validation. */
function createValidator() {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

describe("shared/schema.json", () => {
  it("is valid JSON Schema (draft-07)", () => {
    expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#");
    const ajv = new Ajv();
    addFormats(ajv);
    const valid = ajv.validateSchema(schema);
    expect(valid).toBe(true);
  });

  describe("valid_responses fixtures validate against schema", () => {
    const validate = createValidator();

    for (const fixture of fixtures.valid_responses) {
      it(`validates: ${fixture.description}`, () => {
        const result = validate(fixture.payload);
        expect(result).toBe(true);
      });
    }
  });

  it("rejects a response missing sha", () => {
    const validate = createValidator();
    const result = validate({ branch: "main" });
    expect(result).toBe(false);
  });

  it("rejects a response with non-string custom value", () => {
    const validate = createValidator();
    const result = validate({
      sha: "a1b2c3d",
      branch: "main",
      custom: { count: 42 },
    });
    expect(result).toBe(false);
  });

  it("accepts _buildbanner.version as integer only", () => {
    const validate = createValidator();

    const validInt = validate({
      sha: "a1b2c3d",
      branch: "main",
      _buildbanner: { version: 1 },
    });
    expect(validInt).toBe(true);

    const invalidFloat = validate({
      sha: "a1b2c3d",
      branch: "main",
      _buildbanner: { version: 1.5 },
    });
    expect(invalidFloat).toBe(false);

    const invalidString = validate({
      sha: "a1b2c3d",
      branch: "main",
      _buildbanner: { version: "1" },
    });
    expect(invalidString).toBe(false);
  });

  it("accepts port as integer only", () => {
    const validate = createValidator();

    const validInt = validate({
      sha: "a1b2c3d",
      branch: "main",
      port: 8001,
    });
    expect(validInt).toBe(true);

    const invalidString = validate({
      sha: "a1b2c3d",
      branch: "main",
      port: "8001",
    });
    expect(invalidString).toBe(false);

    const invalidFloat = validate({
      sha: "a1b2c3d",
      branch: "main",
      port: 80.5,
    });
    expect(invalidFloat).toBe(false);
  });
});

describe("shared/test_fixtures.json", () => {
  it("is valid JSON with all expected keys", () => {
    expect(fixtures).toHaveProperty("url_sanitization");
    expect(fixtures).toHaveProperty("branch_detection");
    expect(fixtures).toHaveProperty("valid_responses");
    expect(fixtures).toHaveProperty("env_var_mapping");
  });

  it("url_sanitization is an array with expected entries", () => {
    expect(Array.isArray(fixtures.url_sanitization)).toBe(true);
    expect(fixtures.url_sanitization.length).toBe(13);
    for (const entry of fixtures.url_sanitization) {
      expect(entry).toHaveProperty("input");
      expect(entry).toHaveProperty("expected");
    }
  });

  it("branch_detection is an array with expected entries", () => {
    expect(Array.isArray(fixtures.branch_detection)).toBe(true);
    expect(fixtures.branch_detection.length).toBe(4);
    for (const entry of fixtures.branch_detection) {
      expect(entry).toHaveProperty("input");
      expect(entry).toHaveProperty("tag");
      expect(entry).toHaveProperty("expected");
    }
  });

  it("valid_responses is an array of 3 payloads", () => {
    expect(Array.isArray(fixtures.valid_responses)).toBe(true);
    expect(fixtures.valid_responses.length).toBe(3);
    for (const entry of fixtures.valid_responses) {
      expect(entry).toHaveProperty("description");
      expect(entry).toHaveProperty("payload");
    }
  });

  it("env_var_mapping has all expected env vars", () => {
    const mapping = fixtures.env_var_mapping;
    expect(mapping).toHaveProperty("BUILDBANNER_SHA");
    expect(mapping).toHaveProperty("BUILDBANNER_BRANCH");
    expect(mapping).toHaveProperty("BUILDBANNER_REPO_URL");
    expect(mapping).toHaveProperty("BUILDBANNER_COMMIT_DATE");
    expect(mapping).toHaveProperty("BUILDBANNER_DEPLOYED_AT");
    expect(mapping).toHaveProperty("BUILDBANNER_APP_NAME");
    expect(mapping).toHaveProperty("BUILDBANNER_ENVIRONMENT");
    expect(mapping).toHaveProperty("BUILDBANNER_PORT");
    expect(mapping).toHaveProperty("BUILDBANNER_CUSTOM_*");
    expect(mapping).toHaveProperty("BUILDBANNER_TOKEN");
  });
});

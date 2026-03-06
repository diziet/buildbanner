/** Tests for shared JSON Schema and test fixtures. */
import { describe, it, expect } from "vitest";
import { readJson, createAjv } from "./helpers.js";

const schema = readJson("shared/schema.json");
const fixtures = readJson("shared/test_fixtures.json");

const BASE_PAYLOAD = { sha: "a1b2c3d", branch: "main" };

/** Compile the schema into a validator using shared Ajv instance. */
function createValidator() {
  return createAjv().compile(schema);
}

describe("shared/schema.json", () => {
  it("is valid JSON Schema (draft-07)", () => {
    expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#");
    const ajv = createAjv();
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
      ...BASE_PAYLOAD,
      custom: { count: 42 },
    });
    expect(result).toBe(false);
  });

  it("accepts _buildbanner.version as integer only", () => {
    const validate = createValidator();

    const validInt = validate({
      ...BASE_PAYLOAD,
      _buildbanner: { version: 1 },
    });
    expect(validInt).toBe(true);

    const invalidFloat = validate({
      ...BASE_PAYLOAD,
      _buildbanner: { version: 1.5 },
    });
    expect(invalidFloat).toBe(false);

    const invalidString = validate({
      ...BASE_PAYLOAD,
      _buildbanner: { version: "1" },
    });
    expect(invalidString).toBe(false);
  });

  it("accepts port as integer only", () => {
    const validate = createValidator();

    const validInt = validate({
      ...BASE_PAYLOAD,
      port: 8001,
    });
    expect(validInt).toBe(true);

    const invalidString = validate({
      ...BASE_PAYLOAD,
      port: "8001",
    });
    expect(invalidString).toBe(false);

    const invalidFloat = validate({
      ...BASE_PAYLOAD,
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
    expect(mapping).toHaveProperty("BUILDBANNER_SHA_FULL");
    expect(mapping).toHaveProperty("BUILDBANNER_BRANCH");
    expect(mapping).toHaveProperty("BUILDBANNER_REPO_URL");
    expect(mapping).toHaveProperty("BUILDBANNER_COMMIT_DATE");
    expect(mapping).toHaveProperty("BUILDBANNER_DEPLOYED_AT");
    expect(mapping).toHaveProperty("BUILDBANNER_APP_NAME");
    expect(mapping).toHaveProperty("BUILDBANNER_ENVIRONMENT");
    expect(mapping).toHaveProperty("BUILDBANNER_PORT");
    expect(mapping).toHaveProperty("BUILDBANNER_CUSTOM_*");
  });

  it("env_var_mapping entries have consistent structure", () => {
    const mapping = fixtures.env_var_mapping;
    for (const [envVar, entry] of Object.entries(mapping)) {
      expect(entry).toHaveProperty("field");
      expect(typeof entry.field).toBe("string");
      expect(entry).toHaveProperty("description");
      expect(typeof entry.description).toBe("string");
      expect(entry).not.toHaveProperty(
        "fields",
        `${envVar} uses plural "fields" — normalize to singular "field"`,
      );
    }
  });

  it("env_var_mapping field references exist in schema properties", () => {
    const mapping = fixtures.env_var_mapping;
    const schemaProps = Object.keys(schema.properties);

    for (const [envVar, entry] of Object.entries(mapping)) {
      const field = entry.field;
      // custom.* is a wildcard pattern for custom sub-keys — skip exact match
      if (field.startsWith("custom.")) {
        expect(schemaProps).toContain("custom");
        continue;
      }
      expect(schemaProps).toContain(field);
    }
  });
});

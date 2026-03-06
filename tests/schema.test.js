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

  /** Verify a schema field accepts only integer values. */
  function testIntegerOnlyField(fieldName, validPayload, floatPayload, stringPayload) {
    it(`accepts ${fieldName} as integer only`, () => {
      const validate = createValidator();
      expect(validate({ ...BASE_PAYLOAD, ...validPayload })).toBe(true);
      expect(validate({ ...BASE_PAYLOAD, ...floatPayload })).toBe(false);
      expect(validate({ ...BASE_PAYLOAD, ...stringPayload })).toBe(false);
    });
  }

  testIntegerOnlyField(
    "_buildbanner.version",
    { _buildbanner: { version: 1 } },
    { _buildbanner: { version: 1.5 } },
    { _buildbanner: { version: "1" } },
  );

  testIntegerOnlyField(
    "port",
    { port: 8001 },
    { port: 80.5 },
    { port: "8001" },
  );
});

describe("shared/test_fixtures.json", () => {
  /** Assert an array has the expected length and each entry has the required keys. */
  function expectArrayWithShape(array, expectedLength, requiredKeys) {
    expect(Array.isArray(array)).toBe(true);
    expect(array.length).toBe(expectedLength);
    for (const entry of array) {
      for (const key of requiredKeys) {
        expect(entry).toHaveProperty(key);
      }
    }
  }

  it("is valid JSON with all expected keys", () => {
    expect(fixtures).toHaveProperty("url_sanitization");
    expect(fixtures).toHaveProperty("branch_detection");
    expect(fixtures).toHaveProperty("valid_responses");
    expect(fixtures).toHaveProperty("env_var_mapping");
  });

  it("url_sanitization is an array with expected entries", () => {
    expectArrayWithShape(fixtures.url_sanitization, 13, ["input", "expected"]);
  });

  it("branch_detection is an array with expected entries", () => {
    expectArrayWithShape(fixtures.branch_detection, 4, ["input", "tag", "expected"]);
  });

  it("valid_responses is an array of 3 payloads", () => {
    expectArrayWithShape(fixtures.valid_responses, 3, ["description", "payload"]);
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
    expect(mapping).toHaveProperty("BUILDBANNER_TOKEN");
  });

  it("env_var_mapping entries have consistent structure", () => {
    const mapping = fixtures.env_var_mapping;
    for (const [envVar, entry] of Object.entries(mapping)) {
      expect(entry).toHaveProperty("field");
      expect(
        typeof entry.field === "string" || entry.field === null,
      ).toBe(true);
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
      // null field means env var is not mapped to a response field
      if (field === null) {
        continue;
      }
      // custom.* is a wildcard pattern for custom sub-keys — skip exact match
      if (field.startsWith("custom.")) {
        expect(schemaProps).toContain("custom");
        continue;
      }
      expect(schemaProps).toContain(field);
    }
  });
});

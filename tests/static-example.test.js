/** Tests for the static/nginx deployment example. */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync, statSync, unlinkSync } from "fs";
import { execSync } from "child_process";
import { resolve } from "path";
import { ROOT, readJson, createAjv } from "./helpers.js";

const EXAMPLE_DIR = resolve(ROOT, "examples/static-html");
const ENTRYPOINT = resolve(EXAMPLE_DIR, "entrypoint.sh");
const NGINX_CONF = resolve(EXAMPLE_DIR, "nginx.conf");

const TMP_DEFAULT = "/tmp/buildbanner-test.json";
const TMP_CUSTOM = "/tmp/buildbanner-custom-path.json";

/** Run entrypoint.sh with given env vars, return parsed JSON. */
function runEntrypoint(env = {}, outputPath = undefined) {
  const tmpPath = outputPath || TMP_DEFAULT;

  execSync(`${ENTRYPOINT} ${tmpPath}`, {
    env: { ...process.env, ...env, PATH: process.env.PATH },
    stdio: "pipe",
  });

  return JSON.parse(readFileSync(tmpPath, "utf-8"));
}

/** Remove temp files created by tests. */
function cleanupTmpFile(path) {
  try {
    unlinkSync(path);
  } catch {
    /* file may not exist */
  }
}

describe("static-html example", () => {
  afterAll(() => {
    cleanupTmpFile(TMP_DEFAULT);
    cleanupTmpFile(TMP_CUSTOM);
  });

  describe("entrypoint.sh", () => {
    it("exists and is executable", () => {
      expect(existsSync(ENTRYPOINT)).toBe(true);
      const mode = statSync(ENTRYPOINT).mode;
      const isExecutable = (mode & 0o111) !== 0;
      expect(isExecutable).toBe(true);
    });

    describe("generated JSON", () => {
      let json;
      let schema;
      let ajv;

      beforeAll(() => {
        json = runEntrypoint({
          BUILDBANNER_SHA: "a1b2c3d",
          BUILDBANNER_SHA_FULL:
            "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
          BUILDBANNER_BRANCH: "main",
        });
        schema = readJson("shared/schema.json");
        ajv = createAjv();
      });

      it("validates against shared/schema.json", () => {
        const validate = ajv.compile(schema);
        const valid = validate(json);
        expect(valid).toBe(true);
      });

      it("has _buildbanner.version equal to 1", () => {
        expect(json._buildbanner).toBeDefined();
        expect(json._buildbanner.version).toBe(1);
      });

      it("has both sha and sha_full present", () => {
        expect(json.sha).toBe("a1b2c3d");
        expect(json.sha_full).toBe(
          "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
        );
      });

      it("has server_started as ISO 8601 timestamp", () => {
        expect(json.server_started).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
        );
      });
    });

    describe("custom env vars", () => {
      it("BUILDBANNER_CUSTOM_MODEL=test produces custom.model", () => {
        const json = runEntrypoint({
          BUILDBANNER_SHA: "a1b2c3d",
          BUILDBANNER_SHA_FULL:
            "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
          BUILDBANNER_BRANCH: "main",
          BUILDBANNER_CUSTOM_MODEL: "test",
        });
        expect(json.custom).toBeDefined();
        expect(json.custom.model).toBe("test");
      });
    });

    describe("renamed endpoint path", () => {
      it("generates JSON at a custom path", () => {
        const json = runEntrypoint(
          {
            BUILDBANNER_SHA: "b2c3d4e",
            BUILDBANNER_SHA_FULL:
              "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
            BUILDBANNER_BRANCH: "develop",
          },
          TMP_CUSTOM
        );
        expect(json.sha).toBe("b2c3d4e");
        expect(json.branch).toBe("develop");
      });
    });
  });

  describe("nginx.conf", () => {
    let conf;

    beforeAll(() => {
      conf = readFileSync(NGINX_CONF, "utf-8");
    });

    it("includes no-store directive", () => {
      expect(conf).toContain("no-store");
    });

    it("includes application/json content type", () => {
      expect(conf).toContain("application/json");
    });
  });
});

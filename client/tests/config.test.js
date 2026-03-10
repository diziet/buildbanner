/** Tests for client config parsing. */
import { describe, it, expect } from "vitest";
import { parseConfig, resolveConfig, DEFAULT_CONFIG } from "../src/config.js";

/** Create a mock script element with the given data attributes. */
function mockScript(attrs = {}) {
  const store = {};
  for (const [key, value] of Object.entries(attrs)) {
    const attrName = key.startsWith("data-") ? key : `data-${key}`;
    store[attrName] = value;
  }
  return {
    getAttribute(name) {
      return name in store ? store[name] : null;
    },
  };
}

describe("DEFAULT_CONFIG", () => {
  it("has correct default values", () => {
    expect(DEFAULT_CONFIG.endpoint).toBe("/buildbanner.json");
    expect(DEFAULT_CONFIG.position).toBe("top");
    expect(DEFAULT_CONFIG.theme).toBe("dark");
    expect(DEFAULT_CONFIG.dismiss).toBe("session");
    expect(DEFAULT_CONFIG.envHide).toBe(null);
    expect(DEFAULT_CONFIG.height).toBe(28);
    expect(DEFAULT_CONFIG.debug).toBe(false);
    expect(DEFAULT_CONFIG.poll).toBe(0);
    expect(DEFAULT_CONFIG.push).toBe(true);
    expect(DEFAULT_CONFIG.token).toBe(null);
    expect(DEFAULT_CONFIG.manual).toBe(false);
    expect(DEFAULT_CONFIG.zIndex).toBe(999999);
    expect(DEFAULT_CONFIG.hostPatterns).toEqual([]);
    expect(DEFAULT_CONFIG.shaColor).toBe("auto");
  });

  it("is frozen", () => {
    expect(Object.isFrozen(DEFAULT_CONFIG)).toBe(true);
  });
});

describe("parseConfig", () => {
  it("returns defaults when no attributes are set", () => {
    const config = parseConfig(mockScript());
    expect(config.endpoint).toBe("/buildbanner.json");
    expect(config.position).toBe("top");
    expect(config.theme).toBe("dark");
    expect(config.dismiss).toBe("session");
    expect(config.envHide).toBe(null);
    expect(config.height).toBe(28);
    expect(config.debug).toBe(false);
    expect(config.poll).toBe(0);
    expect(config.push).toBe(true);
    expect(config.token).toBe(null);
    expect(config.manual).toBe(false);
  });

  it("returns defaults when script element is null", () => {
    const config = parseConfig(null);
    expect(config).toEqual(expect.objectContaining({
      endpoint: "/buildbanner.json",
      position: "top",
      theme: "dark",
    }));
  });

  it("returns defaults when script element is undefined", () => {
    const config = parseConfig(undefined);
    expect(config.endpoint).toBe("/buildbanner.json");
  });

  it("parses data-endpoint", () => {
    const config = parseConfig(mockScript({ endpoint: "/api/version" }));
    expect(config.endpoint).toBe("/api/version");
  });

  it("parses data-position as valid enum", () => {
    expect(parseConfig(mockScript({ position: "top" })).position).toBe("top");
    expect(parseConfig(mockScript({ position: "bottom" })).position).toBe("bottom");
    expect(parseConfig(mockScript({ position: "left" })).position).toBe("top");
  });

  it("parses data-theme as valid enum", () => {
    expect(parseConfig(mockScript({ theme: "dark" })).theme).toBe("dark");
    expect(parseConfig(mockScript({ theme: "light" })).theme).toBe("light");
    expect(parseConfig(mockScript({ theme: "auto" })).theme).toBe("auto");
    expect(parseConfig(mockScript({ theme: "neon" })).theme).toBe("dark");
  });

  it("parses data-dismiss as valid enum", () => {
    expect(parseConfig(mockScript({ dismiss: "session" })).dismiss).toBe("session");
    expect(parseConfig(mockScript({ dismiss: "permanent" })).dismiss).toBe("permanent");
    expect(parseConfig(mockScript({ dismiss: "none" })).dismiss).toBe("none");
    expect(parseConfig(mockScript({ dismiss: "invalid" })).dismiss).toBe("session");
  });

  it("parses data-height and clamps to min 24", () => {
    expect(parseConfig(mockScript({ height: "10" })).height).toBe(24);
    expect(parseConfig(mockScript({ height: "0" })).height).toBe(24);
    expect(parseConfig(mockScript({ height: "24" })).height).toBe(24);
  });

  it("parses data-height and clamps to max 48", () => {
    expect(parseConfig(mockScript({ height: "100" })).height).toBe(48);
    expect(parseConfig(mockScript({ height: "48" })).height).toBe(48);
    expect(parseConfig(mockScript({ height: "49" })).height).toBe(48);
  });

  it("parses data-height within valid range", () => {
    expect(parseConfig(mockScript({ height: "32" })).height).toBe(32);
    expect(parseConfig(mockScript({ height: "36" })).height).toBe(36);
  });

  it("returns default height for non-numeric value", () => {
    expect(parseConfig(mockScript({ height: "abc" })).height).toBe(28);
  });

  it("parses data-poll as integer", () => {
    expect(parseConfig(mockScript({ poll: "30" })).poll).toBe(30);
    expect(parseConfig(mockScript({ poll: "0" })).poll).toBe(0);
    expect(parseConfig(mockScript({ poll: "60" })).poll).toBe(60);
  });

  it("returns default poll for non-numeric value", () => {
    expect(parseConfig(mockScript({ poll: "abc" })).poll).toBe(0);
  });

  it("returns default poll for negative value", () => {
    expect(parseConfig(mockScript({ poll: "-5" })).poll).toBe(0);
  });

  it("parses data-push 'false' string to boolean false", () => {
    expect(parseConfig(mockScript({ push: "false" })).push).toBe(false);
  });

  it("parses data-push 'true' string to boolean true", () => {
    expect(parseConfig(mockScript({ push: "true" })).push).toBe(true);
  });

  it("parses data-push '0' string to boolean false", () => {
    expect(parseConfig(mockScript({ push: "0" })).push).toBe(false);
  });

  it("parses data-debug as boolean", () => {
    expect(parseConfig(mockScript({ debug: "true" })).debug).toBe(true);
    expect(parseConfig(mockScript({ debug: "false" })).debug).toBe(false);
  });

  it("parses data-manual as boolean", () => {
    expect(parseConfig(mockScript({ manual: "true" })).manual).toBe(true);
    expect(parseConfig(mockScript({ manual: "false" })).manual).toBe(false);
  });

  it("parses data-env-hide and splits on commas", () => {
    const config = parseConfig(mockScript({ "env-hide": "production,staging" }));
    expect(config.envHide).toEqual(["production", "staging"]);
  });

  it("trims whitespace in data-env-hide values", () => {
    const config = parseConfig(mockScript({ "env-hide": " production , staging , test " }));
    expect(config.envHide).toEqual(["production", "staging", "test"]);
  });

  it("returns null for empty data-env-hide", () => {
    expect(parseConfig(mockScript({ "env-hide": "" })).envHide).toBe(null);
  });

  it("parses data-token", () => {
    const config = parseConfig(mockScript({ token: "my-shared-secret" }));
    expect(config.token).toBe("my-shared-secret");
  });

  it("ignores unknown data attributes", () => {
    const el = mockScript({ endpoint: "/api/v1", "unknown-attr": "value" });
    const config = parseConfig(el);
    expect(config.endpoint).toBe("/api/v1");
    expect(config).not.toHaveProperty("unknownAttr");
    expect(config).not.toHaveProperty("unknown-attr");
  });

  it("does not include zIndex from data attributes", () => {
    const config = parseConfig(mockScript());
    expect(config.zIndex).toBe(999999);
  });

  it("does not include hostPatterns from data attributes", () => {
    const config = parseConfig(mockScript());
    expect(config.hostPatterns).toEqual([]);
  });

  it("parses data-sha-color as valid enum", () => {
    expect(parseConfig(mockScript({ "sha-color": "auto" })).shaColor).toBe("auto");
    expect(parseConfig(mockScript({ "sha-color": "off" })).shaColor).toBe("off");
    expect(parseConfig(mockScript({ "sha-color": "invalid" })).shaColor).toBe("auto");
  });

  it("defaults shaColor to auto when not set", () => {
    expect(parseConfig(mockScript()).shaColor).toBe("auto");
  });

  it("returns independent hostPatterns arrays across calls", () => {
    const config1 = parseConfig(mockScript());
    const config2 = parseConfig(null);
    config1.hostPatterns.push("test");
    expect(config2.hostPatterns).toEqual([]);
  });
});

describe("resolveConfig", () => {
  it("returns defaults when both args are empty", () => {
    const config = resolveConfig({}, {});
    expect(config.endpoint).toBe("/buildbanner.json");
    expect(config.position).toBe("top");
    expect(config.zIndex).toBe(999999);
  });

  it("programmatic options override data attributes", () => {
    const dataAttrs = { endpoint: "/from-data", theme: "dark" };
    const programmatic = { endpoint: "/from-programmatic", theme: "light" };
    const config = resolveConfig(dataAttrs, programmatic);
    expect(config.endpoint).toBe("/from-programmatic");
    expect(config.theme).toBe("light");
  });

  it("accepts zIndex programmatically", () => {
    const config = resolveConfig({}, { zIndex: 100 });
    expect(config.zIndex).toBe(100);
  });

  it("accepts hostPatterns programmatically", () => {
    const patterns = [{ host: "git.corp.com", commitPath: "/commit/{sha}", treePath: "/tree/{branch}" }];
    const config = resolveConfig({}, { hostPatterns: patterns });
    expect(config.hostPatterns).toEqual(patterns);
  });

  it("ignores unknown programmatic options", () => {
    const config = resolveConfig({}, { unknownKey: "value", zIndex: 500 });
    expect(config).not.toHaveProperty("unknownKey");
    expect(config.zIndex).toBe(500);
  });

  it("uses data attrs when no programmatic options given", () => {
    const config = resolveConfig({ endpoint: "/custom" }, null);
    expect(config.endpoint).toBe("/custom");
  });

  it("uses data attrs when programmatic is undefined", () => {
    const config = resolveConfig({ poll: 30 }, undefined);
    expect(config.poll).toBe(30);
  });

  it("preserves defaults for missing data attrs", () => {
    const config = resolveConfig({ endpoint: "/custom" }, {});
    expect(config.position).toBe("top");
    expect(config.height).toBe(28);
    expect(config.zIndex).toBe(999999);
  });

  it("falls back to base endpoint for empty string", () => {
    const config = resolveConfig({ endpoint: "/api/v1" }, { endpoint: "" });
    expect(config.endpoint).toBe("/api/v1");
  });

  it("returns independent hostPatterns from resolveConfig", () => {
    const dataAttrs = parseConfig(mockScript());
    const config1 = resolveConfig(dataAttrs, {});
    const config2 = resolveConfig(dataAttrs, {});
    config1.hostPatterns.push("test");
    expect(config2.hostPatterns).toEqual([]);
  });

  it("accepts programmatic zIndex:0", () => {
    const config = resolveConfig({}, { zIndex: 0 });
    expect(config.zIndex).toBe(0);
  });

  it("normalizes invalid programmatic position to default", () => {
    const config = resolveConfig({}, { position: "left" });
    expect(config.position).toBe("top");
  });

  it("normalizes invalid programmatic theme to default", () => {
    const config = resolveConfig({}, { theme: "neon" });
    expect(config.theme).toBe("dark");
  });

  it("normalizes invalid programmatic dismiss to default", () => {
    const config = resolveConfig({}, { dismiss: "invalid" });
    expect(config.dismiss).toBe("session");
  });

  it("clamps programmatic height to valid range", () => {
    expect(resolveConfig({}, { height: 10 }).height).toBe(24);
    expect(resolveConfig({}, { height: 100 }).height).toBe(48);
    expect(resolveConfig({}, { height: 36 }).height).toBe(36);
  });

  it("rejects negative programmatic poll", () => {
    const config = resolveConfig({}, { poll: -5 });
    expect(config.poll).toBe(0);
  });

  it("ignores prototype pollution keys", () => {
    const config = resolveConfig({}, { __proto__: { evil: true }, constructor: "bad", toString: "bad" });
    expect(config).not.toHaveProperty("evil");
    expect(config.constructor).not.toBe("bad");
    expect(config.toString).not.toBe("bad");
  });

  it("envHide mutation does not corrupt other configs", () => {
    const envHide = ["production", "staging"];
    const config1 = resolveConfig({}, { envHide });
    const config2 = resolveConfig({}, { envHide });
    config1.envHide.push("test");
    expect(config2.envHide).toEqual(["production", "staging"]);
    expect(envHide).toEqual(["production", "staging"]);
  });

  it("early-return path produces independent hostPatterns arrays", () => {
    const config1 = resolveConfig({}, null);
    const config2 = resolveConfig({}, undefined);
    config1.hostPatterns.push("test");
    expect(config2.hostPatterns).toEqual([]);
  });

  it("early-return path produces independent envHide arrays", () => {
    const config1 = resolveConfig({ envHide: ["prod"] }, null);
    const config2 = resolveConfig({ envHide: ["prod"] }, null);
    config1.envHide.push("staging");
    expect(config2.envHide).toEqual(["prod"]);
  });
});

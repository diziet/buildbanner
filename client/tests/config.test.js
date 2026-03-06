/** Tests for client config parsing. */

import { describe, it, expect } from "vitest";
import { parseConfig, resolveConfig, DEFAULT_CONFIG } from "../src/config.js";

/** Create a mock script element with given data attributes. */
function mockElement(attrs = {}) {
  const store = {};
  for (const [key, value] of Object.entries(attrs)) {
    store[`data-${key}`] = String(value);
  }
  return {
    getAttribute(name) {
      return store[name] !== undefined ? store[name] : null;
    },
  };
}

describe("DEFAULT_CONFIG", () => {
  it("has correct default values", () => {
    expect(DEFAULT_CONFIG.endpoint).toBe("/buildbanner.json");
    expect(DEFAULT_CONFIG.position).toBe("top");
    expect(DEFAULT_CONFIG.theme).toBe("dark");
    expect(DEFAULT_CONFIG.dismiss).toBe("session");
    expect(DEFAULT_CONFIG.envHide).toBeNull();
    expect(DEFAULT_CONFIG.height).toBe(28);
    expect(DEFAULT_CONFIG.debug).toBe(false);
    expect(DEFAULT_CONFIG.poll).toBe(0);
    expect(DEFAULT_CONFIG.push).toBe(true);
    expect(DEFAULT_CONFIG.token).toBeNull();
    expect(DEFAULT_CONFIG.manual).toBe(false);
    expect(DEFAULT_CONFIG.zIndex).toBe(999999);
    expect(DEFAULT_CONFIG.hostPatterns).toEqual([]);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(DEFAULT_CONFIG)).toBe(true);
  });
});

describe("parseConfig", () => {
  it("returns defaults when no attributes are set", () => {
    const config = parseConfig(mockElement());
    expect(config).toEqual({ ...DEFAULT_CONFIG });
  });

  it("returns defaults when script element is null", () => {
    const config = parseConfig(null);
    expect(config).toEqual({ ...DEFAULT_CONFIG });
  });

  it("returns defaults when script element is undefined", () => {
    const config = parseConfig(undefined);
    expect(config).toEqual({ ...DEFAULT_CONFIG });
  });

  it("returns defaults for object without getAttribute", () => {
    const config = parseConfig({});
    expect(config).toEqual({ ...DEFAULT_CONFIG });
  });

  it("parses data-endpoint", () => {
    const config = parseConfig(mockElement({ endpoint: "/api/version" }));
    expect(config.endpoint).toBe("/api/version");
  });

  it("parses data-position as top", () => {
    const config = parseConfig(mockElement({ position: "top" }));
    expect(config.position).toBe("top");
  });

  it("parses data-position as bottom", () => {
    const config = parseConfig(mockElement({ position: "bottom" }));
    expect(config.position).toBe("bottom");
  });

  it("falls back to default for invalid data-position", () => {
    const config = parseConfig(mockElement({ position: "left" }));
    expect(config.position).toBe("top");
  });

  it("parses data-theme as dark", () => {
    const config = parseConfig(mockElement({ theme: "dark" }));
    expect(config.theme).toBe("dark");
  });

  it("parses data-theme as light", () => {
    const config = parseConfig(mockElement({ theme: "light" }));
    expect(config.theme).toBe("light");
  });

  it("parses data-theme as auto", () => {
    const config = parseConfig(mockElement({ theme: "auto" }));
    expect(config.theme).toBe("auto");
  });

  it("falls back to default for invalid data-theme", () => {
    const config = parseConfig(mockElement({ theme: "neon" }));
    expect(config.theme).toBe("dark");
  });

  it("parses data-dismiss as session", () => {
    const config = parseConfig(mockElement({ dismiss: "session" }));
    expect(config.dismiss).toBe("session");
  });

  it("parses data-dismiss as permanent", () => {
    const config = parseConfig(mockElement({ dismiss: "permanent" }));
    expect(config.dismiss).toBe("permanent");
  });

  it("parses data-dismiss as none", () => {
    const config = parseConfig(mockElement({ dismiss: "none" }));
    expect(config.dismiss).toBe("none");
  });

  it("parses data-height as integer", () => {
    const config = parseConfig(mockElement({ height: "36" }));
    expect(config.height).toBe(36);
  });

  it("clamps data-height to minimum 24", () => {
    const config = parseConfig(mockElement({ height: "10" }));
    expect(config.height).toBe(24);
  });

  it("clamps data-height to maximum 48", () => {
    const config = parseConfig(mockElement({ height: "100" }));
    expect(config.height).toBe(48);
  });

  it("uses default height for non-numeric value", () => {
    const config = parseConfig(mockElement({ height: "abc" }));
    expect(config.height).toBe(28);
  });

  it("parses data-debug as true", () => {
    const config = parseConfig(mockElement({ debug: "true" }));
    expect(config.debug).toBe(true);
  });

  it("parses data-debug as false", () => {
    const config = parseConfig(mockElement({ debug: "false" }));
    expect(config.debug).toBe(false);
  });

  it("parses data-poll as integer", () => {
    const config = parseConfig(mockElement({ poll: "30" }));
    expect(config.poll).toBe(30);
  });

  it("parses data-poll zero as no polling", () => {
    const config = parseConfig(mockElement({ poll: "0" }));
    expect(config.poll).toBe(0);
  });

  it("uses default poll for non-numeric value", () => {
    const config = parseConfig(mockElement({ poll: "abc" }));
    expect(config.poll).toBe(0);
  });

  it("parses data-push true as boolean true", () => {
    const config = parseConfig(mockElement({ push: "true" }));
    expect(config.push).toBe(true);
  });

  it("parses data-push 'false' string as boolean false", () => {
    const config = parseConfig(mockElement({ push: "false" }));
    expect(config.push).toBe(false);
  });

  it("parses data-token", () => {
    const config = parseConfig(mockElement({ token: "my-secret" }));
    expect(config.token).toBe("my-secret");
  });

  it("returns null token when not set", () => {
    const config = parseConfig(mockElement());
    expect(config.token).toBeNull();
  });

  it("parses data-manual as true", () => {
    const config = parseConfig(mockElement({ manual: "true" }));
    expect(config.manual).toBe(true);
  });

  it("parses data-manual as false", () => {
    const config = parseConfig(mockElement({ manual: "false" }));
    expect(config.manual).toBe(false);
  });

  it("parses data-env-hide as comma-separated list", () => {
    const config = parseConfig(mockElement({ "env-hide": "production,staging" }));
    expect(config.envHide).toEqual(["production", "staging"]);
  });

  it("trims whitespace in data-env-hide list", () => {
    const config = parseConfig(mockElement({ "env-hide": " production , staging , test " }));
    expect(config.envHide).toEqual(["production", "staging", "test"]);
  });

  it("returns null envHide when not set", () => {
    const config = parseConfig(mockElement());
    expect(config.envHide).toBeNull();
  });

  it("ignores unknown attributes", () => {
    const config = parseConfig(mockElement({ unknown: "value", foo: "bar" }));
    expect(config).toEqual({ ...DEFAULT_CONFIG });
    expect(config.unknown).toBeUndefined();
    expect(config.foo).toBeUndefined();
  });

  it("does not include zIndex from data attributes", () => {
    const config = parseConfig(mockElement());
    expect(config.zIndex).toBe(999999);
  });

  it("does not include hostPatterns from data attributes", () => {
    const config = parseConfig(mockElement());
    expect(config.hostPatterns).toEqual([]);
  });

  it("returns independent hostPatterns arrays across calls", () => {
    const config1 = parseConfig(mockElement());
    const config2 = parseConfig(mockElement());
    config1.hostPatterns.push("test");
    expect(config2.hostPatterns).toEqual([]);
  });

  it("clamps negative poll to zero", () => {
    const config = parseConfig(mockElement({ poll: "-5" }));
    expect(config.poll).toBe(0);
  });

  it("is case-insensitive for enum values", () => {
    const config = parseConfig(mockElement({ position: "TOP", theme: "DARK", dismiss: "SESSION" }));
    expect(config.position).toBe("top");
    expect(config.theme).toBe("dark");
    expect(config.dismiss).toBe("session");
  });
});

describe("resolveConfig", () => {
  it("returns data attrs when no programmatic options given", () => {
    const dataAttrs = parseConfig(mockElement({ endpoint: "/api/v1" }));
    const resolved = resolveConfig(dataAttrs, {});
    expect(resolved.endpoint).toBe("/api/v1");
  });

  it("programmatic options override data attributes", () => {
    const dataAttrs = parseConfig(mockElement({ endpoint: "/api/v1", theme: "dark" }));
    const resolved = resolveConfig(dataAttrs, { endpoint: "/api/v2", theme: "light" });
    expect(resolved.endpoint).toBe("/api/v2");
    expect(resolved.theme).toBe("light");
  });

  it("accepts zIndex programmatically", () => {
    const dataAttrs = parseConfig(mockElement());
    const resolved = resolveConfig(dataAttrs, { zIndex: 100 });
    expect(resolved.zIndex).toBe(100);
  });

  it("accepts hostPatterns programmatically", () => {
    const patterns = [{ host: "git.example.com", commitPath: "/commit/{sha}", treePath: "/tree/{branch}" }];
    const dataAttrs = parseConfig(mockElement());
    const resolved = resolveConfig(dataAttrs, { hostPatterns: patterns });
    expect(resolved.hostPatterns).toEqual(patterns);
  });

  it("uses defaults when dataAttrs is null", () => {
    const resolved = resolveConfig(null, { endpoint: "/custom" });
    expect(resolved.endpoint).toBe("/custom");
    expect(resolved.position).toBe("top");
  });

  it("uses defaults when programmaticOpts is null", () => {
    const dataAttrs = parseConfig(mockElement({ endpoint: "/api/v1" }));
    const resolved = resolveConfig(dataAttrs, null);
    expect(resolved.endpoint).toBe("/api/v1");
  });

  it("validates programmatic enum values", () => {
    const dataAttrs = parseConfig(mockElement());
    const resolved = resolveConfig(dataAttrs, { position: "invalid", theme: "invalid" });
    expect(resolved.position).toBe("top");
    expect(resolved.theme).toBe("dark");
  });

  it("clamps programmatic height", () => {
    const dataAttrs = parseConfig(mockElement());
    const resolved = resolveConfig(dataAttrs, { height: 100 });
    expect(resolved.height).toBe(48);
  });

  it("converts programmatic push to boolean", () => {
    const dataAttrs = parseConfig(mockElement());
    const resolved = resolveConfig(dataAttrs, { push: false });
    expect(resolved.push).toBe(false);
  });

  it("converts programmatic debug to boolean", () => {
    const dataAttrs = parseConfig(mockElement());
    const resolved = resolveConfig(dataAttrs, { debug: true });
    expect(resolved.debug).toBe(true);
  });

  it("does not mutate the input dataAttrs object", () => {
    const dataAttrs = parseConfig(mockElement());
    const original = { ...dataAttrs };
    resolveConfig(dataAttrs, { endpoint: "/changed" });
    expect(dataAttrs).toEqual(original);
  });

  it("handles programmatic envHide as array", () => {
    const dataAttrs = parseConfig(mockElement());
    const resolved = resolveConfig(dataAttrs, { envHide: ["production", "staging"] });
    expect(resolved.envHide).toEqual(["production", "staging"]);
  });

  it("rejects non-array hostPatterns", () => {
    const dataAttrs = parseConfig(mockElement());
    const resolved = resolveConfig(dataAttrs, { hostPatterns: "invalid" });
    expect(resolved.hostPatterns).toEqual([]);
  });

  it("sets token to null for empty string", () => {
    const dataAttrs = parseConfig(mockElement());
    const resolved = resolveConfig(dataAttrs, { token: "" });
    expect(resolved.token).toBeNull();
  });

  it("clamps programmatic height:0 to HEIGHT_MIN (24)", () => {
    const dataAttrs = parseConfig(mockElement());
    const resolved = resolveConfig(dataAttrs, { height: 0 });
    expect(resolved.height).toBe(24);
  });

  it("accepts programmatic zIndex:0", () => {
    const dataAttrs = parseConfig(mockElement());
    const resolved = resolveConfig(dataAttrs, { zIndex: 0 });
    expect(resolved.zIndex).toBe(0);
  });

  it("clamps negative programmatic poll to zero", () => {
    const dataAttrs = parseConfig(mockElement());
    const resolved = resolveConfig(dataAttrs, { poll: -10 });
    expect(resolved.poll).toBe(0);
  });
});

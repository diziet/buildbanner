/** Tests for env-hide module. */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { shouldHide } from "../src/env-hide.js";
import { mockResponse } from "./helpers.js";

describe("shouldHide", () => {
  it("returns true when environment matches an entry in the list", () => {
    expect(shouldHide(["production"], "production")).toBe(true);
  });

  it("returns false when environment does not match any entry", () => {
    expect(shouldHide(["production"], "staging")).toBe(false);
  });

  it("matches case-insensitively", () => {
    expect(shouldHide(["production"], "Production")).toBe(true);
    expect(shouldHide(["Production"], "production")).toBe(true);
    expect(shouldHide(["PRODUCTION"], "production")).toBe(true);
  });

  it("checks multiple environments in the list", () => {
    const list = ["production", "staging"];
    expect(shouldHide(list, "production")).toBe(true);
    expect(shouldHide(list, "staging")).toBe(true);
    expect(shouldHide(list, "development")).toBe(false);
  });

  it("returns false when environment is not in response (undefined)", () => {
    expect(shouldHide(["production"], undefined)).toBe(false);
  });

  it("returns false when environment is not in response (null)", () => {
    expect(shouldHide(["production"], null)).toBe(false);
  });

  it("returns false when envHideList is null", () => {
    expect(shouldHide(null, "production")).toBe(false);
  });

  it("returns false when envHideList is an empty array", () => {
    expect(shouldHide([], "production")).toBe(false);
  });

  it("returns false when envHideList is a plain string instead of array", () => {
    expect(shouldHide("production", "production")).toBe(false);
  });
});

describe("env-hide integration", () => {
  let BuildBanner;
  let mockFetch;

  beforeEach(async () => {
    document.body.innerHTML = "";
    document.head.querySelectorAll("style").forEach((s) => s.remove());
    window[Symbol.for("buildbanner")] = null;

    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    vi.resetModules();
    const mod = await import("../src/main.js");
    BuildBanner = mod.default;
  });

  afterEach(() => {
    try {
      BuildBanner.destroy();
    } catch {
      /* ignore */
    }
    window[Symbol.for("buildbanner")] = null;
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("hides banner when env-hide matches response environment", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const payload = { sha: "a1b2c3d", branch: "main", environment: "production" };
    mockFetch.mockResolvedValue(mockResponse(payload));

    await BuildBanner.init({
      endpoint: "/buildbanner.json",
      envHide: ["production"],
    });

    const host = document.querySelector("[data-testid='buildbanner']");
    expect(host).toBeNull();
  });

  it("shows banner when env-hide does not match response environment", async () => {
    const payload = { sha: "a1b2c3d", branch: "main", environment: "staging" };
    mockFetch.mockResolvedValue(mockResponse(payload));

    await BuildBanner.init({
      endpoint: "/buildbanner.json",
      envHide: ["production"],
    });

    const host = document.querySelector("[data-testid='buildbanner']");
    expect(host).not.toBeNull();
  });

  it("shows banner when no envHide configured", async () => {
    const payload = { sha: "a1b2c3d", branch: "main", environment: "production" };
    mockFetch.mockResolvedValue(mockResponse(payload));

    await BuildBanner.init({ endpoint: "/buildbanner.json" });

    const host = document.querySelector("[data-testid='buildbanner']");
    expect(host).not.toBeNull();
  });

  it("logs debug message when banner is hidden by env-hide", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const payload = { sha: "a1b2c3d", branch: "main", environment: "production" };
    mockFetch.mockResolvedValue(mockResponse(payload));

    await BuildBanner.init({
      endpoint: "/buildbanner.json",
      envHide: ["production"],
    });

    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining("Banner hidden"),
    );
    debugSpy.mockRestore();
  });

  it("logs debug message when envHide configured but environment missing from response", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const payload = { sha: "a1b2c3d", branch: "main" };
    mockFetch.mockResolvedValue(mockResponse(payload));

    await BuildBanner.init({
      endpoint: "/buildbanner.json",
      envHide: ["production"],
    });

    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining("no environment field"),
    );
    debugSpy.mockRestore();
  });
});

/** Tests for cache module. */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("cache module", () => {
  let readCache;
  let writeCache;

  beforeEach(async () => {
    localStorage.clear();
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-24T12:00:00Z"));
    const mod = await import("../src/cache.js");
    readCache = mod.readCache;
    writeCache = mod.writeCache;
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("returns null when no cache exists", () => {
    expect(readCache("/buildbanner.json")).toBeNull();
  });

  it("writes and reads cache entry", () => {
    const data = { sha: "a1b2c3d", branch: "main" };
    writeCache("/buildbanner.json", data, "dark");

    const entry = readCache("/buildbanner.json");
    expect(entry).not.toBeNull();
    expect(entry.endpoint).toBe("/buildbanner.json");
    expect(entry.sha).toBe("a1b2c3d");
    expect(entry.data).toEqual(data);
    expect(entry.theme).toBe("dark");
    expect(entry.timestamp).toBe(Date.now());
  });

  it("isolates cache by endpoint URL", () => {
    writeCache("/app1/buildbanner.json", { sha: "aaa" }, "dark");
    writeCache("/app2/buildbanner.json", { sha: "bbb" }, "light");

    const entry1 = readCache("/app1/buildbanner.json");
    const entry2 = readCache("/app2/buildbanner.json");
    expect(entry1.sha).toBe("aaa");
    expect(entry2.sha).toBe("bbb");
  });

  it("returns null for expired cache (24 hours)", () => {
    writeCache("/buildbanner.json", { sha: "abc" }, "dark");
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);

    expect(readCache("/buildbanner.json")).toBeNull();
  });

  it("returns valid cache within 24 hours", () => {
    writeCache("/buildbanner.json", { sha: "abc" }, "dark");
    vi.advanceTimersByTime(23 * 60 * 60 * 1000);

    expect(readCache("/buildbanner.json")).not.toBeNull();
  });

  it("returns null for corrupt JSON in localStorage", () => {
    localStorage.setItem("buildbanner_cache:/buildbanner.json", "not-json{{{");
    expect(readCache("/buildbanner.json")).toBeNull();
  });

  it("returns null for entry with wrong endpoint", () => {
    const entry = {
      endpoint: "/other.json",
      sha: "abc",
      data: { sha: "abc" },
      theme: "dark",
      timestamp: Date.now(),
    };
    localStorage.setItem("buildbanner_cache:/buildbanner.json", JSON.stringify(entry));
    expect(readCache("/buildbanner.json")).toBeNull();
  });

  it("returns null for entry missing sha", () => {
    const entry = {
      endpoint: "/buildbanner.json",
      data: { branch: "main" },
      theme: "dark",
      timestamp: Date.now(),
    };
    localStorage.setItem("buildbanner_cache:/buildbanner.json", JSON.stringify(entry));
    expect(readCache("/buildbanner.json")).toBeNull();
  });

  it("returns null for entry with non-object data", () => {
    const entry = {
      endpoint: "/buildbanner.json",
      sha: "abc",
      data: "string-not-object",
      theme: "dark",
      timestamp: Date.now(),
    };
    localStorage.setItem("buildbanner_cache:/buildbanner.json", JSON.stringify(entry));
    expect(readCache("/buildbanner.json")).toBeNull();
  });

  it("returns null for entry with future timestamp", () => {
    const entry = {
      endpoint: "/buildbanner.json",
      sha: "abc",
      data: { sha: "abc" },
      theme: "dark",
      timestamp: Date.now() + 100000,
    };
    localStorage.setItem("buildbanner_cache:/buildbanner.json", JSON.stringify(entry));
    expect(readCache("/buildbanner.json")).toBeNull();
  });

  it("handles data without sha by storing empty string", () => {
    writeCache("/buildbanner.json", { branch: "main" }, "dark");
    const entry = readCache("/buildbanner.json");
    expect(entry.sha).toBe("");
  });

  it("degrades gracefully when localStorage throws", () => {
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = () => { throw new Error("QuotaExceeded"); };

    // Should not throw
    expect(() => writeCache("/buildbanner.json", { sha: "abc" }, "dark")).not.toThrow();
    localStorage.setItem = originalSetItem;
  });

  it("readCache degrades when localStorage.getItem throws", () => {
    const originalGetItem = localStorage.getItem;
    localStorage.getItem = () => { throw new Error("SecurityError"); };

    expect(readCache("/buildbanner.json")).toBeNull();
    localStorage.getItem = originalGetItem;
  });
});

/** Tests for token auth client-side guardrails. */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkTokenWarnings } from "../src/token-warnings.js";

describe("checkTokenWarnings", () => {
  let warnSpy;
  const originalLocation = window.location;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  /** Helper to stub window.location with given protocol and hostname. */
  function stubLocation(protocol, hostname) {
    Object.defineProperty(window, "location", {
      value: { protocol, hostname },
      writable: true,
      configurable: true,
    });
  }

  it("short token (< 16 chars) triggers console.warn", () => {
    stubLocation("http:", "localhost");
    checkTokenWarnings({ token: "abc123" });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("shorter than 16 characters"),
    );
  });

  it("long token (>= 16 chars) does not trigger short-token warning", () => {
    stubLocation("http:", "localhost");
    checkTokenWarnings({ token: "abcdefghijklmnop" });

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("shorter than 16 characters"),
    );
  });

  it("HTTPS public hostname with token triggers public warning", () => {
    stubLocation("https:", "myapp.example.com");
    checkTokenWarnings({ token: "abcdefghijklmnopqrstuvwxyz" });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("public-facing origin"),
    );
  });

  it("localhost does not trigger public warning", () => {
    stubLocation("https:", "localhost");
    checkTokenWarnings({ token: "abcdefghijklmnopqrstuvwxyz" });

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("public-facing origin"),
    );
  });

  it("127.0.0.1 does not trigger public warning", () => {
    stubLocation("https:", "127.0.0.1");
    checkTokenWarnings({ token: "abcdefghijklmnopqrstuvwxyz" });

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("public-facing origin"),
    );
  });

  it("myapp.local does not trigger public warning", () => {
    stubLocation("https:", "myapp.local");
    checkTokenWarnings({ token: "abcdefghijklmnopqrstuvwxyz" });

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("public-facing origin"),
    );
  });

  it("staging.internal does not trigger public warning", () => {
    stubLocation("https:", "staging.internal");
    checkTokenWarnings({ token: "abcdefghijklmnopqrstuvwxyz" });

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("public-facing origin"),
    );
  });

  it("foo.test does not trigger public warning", () => {
    stubLocation("https:", "foo.test");
    checkTokenWarnings({ token: "abcdefghijklmnopqrstuvwxyz" });

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("public-facing origin"),
    );
  });

  it("HTTP on public hostname does not trigger public warning", () => {
    stubLocation("http:", "myapp.example.com");
    checkTokenWarnings({ token: "abcdefghijklmnopqrstuvwxyz" });

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("public-facing origin"),
    );
  });

  it("no token set triggers no warnings", () => {
    stubLocation("https:", "myapp.example.com");
    checkTokenWarnings({ token: null });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("both warnings fire simultaneously when applicable", () => {
    stubLocation("https:", "myapp.example.com");
    checkTokenWarnings({ token: "short" });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("shorter than 16 characters"),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("public-facing origin"),
    );
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it("warnings are called via console.warn not through the logger", () => {
    stubLocation("https:", "myapp.example.com");
    checkTokenWarnings({ token: "short" });

    // Verify console.warn was called directly (our spy is on console.warn)
    expect(warnSpy).toHaveBeenCalledTimes(2);
    // The function does not accept or use a logger parameter
    expect(checkTokenWarnings.length).toBe(1);
  });
});

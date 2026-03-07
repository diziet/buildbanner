/** Tests for token auth client-side guardrails. */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkTokenWarnings } from "../src/token-warnings.js";

const VALID_TOKEN = "abcdefghijklmnopqrstuvwxyz";
const SHORT_TOKEN_MSG = "shorter than 16 characters";
const PUBLIC_ORIGIN_MSG = "public-facing origin";

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
      expect.stringContaining(SHORT_TOKEN_MSG),
    );
  });

  it("empty-string token triggers short-token warning", () => {
    stubLocation("http:", "localhost");
    checkTokenWarnings({ token: "" });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(SHORT_TOKEN_MSG),
    );
  });

  it("long token (>= 16 chars) does not trigger short-token warning", () => {
    stubLocation("http:", "localhost");
    checkTokenWarnings({ token: "abcdefghijklmnop" });

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining(SHORT_TOKEN_MSG),
    );
  });

  it("HTTPS public hostname with token triggers public warning", () => {
    stubLocation("https:", "myapp.example.com");
    checkTokenWarnings({ token: VALID_TOKEN });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(PUBLIC_ORIGIN_MSG),
    );
  });

  it.each([
    "localhost",
    "127.0.0.1",
    "[::1]",
    "myapp.local",
    "staging.internal",
    "foo.test",
    "10.0.1.5",
    "192.168.1.100",
    "172.16.0.1",
    "172.31.255.254",
  ])("%s does not trigger public warning", (hostname) => {
    stubLocation("https:", hostname);
    checkTokenWarnings({ token: VALID_TOKEN });

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining(PUBLIC_ORIGIN_MSG),
    );
  });

  it("HTTP on public hostname does not trigger public warning", () => {
    stubLocation("http:", "myapp.example.com");
    checkTokenWarnings({ token: VALID_TOKEN });

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining(PUBLIC_ORIGIN_MSG),
    );
  });

  it("no token set triggers no warnings", () => {
    stubLocation("https:", "myapp.example.com");
    checkTokenWarnings({ token: null });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("undefined token triggers no warnings", () => {
    stubLocation("https:", "myapp.example.com");
    checkTokenWarnings({ token: undefined });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("both warnings fire simultaneously when applicable", () => {
    stubLocation("https:", "myapp.example.com");
    checkTokenWarnings({ token: "short" });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(SHORT_TOKEN_MSG),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(PUBLIC_ORIGIN_MSG),
    );
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it("warnings are called via console.warn not through the logger", () => {
    stubLocation("https:", "myapp.example.com");
    checkTokenWarnings({ token: "short" });

    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(checkTokenWarnings.length).toBe(1);
  });

  it("never throws even if window.location access fails", () => {
    Object.defineProperty(window, "location", {
      get() { throw new Error("no location"); },
      configurable: true,
    });

    expect(() => checkTokenWarnings({ token: VALID_TOKEN })).not.toThrow();
  });
});

/** Tests for the main entry point. */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockResponse } from "./helpers.js";

describe("BuildBanner main", () => {
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

  it("manual init() renders banner with sha and branch segments", async () => {
    const payload = { sha: "a1b2c3d", branch: "main" };
    mockFetch.mockResolvedValue(mockResponse(payload));

    await BuildBanner.init({ endpoint: "/buildbanner.json" });

    const host = document.querySelector("[data-testid='buildbanner']");
    expect(host).not.toBeNull();

    const shadow = host.shadowRoot;
    const shaSegment = shadow.querySelector("[data-segment='sha']");
    const branchSegment = shadow.querySelector("[data-segment='branch']");
    expect(shaSegment.textContent).toBe("a1b2c3d");
    expect(branchSegment.textContent).toBe("main");
  });

  it("auto-init on DOMContentLoaded renders banner with segments", async () => {
    vi.resetModules();

    const payload = { sha: "abc1234", branch: "develop" };
    mockFetch.mockResolvedValue(mockResponse(payload));

    const script = document.createElement("script");
    script.src = "https://cdn.example.com/buildbanner.js";
    document.body.appendChild(script);

    Object.defineProperty(document, "readyState", {
      value: "loading",
      writable: true,
      configurable: true,
    });

    await import("../src/main.js");

    const event = new Event("DOMContentLoaded");
    document.dispatchEvent(event);

    await vi.waitFor(() => {
      const host = document.querySelector("[data-testid='buildbanner']");
      expect(host).not.toBeNull();
    });

    Object.defineProperty(document, "readyState", {
      value: "complete",
      writable: true,
      configurable: true,
    });
  });

  it("data-manual prevents auto-init", async () => {
    vi.resetModules();

    mockFetch.mockResolvedValue(mockResponse({ sha: "abc" }));

    const script = document.createElement("script");
    script.src = "https://cdn.example.com/buildbanner.js";
    script.dataset.manual = "";
    document.body.appendChild(script);

    Object.defineProperty(document, "readyState", {
      value: "interactive",
      writable: true,
      configurable: true,
    });

    await import("../src/main.js");

    await new Promise((r) => setTimeout(r, 50));

    const host = document.querySelector("[data-testid='buildbanner']");
    expect(host).toBeNull();

    Object.defineProperty(document, "readyState", {
      value: "complete",
      writable: true,
      configurable: true,
    });
  });

  it("singleton guard blocks second init with console.debug message", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    mockFetch.mockResolvedValue(mockResponse({ sha: "abc", branch: "main" }));

    await BuildBanner.init({ endpoint: "/test.json" });
    await BuildBanner.init({ endpoint: "/test.json" });

    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining("Already initialized"),
    );
    debugSpy.mockRestore();
  });

  it("concurrent init() calls are blocked by pending guard", async () => {
    let resolveFirst;
    mockFetch.mockImplementationOnce(() => {
      return new Promise((resolve) => {
        resolveFirst = resolve;
      });
    });

    const firstInit = BuildBanner.init({ endpoint: "/test.json" });

    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const secondInit = BuildBanner.init({ endpoint: "/test.json" });
    await secondInit;

    resolveFirst(mockResponse({ sha: "abc", branch: "main" }));
    await firstInit;

    const hosts = document.querySelectorAll("[data-testid='buildbanner']");
    expect(hosts.length).toBe(1);
    debugSpy.mockRestore();
  });

  it("destroy() removes banner DOM", async () => {
    mockFetch.mockResolvedValue(mockResponse({ sha: "abc", branch: "main" }));

    await BuildBanner.init({ endpoint: "/test.json" });
    expect(document.querySelector("[data-testid='buildbanner']")).not.toBeNull();

    BuildBanner.destroy();
    expect(document.querySelector("[data-testid='buildbanner']")).toBeNull();
  });

  it("isVisible() returns true when rendered and false after destroy", async () => {
    mockFetch.mockResolvedValue(mockResponse({ sha: "abc", branch: "main" }));

    await BuildBanner.init({ endpoint: "/test.json" });
    expect(BuildBanner.isVisible()).toBe(true);

    BuildBanner.destroy();
    expect(BuildBanner.isVisible()).toBe(false);
  });

  it("non-200 endpoint produces no banner and no error thrown", async () => {
    mockFetch.mockResolvedValue(mockResponse(null, { status: 500 }));

    await BuildBanner.init({ endpoint: "/test.json" });

    const host = document.querySelector("[data-testid='buildbanner']");
    expect(host).toBeNull();
  });

  it("timeout produces no banner", async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation((_url, opts) => {
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    const promise = BuildBanner.init({ endpoint: "/test.json" });
    vi.advanceTimersByTime(3000);
    await promise;

    const host = document.querySelector("[data-testid='buildbanner']");
    expect(host).toBeNull();
    vi.useRealTimers();
  });

  it("singleton uses only Symbol.for('buildbanner')", async () => {
    mockFetch.mockResolvedValue(mockResponse({ sha: "abc", branch: "main" }));

    await BuildBanner.init({ endpoint: "/test.json" });
    const instance = window[Symbol.for("buildbanner")];
    expect(instance).not.toBeNull();
    expect(instance.destroyed).toBe(false);
    expect(window.__buildBannerInstance).toBeUndefined();
  });
});

/** Tests for the main entry point. */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockResponse } from "./helpers.js";
import { writeCache } from "../src/cache.js";

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

  it("placeholder bar exists in DOM before fetch resolves", async () => {
    let resolveFetch;
    mockFetch.mockImplementation(() => new Promise((resolve) => {
      resolveFetch = resolve;
    }));

    const initPromise = BuildBanner.init({ endpoint: "/test.json" });

    // Placeholder should be in DOM before fetch resolves
    await vi.waitFor(() => {
      const host = document.querySelector("[data-testid='buildbanner']");
      expect(host).not.toBeNull();
    });

    const host = document.querySelector("[data-testid='buildbanner']");
    const shadow = host.shadowRoot;
    const wrapper = shadow.querySelector(".bb-wrapper");

    // Wrapper should exist but have no segment content yet
    expect(wrapper).not.toBeNull();
    expect(wrapper.querySelector("[data-segment]")).toBeNull();

    // Resolve fetch and let init complete
    resolveFetch(mockResponse({ sha: "abc1234", branch: "main" }));
    await initPromise;

    // After fetch, segments should be populated
    expect(shadow.querySelector("[data-segment='sha']").textContent).toBe("abc1234");
  });

  it("non-200 endpoint removes placeholder and produces no banner", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    mockFetch.mockResolvedValue(mockResponse(null, { status: 500 }));

    await BuildBanner.init({ endpoint: "/test.json" });

    const host = document.querySelector("[data-testid='buildbanner']");
    expect(host).toBeNull();
  });

  it("timeout removes placeholder and produces no banner", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
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

  it("re-init after destroy creates a new banner", async () => {
    mockFetch.mockResolvedValue(mockResponse({ sha: "abc", branch: "main" }));

    await BuildBanner.init({ endpoint: "/test.json" });
    expect(BuildBanner.isVisible()).toBe(true);

    BuildBanner.destroy();
    expect(BuildBanner.isVisible()).toBe(false);

    mockFetch.mockResolvedValue(mockResponse({ sha: "def", branch: "dev" }));
    await BuildBanner.init({ endpoint: "/test.json" });
    expect(BuildBanner.isVisible()).toBe(true);

    const host = document.querySelector("[data-testid='buildbanner']");
    const sha = host.shadowRoot.querySelector("[data-segment='sha']");
    expect(sha.textContent).toBe("def");
  });
});

describe("BuildBanner parse-time cache rendering", () => {
  let mockFetch;

  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.querySelectorAll("style").forEach((s) => s.remove());
    window[Symbol.for("buildbanner")] = null;
    localStorage.clear();
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    try {
      window.BuildBanner?.destroy?.();
    } catch { /* ignore */ }
    window[Symbol.for("buildbanner")] = null;
    localStorage.clear();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("warm cache + body available: renders synchronously at parse time", async () => {
    vi.resetModules();
    const endpoint = "/buildbanner.json";
    const cachedData = { sha: "cached1", branch: "main" };

    writeCache(endpoint, cachedData, "system");
    mockFetch.mockResolvedValue(mockResponse(cachedData));

    const script = document.createElement("script");
    script.src = "https://cdn.example.com/buildbanner.js";
    script.setAttribute("data-endpoint", endpoint);
    script.setAttribute("data-cache", "true");
    document.body.appendChild(script);

    Object.defineProperty(document, "readyState", {
      value: "loading",
      writable: true,
      configurable: true,
    });

    // Import triggers auto-init synchronously when cache is warm
    await import("../src/main.js");

    // Banner should render without waiting for DOMContentLoaded
    await vi.waitFor(() => {
      const host = document.querySelector("[data-testid='buildbanner']");
      expect(host).not.toBeNull();
      const sha = host.shadowRoot.querySelector("[data-segment='sha']");
      expect(sha.textContent).toBe("cached1");
    });

    Object.defineProperty(document, "readyState", {
      value: "complete",
      writable: true,
      configurable: true,
    });
  });

  it("warm cache + no body: falls back to DOMContentLoaded", async () => {
    vi.resetModules();
    const endpoint = "/buildbanner.json";
    writeCache(endpoint, { sha: "abc", branch: "main" }, "system");
    mockFetch.mockResolvedValue(mockResponse({ sha: "abc", branch: "main" }));

    const script = document.createElement("script");
    script.src = "https://cdn.example.com/buildbanner.js";
    script.setAttribute("data-endpoint", endpoint);
    script.setAttribute("data-cache", "true");
    document.body.appendChild(script);

    // Simulate no body
    const originalBody = document.body;
    Object.defineProperty(document, "body", {
      value: null,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(document, "readyState", {
      value: "loading",
      writable: true,
      configurable: true,
    });

    await import("../src/main.js");

    // No banner yet — waiting for DOMContentLoaded
    expect(document.querySelector("[data-testid='buildbanner']")).toBeNull();

    // Restore body and fire DOMContentLoaded
    Object.defineProperty(document, "body", {
      value: originalBody,
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event("DOMContentLoaded"));

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

  it("no cache: falls back to DOMContentLoaded", async () => {
    vi.resetModules();
    mockFetch.mockResolvedValue(mockResponse({ sha: "abc", branch: "main" }));

    const script = document.createElement("script");
    script.src = "https://cdn.example.com/buildbanner.js";
    script.setAttribute("data-endpoint", "/buildbanner.json");
    document.body.appendChild(script);

    Object.defineProperty(document, "readyState", {
      value: "loading",
      writable: true,
      configurable: true,
    });

    await import("../src/main.js");

    // No banner yet — no cache, waiting for DOMContentLoaded
    expect(document.querySelector("[data-testid='buildbanner']")).toBeNull();

    document.dispatchEvent(new Event("DOMContentLoaded"));

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

  it("data-cache='false': falls back to DOMContentLoaded", async () => {
    vi.resetModules();
    const endpoint = "/buildbanner.json";
    writeCache(endpoint, { sha: "abc", branch: "main" }, "system");
    mockFetch.mockResolvedValue(mockResponse({ sha: "abc", branch: "main" }));

    const script = document.createElement("script");
    script.src = "https://cdn.example.com/buildbanner.js";
    script.setAttribute("data-endpoint", endpoint);
    script.setAttribute("data-cache", "false");
    document.body.appendChild(script);

    Object.defineProperty(document, "readyState", {
      value: "loading",
      writable: true,
      configurable: true,
    });

    await import("../src/main.js");

    // No banner yet — cache disabled, waiting for DOMContentLoaded
    expect(document.querySelector("[data-testid='buildbanner']")).toBeNull();

    document.dispatchEvent(new Event("DOMContentLoaded"));

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

  it("warm cache: background refresh updates banner if data changed", async () => {
    vi.resetModules();
    const endpoint = "/buildbanner.json";
    const cachedData = { sha: "old1234", branch: "main" };
    const freshData = { sha: "new5678", branch: "main", server_started: "2026-03-24T13:00:00Z" };

    writeCache(endpoint, cachedData, "system");
    mockFetch.mockResolvedValue(mockResponse(freshData));

    const script = document.createElement("script");
    script.src = "https://cdn.example.com/buildbanner.js";
    script.setAttribute("data-endpoint", endpoint);
    script.setAttribute("data-cache", "true");
    document.body.appendChild(script);

    Object.defineProperty(document, "readyState", {
      value: "loading",
      writable: true,
      configurable: true,
    });

    await import("../src/main.js");

    // Wait for background refresh to update the banner
    await vi.waitFor(() => {
      const host = document.querySelector("[data-testid='buildbanner']");
      expect(host).not.toBeNull();
      const sha = host.shadowRoot.querySelector("[data-segment='sha']");
      expect(sha.textContent).toBe("new5678");
    });

    Object.defineProperty(document, "readyState", {
      value: "complete",
      writable: true,
      configurable: true,
    });
  });
});

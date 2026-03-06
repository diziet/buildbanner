/** Tests for the fetch module. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchBannerData } from "../src/fetch.js";

describe("fetchBannerData", () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** Helper to create a mock Response. */
  function mockResponse(body, { status = 200, contentType = "application/json" } = {}) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (name) => (name.toLowerCase() === "content-type" ? contentType : null),
      },
      json: () => Promise.resolve(body),
    };
  }

  it("successful fetch returns parsed data", async () => {
    const payload = { sha: "a1b2c3d", branch: "main" };
    mockFetch.mockResolvedValue(mockResponse(payload));

    const result = await fetchBannerData("/buildbanner.json");
    expect(result).toEqual(payload);
  });

  it("404 returns null", async () => {
    mockFetch.mockResolvedValue(mockResponse(null, { status: 404 }));

    const result = await fetchBannerData("/buildbanner.json");
    expect(result).toBeNull();
  });

  it("500 returns null", async () => {
    mockFetch.mockResolvedValue(mockResponse(null, { status: 500 }));

    const result = await fetchBannerData("/buildbanner.json");
    expect(result).toBeNull();
  });

  it("network error returns null", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await fetchBannerData("/buildbanner.json");
    expect(result).toBeNull();
  });

  it("timeout after 3s returns null", async () => {
    mockFetch.mockImplementation((_url, opts) => {
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });

    const promise = fetchBannerData("/buildbanner.json");
    vi.advanceTimersByTime(3000);
    const result = await promise;
    expect(result).toBeNull();
  });

  it("invalid JSON returns null", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
    });

    const result = await fetchBannerData("/buildbanner.json");
    expect(result).toBeNull();
  });

  it("HTML response returns null", async () => {
    mockFetch.mockResolvedValue(
      mockResponse("<html></html>", { contentType: "text/html" }),
    );

    const result = await fetchBannerData("/buildbanner.json");
    expect(result).toBeNull();
  });

  it("response with null sha is accepted and returned", async () => {
    const payload = { sha: null, branch: "main" };
    mockFetch.mockResolvedValue(mockResponse(payload));

    const result = await fetchBannerData("/buildbanner.json");
    expect(result).toEqual(payload);
    expect(result.sha).toBeNull();
  });

  it("response with null branch is accepted and returned", async () => {
    const payload = { sha: "a1b2c3d", branch: null };
    mockFetch.mockResolvedValue(mockResponse(payload));

    const result = await fetchBannerData("/buildbanner.json");
    expect(result).toEqual(payload);
    expect(result.branch).toBeNull();
  });

  it("token is sent as Bearer header when configured", async () => {
    mockFetch.mockResolvedValue(mockResponse({ sha: "abc" }));

    await fetchBannerData("/buildbanner.json", { token: "my-secret-token" });

    const callArgs = mockFetch.mock.calls[0][1];
    expect(callArgs.headers["Authorization"]).toBe("Bearer my-secret-token");
  });

  it("Cache-Control: no-cache is NOT sent on initial fetch", async () => {
    mockFetch.mockResolvedValue(mockResponse({ sha: "abc" }));

    await fetchBannerData("/buildbanner.json", {});

    const callArgs = mockFetch.mock.calls[0][1];
    expect(callArgs.headers["Cache-Control"]).toBeUndefined();
  });

  it("Cache-Control: no-cache IS sent when isRefetch is true", async () => {
    mockFetch.mockResolvedValue(mockResponse({ sha: "abc" }));

    await fetchBannerData("/buildbanner.json", { isRefetch: true });

    const callArgs = mockFetch.mock.calls[0][1];
    expect(callArgs.headers["Cache-Control"]).toBe("no-cache");
  });

  it("no Authorization header when token is null", async () => {
    mockFetch.mockResolvedValue(mockResponse({ sha: "abc" }));

    await fetchBannerData("/buildbanner.json", { token: null });

    const callArgs = mockFetch.mock.calls[0][1];
    expect(callArgs.headers["Authorization"]).toBeUndefined();
  });
});

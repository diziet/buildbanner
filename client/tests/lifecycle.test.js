/** Tests for lifecycle methods: refresh, update, and Symbol guard finalization. */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockResponse } from "./helpers.js";

describe("BuildBanner lifecycle", () => {
  let BuildBanner;
  let mockFetch;

  const DEFAULT_DATA = {
    sha: "a1b2c3d",
    branch: "main",
    custom: { model: "gpt-4", region: "us-east" },
  };

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

  /** Helper: init banner with default data. */
  async function initBanner(data = DEFAULT_DATA) {
    mockFetch.mockResolvedValue(mockResponse(data));
    await BuildBanner.init({ endpoint: "/buildbanner.json" });
  }

  it("refresh() re-fetches and updates segments", async () => {
    await initBanner();
    const host = document.querySelector("[data-testid='buildbanner']");
    expect(host.shadowRoot.querySelector("[data-segment='sha']").textContent).toBe("a1b2c3d");

    mockFetch.mockResolvedValue(mockResponse({ sha: "newsha1", branch: "dev" }));
    await BuildBanner.refresh();

    expect(host.shadowRoot.querySelector("[data-segment='sha']").textContent).toBe("newsha1");
    expect(host.shadowRoot.querySelector("[data-segment='branch']").textContent).toBe("dev");
  });

  it("refresh() with endpoint failure keeps last data", async () => {
    await initBanner();

    mockFetch.mockResolvedValue(mockResponse(null, { status: 500 }));
    await BuildBanner.refresh();

    const host = document.querySelector("[data-testid='buildbanner']");
    expect(host.shadowRoot.querySelector("[data-segment='sha']").textContent).toBe("a1b2c3d");
  });

  it("update({ custom: { model: 'new' } }) merges into current state", async () => {
    await initBanner();

    BuildBanner.update({ custom: { model: "new" } });

    const host = document.querySelector("[data-testid='buildbanner']");
    const shadow = host.shadowRoot;
    expect(shadow.querySelector("[data-segment='custom-model']").textContent).toBe("new");
    expect(shadow.querySelector("[data-segment='custom-region']").textContent).toBe("us-east");
  });

  it("update() re-renders without fetch", async () => {
    await initBanner();
    mockFetch.mockClear();

    BuildBanner.update({ branch: "feature" });

    expect(mockFetch).not.toHaveBeenCalled();
    const host = document.querySelector("[data-testid='buildbanner']");
    expect(host.shadowRoot.querySelector("[data-segment='branch']").textContent).toBe("feature");
  });

  it("update() with partial custom merges (does not replace entire custom map)", async () => {
    await initBanner();

    BuildBanner.update({ custom: { newkey: "val" } });

    const host = document.querySelector("[data-testid='buildbanner']");
    const shadow = host.shadowRoot;
    expect(shadow.querySelector("[data-segment='custom-model']").textContent).toBe("gpt-4");
    expect(shadow.querySelector("[data-segment='custom-region']").textContent).toBe("us-east");
    expect(shadow.querySelector("[data-segment='custom-newkey']").textContent).toBe("val");
  });

  it("update() of status fields re-renders status dots", async () => {
    const dataWithStatus = {
      sha: "abc1234",
      branch: "main",
      tests: { status: "pass", summary: "100 passed" },
    };
    await initBanner(dataWithStatus);

    const host = document.querySelector("[data-testid='buildbanner']");
    const getTestsText = () =>
      host.shadowRoot.querySelector("[data-segment='tests']").textContent;

    expect(getTestsText()).toContain("100 passed");

    BuildBanner.update({ tests: { status: "fail", summary: "3 failed" } });
    expect(getTestsText()).toContain("3 failed");
  });

  it("methods become no-ops after destroy (no error thrown)", async () => {
    await initBanner();
    BuildBanner.destroy();

    expect(() => BuildBanner.update({ sha: "x" })).not.toThrow();
    await expect(BuildBanner.refresh()).resolves.toBeUndefined();
    expect(BuildBanner.isVisible()).toBe(false);
    expect(() => BuildBanner.destroy()).not.toThrow();
  });

  it("init() after destroy creates new instance", async () => {
    await initBanner();
    BuildBanner.destroy();
    expect(document.querySelector("[data-testid='buildbanner']")).toBeNull();

    mockFetch.mockResolvedValue(mockResponse({ sha: "newsha2", branch: "feat" }));
    await BuildBanner.init({ endpoint: "/buildbanner.json" });

    const host = document.querySelector("[data-testid='buildbanner']");
    expect(host).not.toBeNull();
    expect(host.shadowRoot.querySelector("[data-segment='sha']").textContent).toBe("newsha2");
    expect(BuildBanner.isVisible()).toBe(true);
  });

  it("update() while polling is active works (data merges)", async () => {
    const data = { sha: "poll123", branch: "main" };
    mockFetch.mockResolvedValue(mockResponse(data));
    await BuildBanner.init({ endpoint: "/buildbanner.json", poll: 30 });

    BuildBanner.update({ branch: "updated-branch" });

    const host = document.querySelector("[data-testid='buildbanner']");
    expect(host.shadowRoot.querySelector("[data-segment='branch']").textContent).toBe("updated-branch");
    expect(host.shadowRoot.querySelector("[data-segment='sha']").textContent).toBe("poll123");
  });

  it("refresh() after destroy is a no-op", async () => {
    await initBanner();
    BuildBanner.destroy();
    mockFetch.mockClear();

    await BuildBanner.refresh();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(document.querySelector("[data-testid='buildbanner']")).toBeNull();
  });
});

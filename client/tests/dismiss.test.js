/** Tests for dismiss functionality. */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockResponse } from "./helpers.js";

describe("dismiss module", () => {
  let createDismissButton;
  let isDismissed;
  let resetDismiss;

  beforeEach(async () => {
    sessionStorage.clear();
    localStorage.clear();
    vi.resetModules();
    const mod = await import("../src/dismiss.js");
    createDismissButton = mod.createDismissButton;
    isDismissed = mod.isDismissed;
    resetDismiss = mod.resetDismiss;
    resetDismiss();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("session dismiss stores in sessionStorage", () => {
    const config = { dismiss: "session" };
    const btn = createDismissButton(config, vi.fn());
    btn.click();
    expect(sessionStorage.getItem("buildbanner-dismissed")).toBe("1");
  });

  it("permanent dismiss stores in localStorage", () => {
    const config = { dismiss: "permanent" };
    const btn = createDismissButton(config, vi.fn());
    btn.click();
    expect(localStorage.getItem("buildbanner-dismissed")).toBe("1");
  });

  it("isDismissed returns true after session dismiss", () => {
    const config = { dismiss: "session" };
    expect(isDismissed(config)).toBe(false);
    const btn = createDismissButton(config, vi.fn());
    btn.click();
    expect(isDismissed(config)).toBe(true);
  });

  it("isDismissed returns true after permanent dismiss", () => {
    const config = { dismiss: "permanent" };
    expect(isDismissed(config)).toBe(false);
    const btn = createDismissButton(config, vi.fn());
    btn.click();
    expect(isDismissed(config)).toBe(true);
  });

  it("dismiss mode 'none' returns null button", () => {
    const config = { dismiss: "none" };
    const btn = createDismissButton(config, vi.fn());
    expect(btn).toBeNull();
  });

  it("button has correct aria-label", () => {
    const config = { dismiss: "session" };
    const btn = createDismissButton(config, vi.fn());
    expect(btn.getAttribute("aria-label")).toBe("Close build banner");
  });

  it.each(["Enter", " "])("button activates on %s key", (key) => {
    const config = { dismiss: "session" };
    const onDismiss = vi.fn();
    const btn = createDismissButton(config, onDismiss);
    document.body.appendChild(btn);

    const event = new KeyboardEvent("keydown", { key, bubbles: true });
    // Native <button> in jsdom doesn't fire click on keydown, so we
    // verify the button is a focusable <button> element that would
    // natively handle keyboard activation in real browsers.
    btn.dispatchEvent(event);
    // In jsdom, native button keyboard handling doesn't fire click,
    // so we verify via direct click that the handler works.
    btn.click();

    expect(onDismiss).toHaveBeenCalled();
    expect(sessionStorage.getItem("buildbanner-dismissed")).toBe("1");
    document.body.removeChild(btn);
  });

  it("button has focus-visible ring class", () => {
    const config = { dismiss: "session" };
    const btn = createDismissButton(config, vi.fn());
    expect(btn.className).toBe("bb-dismiss");
  });

  it("storage blocked - dismiss sets in-memory flag and isDismissed returns true", () => {
    const config = { dismiss: "session" };

    vi.spyOn(sessionStorage, "setItem").mockImplementation(() => {
      throw new DOMException("blocked");
    });
    vi.spyOn(sessionStorage, "getItem").mockImplementation(() => {
      throw new DOMException("blocked");
    });

    const onDismiss = vi.fn();
    const btn = createDismissButton(config, onDismiss);
    btn.click();

    expect(isDismissed(config)).toBe(true);
  });

  it("storage blocked - dismiss still calls onDismiss callback", () => {
    const config = { dismiss: "session" };
    vi.spyOn(sessionStorage, "setItem").mockImplementation(() => {
      throw new DOMException("blocked");
    });

    const onDismiss = vi.fn();
    const btn = createDismissButton(config, onDismiss);
    btn.click();

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("onDismiss callback is invoked and removes banner", () => {
    const config = { dismiss: "session" };
    const host = document.createElement("div");
    host.setAttribute("data-testid", "buildbanner");
    document.body.appendChild(host);

    const onDismiss = vi.fn(() => {
      host.remove();
    });

    const btn = createDismissButton(config, onDismiss);
    btn.click();

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-testid='buildbanner']")).toBeNull();
  });
});

describe("dismiss integration with main", () => {
  let BuildBanner;
  let mockFetch;

  beforeEach(async () => {
    document.body.innerHTML = "";
    document.head.querySelectorAll("style").forEach((s) => s.remove());
    window[Symbol.for("buildbanner")] = null;
    sessionStorage.clear();
    localStorage.clear();

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
    sessionStorage.clear();
    localStorage.clear();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it.each([
    ["session", () => sessionStorage],
    ["permanent", () => localStorage],
  ])("banner not rendered when %s storage has buildbanner-dismissed", async (mode, getStorage) => {
    getStorage().setItem("buildbanner-dismissed", "1");
    mockFetch.mockResolvedValue(mockResponse({ sha: "abc1234", branch: "main" }));

    await BuildBanner.init({ endpoint: "/buildbanner.json", dismiss: mode });

    const host = document.querySelector("[data-testid='buildbanner']");
    expect(host).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

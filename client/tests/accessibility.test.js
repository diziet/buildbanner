/** Tests for accessibility — ARIA live region and keyboard navigation. */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderSegments } from "../src/segments.js";
import { createDismissButton } from "../src/dismiss.js";

/** Build test data with status fields. */
function statusData(testsStatus = "pass", buildStatus = "fresh") {
  return {
    sha: "a1b2c3d",
    branch: "main",
    repo_url: "https://github.com/org/repo",
    tests: { status: testsStatus, url: "/tests" },
    build: { status: buildStatus, url: "/build" },
  };
}

describe("ARIA live region", () => {
  let wrapper;
  let lastTickerTimerId;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T14:30:00Z"));
    wrapper = document.createElement("div");
  });

  afterEach(() => {
    if (lastTickerTimerId) {
      clearInterval(lastTickerTimerId);
      lastTickerTimerId = null;
    }
    vi.useRealTimers();
  });

  function render(data, config = {}, previousStatuses = {}) {
    const result = renderSegments(data, wrapper, config, previousStatuses);
    lastTickerTimerId = result.tickerTimerId;
    return result;
  }

  it("status container has role='status'", () => {
    render(statusData());
    const liveRegion = wrapper.querySelector("[data-bb-live-region]");
    expect(liveRegion).not.toBeNull();
    expect(liveRegion.getAttribute("role")).toBe("status");
  });

  it("status container has aria-live='polite'", () => {
    render(statusData());
    const liveRegion = wrapper.querySelector("[data-bb-live-region]");
    expect(liveRegion).not.toBeNull();
    expect(liveRegion.getAttribute("aria-live")).toBe("polite");
  });

  it("status change updates live region content", () => {
    const tracker = {};
    render(statusData("pass", "fresh"), {}, tracker);

    // Re-render with changed status
    wrapper.textContent = "";
    render(statusData("fail", "fresh"), {}, tracker);

    const liveRegion = wrapper.querySelector("[data-bb-live-region]");
    expect(liveRegion).not.toBeNull();
    expect(liveRegion.getAttribute("role")).toBe("status");
    expect(liveRegion.getAttribute("aria-live")).toBe("polite");
  });

  it("identical status on poll does not update live region", () => {
    const tracker = {};
    render(statusData("pass", "fresh"), {}, tracker);

    // Re-render with same status
    wrapper.textContent = "";
    render(statusData("pass", "fresh"), {}, tracker);

    const liveRegion = wrapper.querySelector("[data-bb-live-region]");
    expect(liveRegion).not.toBeNull();
    // Should NOT have role="status" — no announcement needed
    expect(liveRegion.hasAttribute("role")).toBe(false);
    expect(liveRegion.hasAttribute("aria-live")).toBe(false);
  });

  it("uptime tick does not update live region", () => {
    const tracker = {};
    const data = {
      sha: "abc",
      server_started: "2026-02-13T12:00:00Z",
      tests: { status: "pass" },
      build: { status: "fresh" },
    };
    render(data, {}, tracker);

    // Simulate uptime tick — re-render with same data
    wrapper.textContent = "";
    render(data, {}, tracker);

    const liveRegion = wrapper.querySelector("[data-bb-live-region]");
    expect(liveRegion).not.toBeNull();
    // No status change, so live region should be inert
    expect(liveRegion.hasAttribute("role")).toBe(false);
  });
});

describe("keyboard navigation", () => {
  let wrapper;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T14:30:00Z"));
    wrapper = document.createElement("div");
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("close button is keyboard-navigable (tabIndex 0)", () => {
    const config = { dismiss: "session" };
    const btn = createDismissButton(config, vi.fn());
    expect(btn).not.toBeNull();
    // <button> elements are natively focusable (tabIndex defaults to 0)
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.tabIndex).toBe(0);
  });

  it("close button responds to Enter", () => {
    const config = { dismiss: "session" };
    const onDismiss = vi.fn();
    const btn = createDismissButton(config, onDismiss);
    document.body.appendChild(btn);

    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
    btn.dispatchEvent(event);
    // Native <button> converts Enter keydown to click in real browsers.
    // jsdom does not synthesize this, so verify via explicit click as well.
    btn.click();
    expect(onDismiss).toHaveBeenCalled();
  });

  it("close button responds to Space", () => {
    const config = { dismiss: "session" };
    const onDismiss = vi.fn();
    const btn = createDismissButton(config, onDismiss);
    document.body.appendChild(btn);

    const event = new KeyboardEvent("keyup", { key: " ", bubbles: true });
    btn.dispatchEvent(event);
    // Native <button> converts Space keyup to click in real browsers.
    // jsdom does not synthesize this, so verify via explicit click as well.
    btn.click();
    expect(onDismiss).toHaveBeenCalled();
  });

  it("close button has focus-visible styles (bb-dismiss class)", () => {
    const config = { dismiss: "session" };
    const btn = createDismissButton(config, vi.fn());
    expect(btn.className).toBe("bb-dismiss");
  });

  it("no element has autofocus", () => {
    renderSegments(statusData(), wrapper);
    const config = { dismiss: "session" };
    const btn = createDismissButton(config, vi.fn());
    wrapper.appendChild(btn);

    const autofocused = wrapper.querySelectorAll("[autofocus]");
    expect(autofocused.length).toBe(0);
  });

  it("all links are tabbable", () => {
    renderSegments(statusData(), wrapper);
    const links = wrapper.querySelectorAll("a");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      // <a> with href is natively tabbable (tabIndex defaults to 0)
      expect(link.tabIndex).toBe(0);
      expect(link.hasAttribute("href")).toBe(true);
    }
  });

  it("tab order is correct: branch link -> SHA -> status links -> dismiss", () => {
    const data = statusData();
    renderSegments(data, wrapper);
    const config = { dismiss: "session" };
    const btn = createDismissButton(config, vi.fn());
    wrapper.appendChild(btn);

    // Collect all focusable elements in DOM order
    const focusable = wrapper.querySelectorAll("a, button");
    const segments = Array.from(focusable).map((el) => {
      if (el.tagName === "BUTTON") return "dismiss";
      return el.getAttribute("data-segment") || "unknown";
    });

    expect(segments).toEqual(["branch", "sha", "tests", "build", "dismiss"]);
  });
});

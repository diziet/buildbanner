/** Tests for click-to-copy clipboard module. */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { attachCopyHandler } from "../src/clipboard.js";

/** Create a mock logger. */
function mockLogger() {
  return { log: vi.fn() };
}

/** Create a SHA element (span or anchor). */
function createShaElement(tag = "span") {
  const el = document.createElement(tag);
  el.setAttribute("data-segment", "sha");
  el.textContent = "a1b2c3d";
  return el;
}

/** Simulate a click event and return the event object. */
function clickElement(el) {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  vi.spyOn(event, "preventDefault");
  el.dispatchEvent(event);
  return event;
}

describe("attachCopyHandler", () => {
  let logger;

  beforeEach(() => {
    vi.useFakeTimers();
    logger = mockLogger();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("copies sha_full when present via clipboard API", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    const el = createShaElement();
    attachCopyHandler(el, "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2", logger);
    clickElement(el);

    await vi.advanceTimersByTimeAsync(0);
    expect(writeText).toHaveBeenCalledWith(
      "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    );
  });

  it("copies short sha when sha_full is absent", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    const el = createShaElement();
    attachCopyHandler(el, "a1b2c3d", logger);
    clickElement(el);

    await vi.advanceTimersByTimeAsync(0);
    expect(writeText).toHaveBeenCalledWith("a1b2c3d");
  });

  it("calls preventDefault on click (no navigation)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    const el = createShaElement("a");
    el.href = "https://github.com/repo/commit/abc";
    attachCopyHandler(el, "abc1234", logger);
    const event = clickElement(el);

    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("text changes to 'Copied!' on success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    const el = createShaElement();
    attachCopyHandler(el, "abc1234", logger);
    clickElement(el);

    await vi.advanceTimersByTimeAsync(0);
    expect(el.textContent).toBe("Copied!");
  });

  it("text reverts after 1500ms", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    const el = createShaElement();
    el.textContent = "a1b2c3d";
    attachCopyHandler(el, "abc1234", logger);
    clickElement(el);

    await vi.advanceTimersByTimeAsync(0);
    expect(el.textContent).toBe("Copied!");

    vi.advanceTimersByTime(1500);
    expect(el.textContent).toBe("a1b2c3d");
  });

  it("falls back to execCommand when clipboard API unavailable", () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    document.execCommand = vi.fn().mockReturnValue(true);
    const execCommandSpy = document.execCommand;

    const el = createShaElement();
    attachCopyHandler(el, "abc1234", logger);
    clickElement(el);

    expect(execCommandSpy).toHaveBeenCalledWith("copy");
    expect(el.textContent).toBe("Copied!");
  });

  it("logs failure when both APIs fail", () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    document.execCommand = vi.fn().mockReturnValue(false);

    const el = createShaElement();
    attachCopyHandler(el, "abc1234", logger);
    clickElement(el);

    expect(logger.log).toHaveBeenCalledWith("clipboard copy failed");
    expect(el.textContent).toBe("a1b2c3d");
  });

  it("double-click during 'Copied!' state is ignored", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    const el = createShaElement();
    el.textContent = "a1b2c3d";
    attachCopyHandler(el, "abc1234", logger);

    clickElement(el);
    await vi.advanceTimersByTimeAsync(0);
    expect(el.textContent).toBe("Copied!");

    // Second click during "Copied!" state
    clickElement(el);
    await vi.advanceTimersByTimeAsync(0);
    expect(el.textContent).toBe("Copied!");

    // writeText called only once
    expect(writeText).toHaveBeenCalledTimes(1);

    // After 1500ms, text reverts correctly
    vi.advanceTimersByTime(1500);
    expect(el.textContent).toBe("a1b2c3d");
  });
});

/** Tests for click-to-copy clipboard module. */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { attachCopyHandler } from "../src/clipboard.js";

const TEST_SHA_SHORT = "a1b2c3d";
const TEST_SHA_FULL = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

/** Create a mock logger. */
function mockLogger() {
  return { log: vi.fn() };
}

/** Mock the clipboard API with a writeText spy. */
function mockClipboardAPI(writeTextFn = vi.fn().mockResolvedValue(undefined)) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: writeTextFn },
    writable: true,
    configurable: true,
  });
  return writeTextFn;
}

/** Disable the clipboard API entirely. */
function disableClipboardAPI() {
  Object.defineProperty(navigator, "clipboard", {
    value: undefined,
    writable: true,
    configurable: true,
  });
}

/** Create a SHA element (span or anchor). */
function createShaElement(tag = "span") {
  const el = document.createElement(tag);
  el.setAttribute("data-segment", "sha");
  el.textContent = TEST_SHA_SHORT;
  return el;
}

/** Simulate a click event and return the event object. */
function clickElement(el, options = {}) {
  const event = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    ...options,
  });
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
    const writeText = mockClipboardAPI();

    const el = createShaElement();
    attachCopyHandler(el, TEST_SHA_FULL, logger);
    clickElement(el);

    await vi.advanceTimersByTimeAsync(0);
    expect(writeText).toHaveBeenCalledWith(TEST_SHA_FULL);
  });

  it("copies short sha when sha_full is absent", async () => {
    const writeText = mockClipboardAPI();

    const el = createShaElement();
    attachCopyHandler(el, TEST_SHA_SHORT, logger);
    clickElement(el);

    await vi.advanceTimersByTimeAsync(0);
    expect(writeText).toHaveBeenCalledWith(TEST_SHA_SHORT);
  });

  it("calls preventDefault on click (no navigation)", () => {
    mockClipboardAPI();

    const el = createShaElement("a");
    el.href = "https://github.com/repo/commit/abc";
    attachCopyHandler(el, TEST_SHA_SHORT, logger);
    const event = clickElement(el);

    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("allows Ctrl+click to navigate (no preventDefault)", () => {
    mockClipboardAPI();

    const el = createShaElement("a");
    el.href = "https://github.com/repo/commit/abc";
    attachCopyHandler(el, TEST_SHA_SHORT, logger);
    const event = clickElement(el, { ctrlKey: true });

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("allows Cmd+click to navigate (no preventDefault)", () => {
    mockClipboardAPI();

    const el = createShaElement("a");
    el.href = "https://github.com/repo/commit/abc";
    attachCopyHandler(el, TEST_SHA_SHORT, logger);
    const event = clickElement(el, { metaKey: true });

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("text changes to 'Copied!' on success", async () => {
    mockClipboardAPI();

    const el = createShaElement();
    attachCopyHandler(el, TEST_SHA_SHORT, logger);
    clickElement(el);

    await vi.advanceTimersByTimeAsync(0);
    expect(el.textContent).toBe("Copied!");
  });

  it("text reverts after 1500ms", async () => {
    mockClipboardAPI();

    const el = createShaElement();
    attachCopyHandler(el, TEST_SHA_SHORT, logger);
    clickElement(el);

    await vi.advanceTimersByTimeAsync(0);
    expect(el.textContent).toBe("Copied!");

    vi.advanceTimersByTime(1500);
    expect(el.textContent).toBe(TEST_SHA_SHORT);
  });

  it("falls back to execCommand when clipboard API unavailable", () => {
    disableClipboardAPI();

    document.execCommand = vi.fn().mockReturnValue(true);
    const execCommandSpy = document.execCommand;

    const el = createShaElement();
    attachCopyHandler(el, TEST_SHA_SHORT, logger);
    clickElement(el);

    expect(execCommandSpy).toHaveBeenCalledWith("copy");
    expect(el.textContent).toBe("Copied!");
  });

  it("logs failure when both APIs fail", () => {
    disableClipboardAPI();

    document.execCommand = vi.fn().mockReturnValue(false);

    const el = createShaElement();
    attachCopyHandler(el, TEST_SHA_SHORT, logger);
    clickElement(el);

    expect(logger.log).toHaveBeenCalledWith("clipboard copy failed");
    expect(el.textContent).toBe(TEST_SHA_SHORT);
  });

  it("double-click during 'Copied!' state is ignored", async () => {
    const writeText = mockClipboardAPI();

    const el = createShaElement();
    attachCopyHandler(el, TEST_SHA_SHORT, logger);

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
    expect(el.textContent).toBe(TEST_SHA_SHORT);
  });
});

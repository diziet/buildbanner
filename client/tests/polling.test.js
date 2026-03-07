/** Tests for polling module with exponential backoff and visibility awareness. */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("polling module", () => {
  let startPolling;
  let stopPolling;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const mod = await import("../src/polling.js");
    startPolling = mod.startPolling;
    stopPolling = mod.stopPolling;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("polls at configured interval", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ sha: "abc1234" });
    const onData = vi.fn();
    const config = { poll: 10 };

    startPolling(config, fetchFn, onData, null);

    expect(fetchFn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("successful poll resets interval", async () => {
    let callCount = 0;
    const fetchFn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 2) return Promise.resolve(null);
      return Promise.resolve({ sha: "abc1234" });
    });
    const onData = vi.fn();
    const config = { poll: 10 };

    startPolling(config, fetchFn, onData, null);

    // First tick at 10s — fails, backs off to 20s
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Second tick at 20s — fails, backs off to 40s
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchFn).toHaveBeenCalledTimes(2);

    // Third tick at 40s — succeeds, resets to 10s
    await vi.advanceTimersByTimeAsync(40_000);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(onData).toHaveBeenCalledTimes(1);

    // Fourth tick at 10s (reset interval)
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it("failed poll doubles interval", async () => {
    const fetchFn = vi.fn().mockResolvedValue(null);
    const onData = vi.fn();
    const config = { poll: 10 };

    startPolling(config, fetchFn, onData, null);

    // First tick at 10s
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Next tick at 20s (doubled)
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(onData).not.toHaveBeenCalled();
  });

  it("backoff caps at 300 seconds", async () => {
    const fetchFn = vi.fn().mockResolvedValue(null);
    const onData = vi.fn();
    const config = { poll: 100 };

    startPolling(config, fetchFn, onData, null);

    // 100s -> 200s -> 300s (capped)
    await vi.advanceTimersByTimeAsync(100_000);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(200_000);
    expect(fetchFn).toHaveBeenCalledTimes(2);

    // Should be capped at 300, not 400
    await vi.advanceTimersByTimeAsync(300_000);
    expect(fetchFn).toHaveBeenCalledTimes(3);

    // Still 300
    await vi.advanceTimersByTimeAsync(300_000);
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it("tab hidden pauses polling (no fetches fire)", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ sha: "abc1234" });
    const onData = vi.fn();
    const config = { poll: 10 };

    startPolling(config, fetchFn, onData, null);

    // Go hidden
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    // Advance past several intervals
    await vi.advanceTimersByTimeAsync(50_000);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("tab visible triggers immediate fetch", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ sha: "abc1234" });
    const onData = vi.fn();
    const config = { poll: 10 };

    startPolling(config, fetchFn, onData, null);

    // Go hidden
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    // Go visible
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    // Immediate fetch (async tick)
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(onData).toHaveBeenCalledTimes(1);
  });

  it("tab visible resumes normal interval", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ sha: "abc1234" });
    const onData = vi.fn();
    const config = { poll: 10 };

    startPolling(config, fetchFn, onData, null);

    // Go hidden then visible
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    // Immediate fetch resolves
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Next poll at normal 10s
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("backoff not reset by visibility change alone (endpoint still failing)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(null);
    const onData = vi.fn();
    const config = { poll: 10 };

    startPolling(config, fetchFn, onData, null);

    // First tick fails, backs off to 20s
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Go hidden then visible — immediate fetch still fails
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchFn).toHaveBeenCalledTimes(2);

    // Interval should still be backed off (40s after another failure), not reset to 10s
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchFn).toHaveBeenCalledTimes(2); // no new fetch at 10s

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchFn).toHaveBeenCalledTimes(3); // fires at 40s
  });

  it("stopPolling clears timer", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ sha: "abc1234" });
    const onData = vi.fn();
    const config = { poll: 10 };

    const state = startPolling(config, fetchFn, onData, null);
    stopPolling(state);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("stopPolling removes visibility listener", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ sha: "abc1234" });
    const onData = vi.fn();
    const config = { poll: 10 };

    const state = startPolling(config, fetchFn, onData, null);
    stopPolling(state);

    // Visibility change should not trigger fetch
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("poll=0 means no polling started", () => {
    const fetchFn = vi.fn();
    const onData = vi.fn();
    const config = { poll: 0 };

    const state = startPolling(config, fetchFn, onData, null);
    expect(state).toBeNull();
  });

  it("poll update calls onData with new data", async () => {
    const newData = { sha: "new1234", branch: "main" };
    const fetchFn = vi.fn().mockResolvedValue(newData);
    const onData = vi.fn();
    const config = { poll: 5 };

    startPolling(config, fetchFn, onData, null);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(onData).toHaveBeenCalledWith(newData);
  });

  it("failed poll does not call onData", async () => {
    const fetchFn = vi.fn().mockResolvedValue(null);
    const onData = vi.fn();
    const config = { poll: 5 };

    startPolling(config, fetchFn, onData, null);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(onData).not.toHaveBeenCalled();
  });

  it("failed poll does not flicker banner (banner DOM remains present)", async () => {
    const banner = document.createElement("div");
    banner.setAttribute("data-testid", "buildbanner");
    banner.textContent = "existing content";
    document.body.appendChild(banner);

    const fetchFn = vi.fn().mockResolvedValue(null);
    const onData = vi.fn();
    const config = { poll: 5 };

    startPolling(config, fetchFn, onData, null);

    await vi.advanceTimersByTimeAsync(5_000);

    // Banner should still be in the DOM with its content
    const found = document.querySelector("[data-testid='buildbanner']");
    expect(found).not.toBeNull();
    expect(found.textContent).toBe("existing content");

    document.body.removeChild(banner);
  });

  it("consecutive failures increase backoff (N->2N->4N)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(null);
    const onData = vi.fn();
    const config = { poll: 5 };

    const state = startPolling(config, fetchFn, onData, null);

    // First tick at 5s — fails, interval becomes 10s
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(state.currentInterval).toBe(10);

    // Second tick at 10s — fails, interval becomes 20s
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(state.currentInterval).toBe(20);

    // Third tick at 20s — fails, interval becomes 40s
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(state.currentInterval).toBe(40);
  });

  it("success after backoff resets to original interval", async () => {
    let callCount = 0;
    const fetchFn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 2) return Promise.resolve(null);
      return Promise.resolve({ sha: "abc1234" });
    });
    const onData = vi.fn();
    const config = { poll: 5 };

    const state = startPolling(config, fetchFn, onData, null);

    // Fail twice: 5s -> 10s -> 20s
    await vi.advanceTimersByTimeAsync(5_000);
    expect(state.currentInterval).toBe(10);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(state.currentInterval).toBe(20);

    // Third call succeeds — should reset to 5
    await vi.advanceTimersByTimeAsync(20_000);
    expect(state.currentInterval).toBe(5);
    expect(onData).toHaveBeenCalledTimes(1);
  });
});

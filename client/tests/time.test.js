/** Tests for time formatting utilities. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatUptime, formatDeployAge, startUptimeTicker } from "../src/time.js";

describe("formatUptime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-07T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats seconds correctly", () => {
    // 45 seconds ago
    expect(formatUptime("2026-03-07T11:59:15Z")).toBe("up 45s");
  });

  it("formats minutes correctly", () => {
    // 12 minutes ago
    expect(formatUptime("2026-03-07T11:48:00Z")).toBe("up 12m");
  });

  it("formats hours and minutes correctly", () => {
    // 2h 15m ago
    expect(formatUptime("2026-03-07T09:45:00Z")).toBe("up 2h 15m");
  });

  it("formats days correctly", () => {
    // 3d 1h ago
    expect(formatUptime("2026-03-04T11:00:00Z")).toBe("up 3d 1h");
  });

  it("returns null for null server_started", () => {
    expect(formatUptime(null)).toBe(null);
  });

  it("returns null for undefined server_started", () => {
    expect(formatUptime(undefined)).toBe(null);
  });

  it("parses ISO 8601 with timezone offset correctly", () => {
    // 2026-03-07T10:00:00+02:00 is 2026-03-07T08:00:00Z, which is 4h ago from 12:00Z
    expect(formatUptime("2026-03-07T10:00:00+02:00")).toBe("up 4h");
  });

  it("returns up 0s for future timestamp", () => {
    expect(formatUptime("2026-03-07T13:00:00Z")).toBe("up 0s");
  });

  it("formats exact hour boundary without minutes", () => {
    // Exactly 2h ago
    expect(formatUptime("2026-03-07T10:00:00Z")).toBe("up 2h");
  });

  it("formats exact day boundary without hours", () => {
    // Exactly 3 days ago
    expect(formatUptime("2026-03-04T12:00:00Z")).toBe("up 3d");
  });
});

describe("formatDeployAge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-07T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats deploy age correctly", () => {
    // 3h ago
    expect(formatDeployAge("2026-03-07T09:00:00Z")).toBe("deployed 3h ago");
  });

  it("returns null for null deployed_at", () => {
    expect(formatDeployAge(null)).toBe(null);
  });

  it("returns null for undefined deployed_at", () => {
    expect(formatDeployAge(undefined)).toBe(null);
  });

  it("formats minutes deploy age", () => {
    expect(formatDeployAge("2026-03-07T11:48:00Z")).toBe("deployed 12m ago");
  });

  it("formats days deploy age", () => {
    expect(formatDeployAge("2026-03-05T12:00:00Z")).toBe("deployed 2d ago");
  });
});

describe("both formatUptime and formatDeployAge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-07T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("both return strings when both timestamps present", () => {
    const uptime = formatUptime("2026-03-07T09:45:00Z");
    const deployAge = formatDeployAge("2026-03-07T06:00:00Z");
    expect(typeof uptime).toBe("string");
    expect(typeof deployAge).toBe("string");
    expect(uptime).toBe("up 2h 15m");
    expect(deployAge).toBe("deployed 6h ago");
  });
});

describe("startUptimeTicker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-07T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("updates element text after 60 seconds", () => {
    const element = { textContent: "" };
    startUptimeTicker(element, "2026-03-07T11:55:00Z");
    // Initial: 5 minutes ago
    expect(element.textContent).toBe("up 5m");

    // Advance 60 seconds
    vi.advanceTimersByTime(60_000);
    expect(element.textContent).toBe("up 6m");
  });

  it("returns a clearable timer ID", () => {
    const element = { textContent: "" };
    const timerId = startUptimeTicker(element, "2026-03-07T11:55:00Z");
    expect(timerId).not.toBe(null);
    expect(timerId).toBeDefined();

    // Clear the timer — text should not update further
    clearInterval(timerId);
    vi.advanceTimersByTime(120_000);
    // Still shows the initial value since timer was cleared
    expect(element.textContent).toBe("up 5m");
  });

  it("returns null when element is null", () => {
    expect(startUptimeTicker(null, "2026-03-07T11:55:00Z")).toBe(null);
  });

  it("returns null when serverStartedISO is null", () => {
    const element = { textContent: "" };
    expect(startUptimeTicker(element, null)).toBe(null);
  });

  it("sets initial text immediately", () => {
    const element = { textContent: "" };
    startUptimeTicker(element, "2026-03-07T11:59:15Z");
    expect(element.textContent).toBe("up 45s");
  });
});

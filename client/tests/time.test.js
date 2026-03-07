/** Tests for the time formatting module. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatUptime, formatDeployAge, startUptimeTicker } from "../src/time.js";

describe("formatUptime", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("returns null for null server_started", () => {
    expect(formatUptime(null)).toBeNull();
  });

  it("returns null for undefined server_started", () => {
    expect(formatUptime(undefined)).toBeNull();
  });

  it("formats seconds correctly", () => {
    const now = new Date("2026-03-07T12:00:45Z");
    vi.setSystemTime(now);
    expect(formatUptime("2026-03-07T12:00:00Z")).toBe("up 45s");
  });

  it("formats minutes correctly", () => {
    const now = new Date("2026-03-07T12:12:00Z");
    vi.setSystemTime(now);
    expect(formatUptime("2026-03-07T12:00:00Z")).toBe("up 12m");
  });

  it("formats hours and minutes correctly", () => {
    const now = new Date("2026-03-07T14:15:00Z");
    vi.setSystemTime(now);
    expect(formatUptime("2026-03-07T12:00:00Z")).toBe("up 2h 15m");
  });

  it("formats days correctly", () => {
    const now = new Date("2026-03-10T13:00:00Z");
    vi.setSystemTime(now);
    expect(formatUptime("2026-03-07T12:00:00Z")).toBe("up 3d 1h");
  });

  it("parses ISO 8601 with timezone offset correctly", () => {
    const now = new Date("2026-03-07T14:00:00Z");
    vi.setSystemTime(now);
    // +02:00 means the timestamp is 12:00 UTC
    expect(formatUptime("2026-03-07T14:00:00+02:00")).toBe("up 2h");
  });
});

describe("formatDeployAge", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("returns null for null deployed_at", () => {
    expect(formatDeployAge(null)).toBeNull();
  });

  it("returns null for undefined deployed_at", () => {
    expect(formatDeployAge(undefined)).toBeNull();
  });

  it("formats deploy age correctly", () => {
    const now = new Date("2026-03-07T15:00:00Z");
    vi.setSystemTime(now);
    expect(formatDeployAge("2026-03-07T12:00:00Z")).toBe("deployed 3h ago");
  });
});

describe("both present", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("returns both strings when both timestamps are present", () => {
    const now = new Date("2026-03-07T15:00:00Z");
    vi.setSystemTime(now);
    const uptime = formatUptime("2026-03-07T14:00:00Z");
    const deployAge = formatDeployAge("2026-03-07T12:00:00Z");
    expect(uptime).toBe("up 1h");
    expect(deployAge).toBe("deployed 3h ago");
  });
});

describe("startUptimeTicker", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("updates element text after 60 seconds", () => {
    vi.setSystemTime(new Date("2026-03-07T12:00:00Z"));
    const element = { textContent: "" };

    startUptimeTicker(element, "2026-03-07T11:58:00Z");
    expect(element.textContent).toBe("up 2m");

    vi.advanceTimersByTime(60_000);
    expect(element.textContent).toBe("up 3m");
  });

  it("returns a clearable timer ID", () => {
    vi.setSystemTime(new Date("2026-03-07T12:00:00Z"));
    const element = { textContent: "" };
    const timerId = startUptimeTicker(element, "2026-03-07T11:58:00Z");

    expect(timerId).not.toBeNull();
    clearInterval(timerId);

    vi.setSystemTime(new Date("2026-03-07T12:01:00Z"));
    vi.advanceTimersByTime(60_000);
    // After clearing, text should not have updated
    expect(element.textContent).toBe("up 2m");
  });

  it("returns null when element is null", () => {
    expect(startUptimeTicker(null, "2026-03-07T12:00:00Z")).toBeNull();
  });

  it("returns null when serverStartedISO is null", () => {
    const element = { textContent: "" };
    expect(startUptimeTicker(element, null)).toBeNull();
  });
});

/** Tests for client/src/time.js — time formatting utilities. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatUptime, formatDeployAge, startUptimeTicker } from "../src/time.js";

const FAKE_NOW = "2026-03-07T12:00:00Z";

describe("time utilities", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FAKE_NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("formatUptime", () => {
    it("formats seconds correctly", () => {
      const iso = new Date(Date.now() - 45 * 1000).toISOString();
      expect(formatUptime(iso)).toBe("up 45s");
    });

    it("formats minutes correctly", () => {
      const iso = new Date(Date.now() - 12 * 60 * 1000).toISOString();
      expect(formatUptime(iso)).toBe("up 12m");
    });

    it("formats hours and minutes correctly", () => {
      const iso = new Date(Date.now() - (2 * 3600 + 15 * 60) * 1000).toISOString();
      expect(formatUptime(iso)).toBe("up 2h 15m");
    });

    it("formats days correctly", () => {
      const iso = new Date(Date.now() - (3 * 86400 + 1 * 3600) * 1000).toISOString();
      expect(formatUptime(iso)).toBe("up 3d 1h");
    });

    it("returns null for null server_started", () => {
      expect(formatUptime(null)).toBeNull();
    });

    it("returns null for undefined server_started", () => {
      expect(formatUptime(undefined)).toBeNull();
    });

    it("returns null for invalid ISO string", () => {
      expect(formatUptime("not-a-date")).toBeNull();
    });

    it("parses ISO 8601 with timezone offset correctly", () => {
      // 2026-03-07T10:00:00+02:00 = 2026-03-07T08:00:00Z = 4 hours before now
      const iso = "2026-03-07T10:00:00+02:00";
      expect(formatUptime(iso)).toBe("up 4h 0m");
    });
  });

  describe("formatDeployAge", () => {
    it("formats deploy age correctly", () => {
      const iso = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
      expect(formatDeployAge(iso)).toBe("deployed 3h 0m ago");
    });

    it("returns null for null deployed_at", () => {
      expect(formatDeployAge(null)).toBeNull();
    });

    it("returns null for undefined deployed_at", () => {
      expect(formatDeployAge(undefined)).toBeNull();
    });

    it("returns null for invalid ISO string", () => {
      expect(formatDeployAge("garbage")).toBeNull();
    });
  });

  describe("both formatUptime and formatDeployAge present", () => {
    it("both return strings when both inputs present", () => {
      const started = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
      const deployed = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const uptime = formatUptime(started);
      const deployAge = formatDeployAge(deployed);
      expect(typeof uptime).toBe("string");
      expect(typeof deployAge).toBe("string");
      expect(uptime).toMatch(/^up /);
      expect(deployAge).toMatch(/^deployed .+ ago$/);
    });
  });

  describe("startUptimeTicker", () => {
    let element;

    beforeEach(() => {
      element = document.createElement("span");
      document.body.appendChild(element);
    });

    afterEach(() => {
      if (element.isConnected) {
        document.body.removeChild(element);
      }
    });

    it("sets content immediately on creation", () => {
      const iso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      startUptimeTicker(element, iso);
      expect(element.textContent).toBe("up 5m");
    });

    it("updates element text after 60 seconds", () => {
      const iso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      startUptimeTicker(element, iso);
      vi.advanceTimersByTime(60000);
      expect(element.textContent).toBe("up 6m");
    });

    it("returns clearable timer ID", () => {
      const iso = new Date(Date.now() - 60 * 1000).toISOString();
      const timerId = startUptimeTicker(element, iso);
      expect(timerId).not.toBeNull();

      // Sentinel proves clearing actually prevents updates
      element.textContent = "sentinel";
      clearInterval(timerId);
      vi.advanceTimersByTime(60000);
      expect(element.textContent).toBe("sentinel");
    });

    it("returns null for null element", () => {
      expect(startUptimeTicker(null, FAKE_NOW)).toBeNull();
    });

    it("returns null for null server_started", () => {
      expect(startUptimeTicker(element, null)).toBeNull();
    });

    it("returns null for invalid ISO string", () => {
      expect(startUptimeTicker(element, "invalid")).toBeNull();
    });

    it("self-cleans when element is removed from DOM", () => {
      const iso = new Date(Date.now() - 60 * 1000).toISOString();
      startUptimeTicker(element, iso);

      // Set sentinel after initial content, then disconnect
      element.textContent = "sentinel";
      document.body.removeChild(element);

      vi.advanceTimersByTime(60000);
      expect(element.textContent).toBe("sentinel");
    });

    it("parses ISO 8601 with timezone offset correctly", () => {
      // 2026-03-07T10:00:00+02:00 = 2026-03-07T08:00:00Z = 4 hours before now
      const iso = "2026-03-07T10:00:00+02:00";
      startUptimeTicker(element, iso);
      vi.advanceTimersByTime(60000);
      // After 60s, it's 4h 1m
      expect(element.textContent).toBe("up 4h 1m");
    });
  });
});

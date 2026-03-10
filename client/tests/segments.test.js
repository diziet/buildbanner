/** Tests for segment rendering module. */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderSegments } from "../src/segments.js";

/** Helper: get data-segment values in DOM order. */
function getSegmentOrder(wrapper) {
  const elements = wrapper.querySelectorAll("[data-segment]");
  return Array.from(elements).map((el) => el.getAttribute("data-segment"));
}

/** Build full test data with all fields. */
function fullData() {
  return {
    app_name: "my-app",
    environment: "staging",
    branch: "main",
    sha: "a1b2c3d",
    commit_date: "2026-02-13T14:25:00Z",
    server_started: "2026-02-13T12:00:00Z",
    deployed_at: "2026-02-13T10:00:00Z",
    tests: { status: "pass", summary: "1.1M passed", url: "/api/tests" },
    build: { status: "fresh", summary: "built 2m ago", url: "/api/build" },
    port: 8001,
    custom: { region: "us-east-1", workers: "4 active" },
  };
}

describe("renderSegments", () => {
  let wrapper;
  let lastTickerTimerId = null;

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

  /** Render helper that tracks ticker for cleanup. */
  function render(data) {
    const result = renderSegments(data, wrapper);
    lastTickerTimerId = result.tickerTimerId;
    return result;
  }

  it("full data renders all segments in correct order", () => {
    render(fullData());
    const order = getSegmentOrder(wrapper);
    expect(order).toEqual([
      "app-name",
      "environment",
      "branch",
      "sha",
      "commit-date",
      "uptime",
      "deploy-age",
      "tests",
      "build",
      "port",
      "custom-region",
      "custom-workers",
    ]);
  });

  it("each segment has correct data-segment attribute", () => {
    render(fullData());
    const expected = [
      "app-name", "environment", "branch", "sha", "commit-date",
      "uptime", "deploy-age", "tests", "build", "port",
      "custom-region", "custom-workers",
    ];
    for (const name of expected) {
      expect(wrapper.querySelector(`[data-segment='${name}']`)).not.toBeNull();
    }
  });

  it("canonical segment order verified by data-segment attribute sequence", () => {
    render(fullData());
    const order = getSegmentOrder(wrapper);
    const canonical = [
      "app-name", "environment", "branch", "sha", "commit-date",
      "uptime", "deploy-age", "tests", "build", "port",
    ];

    for (let i = 0; i < canonical.length - 1; i++) {
      expect(order.indexOf(canonical[i])).toBeLessThan(
        order.indexOf(canonical[i + 1]),
      );
    }
  });

  it("minimal data (sha + branch only) renders just those two", () => {
    render({ sha: "abc1234", branch: "dev" });
    expect(getSegmentOrder(wrapper)).toEqual(["branch", "sha"]);
  });

  it("missing optional fields are skipped (no empty spans)", () => {
    render({ sha: "abc1234" });
    expect(getSegmentOrder(wrapper)).toEqual(["sha"]);
    const segments = wrapper.querySelectorAll("[data-segment]");
    for (const seg of segments) {
      expect(seg.textContent).not.toBe("");
    }
  });

  it.each([
    ["HEAD", "branch = 'HEAD'"],
    [null, "branch = null"],
    ["", "branch = ''"],
  ])("branch hidden when value is %s (%s)", (branch) => {
    render({ sha: "abc", branch });
    expect(wrapper.querySelector("[data-segment='branch']")).toBeNull();
  });

  it("valid branch is shown", () => {
    render({ sha: "abc", branch: "feature/login" });
    const el = wrapper.querySelector("[data-segment='branch']");
    expect(el).not.toBeNull();
    expect(el.textContent).toBe("feature/login");
  });

  it("commit_date is converted to local time", () => {
    render({ sha: "abc", commit_date: "2026-02-13T14:25:00Z" });
    const el = wrapper.querySelector("[data-segment='commit-date']");
    expect(el).not.toBeNull();
    expect(el.textContent).not.toBe("2026-02-13T14:25:00Z");
    expect(el.textContent.length).toBeGreaterThan(0);
  });

  it("server_started produces uptime string via formatUptime", () => {
    render({ sha: "abc", server_started: "2026-02-13T12:00:00Z" });
    const el = wrapper.querySelector("[data-segment='uptime']");
    expect(el).not.toBeNull();
    expect(el.textContent).toBe("up 2h 30m");
  });

  it("deployed_at produces deploy-age string via formatDeployAge", () => {
    render({ sha: "abc", deployed_at: "2026-02-13T10:00:00Z" });
    const el = wrapper.querySelector("[data-segment='deploy-age']");
    expect(el).not.toBeNull();
    expect(el.textContent).toBe("deployed 4h 30m ago");
  });

  it("both server_started and deployed_at present renders both segments", () => {
    render({
      sha: "abc",
      server_started: "2026-02-13T12:00:00Z",
      deployed_at: "2026-02-13T10:00:00Z",
    });
    expect(wrapper.querySelector("[data-segment='uptime']")).not.toBeNull();
    expect(wrapper.querySelector("[data-segment='deploy-age']")).not.toBeNull();
  });

  it("neither server_started nor deployed_at renders no time segments", () => {
    render({ sha: "abc" });
    expect(wrapper.querySelector("[data-segment='uptime']")).toBeNull();
    expect(wrapper.querySelector("[data-segment='deploy-age']")).toBeNull();
  });

  it.each([
    ["pass", "tests", "\u{1F7E2}"],
    ["fresh", "build", "\u{1F7E2}"],
    ["fail", "tests", "\u{1F534}"],
    ["stale", "build", "\u{1F534}"],
    ["running", "tests", "\u{1F7E1}"],
    ["building", "build", "\u{1F7E1}"],
    ["idle", "tests", "\u26AA"],
    ["unknown-thing", "tests", "\u26AA"],
  ])("status dot for %s on %s segment is correct", (status, field, dot) => {
    const data = { sha: "abc", [field]: { status } };
    render(data);
    const el = wrapper.querySelector(`[data-segment='${field}']`);
    expect(el.textContent).toContain(dot);
  });

  it.each(["tests", "build"])(
    "%s.url present makes segment a clickable <a>",
    (field) => {
      const statusVal = field === "tests" ? "pass" : "fresh";
      const data = { sha: "abc", [field]: { status: statusVal, url: `/api/${field}` } };
      render(data);
      const el = wrapper.querySelector(`[data-segment='${field}']`);
      expect(el.tagName).toBe("A");
      expect(el.getAttribute("target")).toBe("_blank");
      expect(el.getAttribute("rel")).toBe("noopener");
      expect(el.href).toContain(`/api/${field}`);
    },
  );

  it.each(["tests", "build"])(
    "%s.url absent makes segment a <span>",
    (field) => {
      const statusVal = field === "tests" ? "pass" : "fresh";
      const data = { sha: "abc", [field]: { status: statusVal } };
      render(data);
      const el = wrapper.querySelector(`[data-segment='${field}']`);
      expect(el.tagName).toBe("SPAN");
    },
  );

  it("javascript: URL in tests.url falls back to <span>", () => {
    render({
      sha: "abc",
      tests: { status: "pass", url: "javascript:alert(1)" },
    });
    const el = wrapper.querySelector("[data-segment='tests']");
    expect(el.tagName).toBe("SPAN");
  });

  it("custom fields render in alphabetical key order", () => {
    render({
      sha: "abc",
      custom: { zulu: "last", alpha: "first", mike: "middle" },
    });
    const customSegments = getSegmentOrder(wrapper).filter((s) =>
      s.startsWith("custom-"),
    );
    expect(customSegments).toEqual([
      "custom-alpha",
      "custom-mike",
      "custom-zulu",
    ]);
  });

  it("custom fields have correct data-segment attributes", () => {
    render({ sha: "abc", custom: { region: "us-east-1" } });
    const el = wrapper.querySelector("[data-segment='custom-region']");
    expect(el).not.toBeNull();
    expect(el.textContent).toBe("us-east-1");
  });

  it("non-string custom values are ignored", () => {
    render({
      sha: "abc",
      custom: { valid: "yes", number: 42, bool: true, obj: {} },
    });
    const customSegments = getSegmentOrder(wrapper).filter((s) =>
      s.startsWith("custom-"),
    );
    expect(customSegments).toEqual(["custom-valid"]);
  });

  it("empty custom object produces no custom segments", () => {
    render({ sha: "abc", custom: {} });
    const customSegments = getSegmentOrder(wrapper).filter((s) =>
      s.startsWith("custom-"),
    );
    expect(customSegments).toEqual([]);
  });

  it("XSS in branch value is escaped via textContent", () => {
    const xss = '<script>alert("xss")</script>';
    render({ sha: "abc", branch: xss });
    const el = wrapper.querySelector("[data-segment='branch']");
    expect(el.textContent).toBe(xss);
    expect(el.innerHTML).not.toContain("<script>");
  });

  it("XSS in custom values is escaped via textContent", () => {
    const xss = '<img onerror="alert(1)" src=x>';
    render({ sha: "abc", custom: { evil: xss } });
    const el = wrapper.querySelector("[data-segment='custom-evil']");
    expect(el.textContent).toBe(xss);
    expect(el.innerHTML).not.toContain("<img");
  });

  it("tests with summary renders dot + summary text", () => {
    render({ sha: "abc", tests: { status: "pass", summary: "1.1M passed" } });
    const el = wrapper.querySelector("[data-segment='tests']");
    expect(el.textContent).toBe("\u{1F7E2} 1.1M passed");
  });

  it("build with summary renders dot + summary text", () => {
    render({ sha: "abc", build: { status: "fresh", summary: "built 2m ago" } });
    const el = wrapper.querySelector("[data-segment='build']");
    expect(el.textContent).toBe("\u{1F7E2} built 2m ago");
  });

  it("sha segment gets bb-sha-color class when shaColor is auto", () => {
    renderSegments({ sha: "a1b2c3d", sha_full: "a1b2c3d4e5f6" }, wrapper, { shaColor: "auto" });
    const el = wrapper.querySelector("[data-segment='sha']");
    expect(el.classList.contains("bb-sha-color")).toBe(true);
    expect(el.style.getPropertyValue("--sha-color")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("sha segment does not get bb-sha-color class when shaColor is off", () => {
    renderSegments({ sha: "a1b2c3d", sha_full: "a1b2c3d4e5f6" }, wrapper, { shaColor: "off" });
    const el = wrapper.querySelector("[data-segment='sha']");
    expect(el.classList.contains("bb-sha-color")).toBe(false);
  });

  it("sha color uses sha_full for deriving color", () => {
    renderSegments({ sha: "a1b2c3d", sha_full: "ffaabb1234567890" }, wrapper, { shaColor: "auto" });
    const el = wrapper.querySelector("[data-segment='sha']");
    expect(el.style.getPropertyValue("--sha-color")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("sha color adjusts for light theme", () => {
    renderSegments({ sha: "a1b2c3d", sha_full: "a1b2c3d4e5f6" }, wrapper, { shaColor: "auto", theme: "light" });
    const el = wrapper.querySelector("[data-segment='sha']");
    expect(el.classList.contains("bb-sha-color")).toBe(true);
  });

  it("sha color not applied when sha too short for color derivation", () => {
    renderSegments({ sha: "abc" }, wrapper, { shaColor: "auto" });
    const el = wrapper.querySelector("[data-segment='sha']");
    expect(el.classList.contains("bb-sha-color")).toBe(false);
  });
});

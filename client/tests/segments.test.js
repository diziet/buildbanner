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

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-13T14:30:00Z"));
    wrapper = document.createElement("div");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("full data renders all segments in correct order", () => {
    const { tickerTimerId } = renderSegments(fullData(), {}, wrapper);
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
    if (tickerTimerId) clearInterval(tickerTimerId);
  });

  it("each segment has correct data-segment attribute", () => {
    const { tickerTimerId } = renderSegments(fullData(), {}, wrapper);
    expect(wrapper.querySelector("[data-segment='app-name']")).not.toBeNull();
    expect(wrapper.querySelector("[data-segment='environment']")).not.toBeNull();
    expect(wrapper.querySelector("[data-segment='branch']")).not.toBeNull();
    expect(wrapper.querySelector("[data-segment='sha']")).not.toBeNull();
    expect(wrapper.querySelector("[data-segment='commit-date']")).not.toBeNull();
    expect(wrapper.querySelector("[data-segment='uptime']")).not.toBeNull();
    expect(wrapper.querySelector("[data-segment='deploy-age']")).not.toBeNull();
    expect(wrapper.querySelector("[data-segment='tests']")).not.toBeNull();
    expect(wrapper.querySelector("[data-segment='build']")).not.toBeNull();
    expect(wrapper.querySelector("[data-segment='port']")).not.toBeNull();
    expect(wrapper.querySelector("[data-segment='custom-region']")).not.toBeNull();
    expect(wrapper.querySelector("[data-segment='custom-workers']")).not.toBeNull();
    if (tickerTimerId) clearInterval(tickerTimerId);
  });

  it("canonical segment order verified by data-segment attribute sequence", () => {
    const { tickerTimerId } = renderSegments(fullData(), {}, wrapper);
    const order = getSegmentOrder(wrapper);
    const appIdx = order.indexOf("app-name");
    const envIdx = order.indexOf("environment");
    const branchIdx = order.indexOf("branch");
    const shaIdx = order.indexOf("sha");
    const dateIdx = order.indexOf("commit-date");
    const uptimeIdx = order.indexOf("uptime");
    const deployIdx = order.indexOf("deploy-age");
    const testsIdx = order.indexOf("tests");
    const buildIdx = order.indexOf("build");
    const portIdx = order.indexOf("port");

    expect(appIdx).toBeLessThan(envIdx);
    expect(envIdx).toBeLessThan(branchIdx);
    expect(branchIdx).toBeLessThan(shaIdx);
    expect(shaIdx).toBeLessThan(dateIdx);
    expect(dateIdx).toBeLessThan(uptimeIdx);
    expect(uptimeIdx).toBeLessThan(deployIdx);
    expect(deployIdx).toBeLessThan(testsIdx);
    expect(testsIdx).toBeLessThan(buildIdx);
    expect(buildIdx).toBeLessThan(portIdx);
    if (tickerTimerId) clearInterval(tickerTimerId);
  });

  it("minimal data (sha + branch only) renders just those two", () => {
    renderSegments({ sha: "abc1234", branch: "dev" }, {}, wrapper);
    const order = getSegmentOrder(wrapper);
    expect(order).toEqual(["branch", "sha"]);
  });

  it("missing optional fields are skipped (no empty spans)", () => {
    renderSegments({ sha: "abc1234" }, {}, wrapper);
    const order = getSegmentOrder(wrapper);
    expect(order).toEqual(["sha"]);
    // No empty spans — every child with data-segment has content
    const segments = wrapper.querySelectorAll("[data-segment]");
    for (const seg of segments) {
      expect(seg.textContent).not.toBe("");
    }
  });

  it("branch = 'HEAD' is hidden", () => {
    renderSegments({ sha: "abc", branch: "HEAD" }, {}, wrapper);
    expect(wrapper.querySelector("[data-segment='branch']")).toBeNull();
  });

  it("branch = null is hidden", () => {
    renderSegments({ sha: "abc", branch: null }, {}, wrapper);
    expect(wrapper.querySelector("[data-segment='branch']")).toBeNull();
  });

  it("branch = '' is hidden", () => {
    renderSegments({ sha: "abc", branch: "" }, {}, wrapper);
    expect(wrapper.querySelector("[data-segment='branch']")).toBeNull();
  });

  it("valid branch is shown", () => {
    renderSegments({ sha: "abc", branch: "feature/login" }, {}, wrapper);
    const el = wrapper.querySelector("[data-segment='branch']");
    expect(el).not.toBeNull();
    expect(el.textContent).toBe("feature/login");
  });

  it("commit_date is converted to local time", () => {
    renderSegments(
      { sha: "abc", commit_date: "2026-02-13T14:25:00Z" },
      {},
      wrapper,
    );
    const el = wrapper.querySelector("[data-segment='commit-date']");
    expect(el).not.toBeNull();
    // Should be a local time string, not the raw ISO
    expect(el.textContent).not.toBe("2026-02-13T14:25:00Z");
    expect(el.textContent.length).toBeGreaterThan(0);
  });

  it("server_started produces uptime string via formatUptime", () => {
    renderSegments(
      { sha: "abc", server_started: "2026-02-13T12:00:00Z" },
      {},
      wrapper,
    );
    const el = wrapper.querySelector("[data-segment='uptime']");
    expect(el).not.toBeNull();
    expect(el.textContent).toMatch(/^up /);
    expect(el.textContent).toBe("up 2h 30m");
  });

  it("deployed_at produces deploy-age string via formatDeployAge", () => {
    renderSegments(
      { sha: "abc", deployed_at: "2026-02-13T10:00:00Z" },
      {},
      wrapper,
    );
    const el = wrapper.querySelector("[data-segment='deploy-age']");
    expect(el).not.toBeNull();
    expect(el.textContent).toMatch(/^deployed .+ ago$/);
    expect(el.textContent).toBe("deployed 4h 30m ago");
  });

  it("both server_started and deployed_at present renders both segments", () => {
    const { tickerTimerId } = renderSegments(
      {
        sha: "abc",
        server_started: "2026-02-13T12:00:00Z",
        deployed_at: "2026-02-13T10:00:00Z",
      },
      {},
      wrapper,
    );
    expect(wrapper.querySelector("[data-segment='uptime']")).not.toBeNull();
    expect(wrapper.querySelector("[data-segment='deploy-age']")).not.toBeNull();
    if (tickerTimerId) clearInterval(tickerTimerId);
  });

  it("neither server_started nor deployed_at renders no time segments", () => {
    renderSegments({ sha: "abc" }, {}, wrapper);
    expect(wrapper.querySelector("[data-segment='uptime']")).toBeNull();
    expect(wrapper.querySelector("[data-segment='deploy-age']")).toBeNull();
  });

  it("status dot is green for pass", () => {
    renderSegments(
      { sha: "abc", tests: { status: "pass" } },
      {},
      wrapper,
    );
    const el = wrapper.querySelector("[data-segment='tests']");
    expect(el.textContent).toContain("\u{1F7E2}");
  });

  it("status dot is green for fresh", () => {
    renderSegments(
      { sha: "abc", build: { status: "fresh" } },
      {},
      wrapper,
    );
    const el = wrapper.querySelector("[data-segment='build']");
    expect(el.textContent).toContain("\u{1F7E2}");
  });

  it("status dot is red for fail", () => {
    renderSegments(
      { sha: "abc", tests: { status: "fail" } },
      {},
      wrapper,
    );
    const el = wrapper.querySelector("[data-segment='tests']");
    expect(el.textContent).toContain("\u{1F534}");
  });

  it("status dot is red for stale", () => {
    renderSegments(
      { sha: "abc", build: { status: "stale" } },
      {},
      wrapper,
    );
    const el = wrapper.querySelector("[data-segment='build']");
    expect(el.textContent).toContain("\u{1F534}");
  });

  it("status dot is yellow for running", () => {
    renderSegments(
      { sha: "abc", tests: { status: "running" } },
      {},
      wrapper,
    );
    const el = wrapper.querySelector("[data-segment='tests']");
    expect(el.textContent).toContain("\u{1F7E1}");
  });

  it("status dot is yellow for building", () => {
    renderSegments(
      { sha: "abc", build: { status: "building" } },
      {},
      wrapper,
    );
    const el = wrapper.querySelector("[data-segment='build']");
    expect(el.textContent).toContain("\u{1F7E1}");
  });

  it("status dot is white for idle", () => {
    renderSegments(
      { sha: "abc", tests: { status: "idle" } },
      {},
      wrapper,
    );
    const el = wrapper.querySelector("[data-segment='tests']");
    expect(el.textContent).toContain("\u26AA");
  });

  it("status dot is white for unknown status", () => {
    renderSegments(
      { sha: "abc", tests: { status: "unknown-thing" } },
      {},
      wrapper,
    );
    const el = wrapper.querySelector("[data-segment='tests']");
    expect(el.textContent).toContain("\u26AA");
  });

  it("tests.url present makes tests segment a clickable <a>", () => {
    renderSegments(
      { sha: "abc", tests: { status: "pass", url: "/api/tests" } },
      {},
      wrapper,
    );
    const el = wrapper.querySelector("[data-segment='tests']");
    expect(el.tagName).toBe("A");
    expect(el.getAttribute("target")).toBe("_blank");
    expect(el.getAttribute("rel")).toBe("noopener");
    expect(el.href).toContain("/api/tests");
  });

  it("tests.url absent makes tests segment a <span>", () => {
    renderSegments(
      { sha: "abc", tests: { status: "pass" } },
      {},
      wrapper,
    );
    const el = wrapper.querySelector("[data-segment='tests']");
    expect(el.tagName).toBe("SPAN");
  });

  it("build.url present makes build segment a clickable <a>", () => {
    renderSegments(
      { sha: "abc", build: { status: "fresh", url: "/api/build" } },
      {},
      wrapper,
    );
    const el = wrapper.querySelector("[data-segment='build']");
    expect(el.tagName).toBe("A");
    expect(el.getAttribute("target")).toBe("_blank");
    expect(el.getAttribute("rel")).toBe("noopener");
  });

  it("build.url absent makes build segment a <span>", () => {
    renderSegments(
      { sha: "abc", build: { status: "fresh" } },
      {},
      wrapper,
    );
    const el = wrapper.querySelector("[data-segment='build']");
    expect(el.tagName).toBe("SPAN");
  });

  it("custom fields render in alphabetical key order", () => {
    renderSegments(
      {
        sha: "abc",
        custom: { zulu: "last", alpha: "first", mike: "middle" },
      },
      {},
      wrapper,
    );
    const order = getSegmentOrder(wrapper);
    const customSegments = order.filter((s) => s.startsWith("custom-"));
    expect(customSegments).toEqual([
      "custom-alpha",
      "custom-mike",
      "custom-zulu",
    ]);
  });

  it("custom fields have correct data-segment attributes", () => {
    renderSegments(
      { sha: "abc", custom: { region: "us-east-1" } },
      {},
      wrapper,
    );
    const el = wrapper.querySelector("[data-segment='custom-region']");
    expect(el).not.toBeNull();
    expect(el.textContent).toBe("us-east-1");
  });

  it("non-string custom values are ignored", () => {
    renderSegments(
      {
        sha: "abc",
        custom: { valid: "yes", number: 42, bool: true, obj: {} },
      },
      {},
      wrapper,
    );
    const customSegments = getSegmentOrder(wrapper).filter((s) =>
      s.startsWith("custom-"),
    );
    expect(customSegments).toEqual(["custom-valid"]);
  });

  it("empty custom object produces no custom segments", () => {
    renderSegments({ sha: "abc", custom: {} }, {}, wrapper);
    const customSegments = getSegmentOrder(wrapper).filter((s) =>
      s.startsWith("custom-"),
    );
    expect(customSegments).toEqual([]);
  });

  it("XSS in branch value is escaped via textContent", () => {
    const xss = '<script>alert("xss")</script>';
    renderSegments({ sha: "abc", branch: xss }, {}, wrapper);
    const el = wrapper.querySelector("[data-segment='branch']");
    expect(el.textContent).toBe(xss);
    expect(el.innerHTML).not.toContain("<script>");
  });

  it("XSS in custom values is escaped via textContent", () => {
    const xss = '<img onerror="alert(1)" src=x>';
    renderSegments(
      { sha: "abc", custom: { evil: xss } },
      {},
      wrapper,
    );
    const el = wrapper.querySelector("[data-segment='custom-evil']");
    expect(el.textContent).toBe(xss);
    expect(el.innerHTML).not.toContain("<img");
  });

  it("tests with summary renders dot + summary text", () => {
    renderSegments(
      { sha: "abc", tests: { status: "pass", summary: "1.1M passed" } },
      {},
      wrapper,
    );
    const el = wrapper.querySelector("[data-segment='tests']");
    expect(el.textContent).toBe("\u{1F7E2} 1.1M passed");
  });

  it("build with summary renders dot + summary text", () => {
    renderSegments(
      { sha: "abc", build: { status: "fresh", summary: "built 2m ago" } },
      {},
      wrapper,
    );
    const el = wrapper.querySelector("[data-segment='build']");
    expect(el.textContent).toBe("\u{1F7E2} built 2m ago");
  });
});

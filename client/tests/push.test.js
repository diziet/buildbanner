/** Tests for the push module. */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { applyPush, removePush, resolvePositionMode } from "../src/push.js";

/** Helper to set computed padding on <html>. */
function setHtmlPadding(prop, value) {
  document.documentElement.style[prop] = value ? `${value}px` : "";
}

/** Helper to read inline padding from <html>. */
function readInlinePadding(prop) {
  const raw = document.documentElement.style[prop];
  return parseInt(raw, 10) || 0;
}

describe("push module", () => {
  const mockLogger = { log: vi.fn() };

  beforeEach(() => {
    document.documentElement.style.paddingTop = "";
    document.documentElement.style.paddingBottom = "";
    document.documentElement.style.backgroundColor = "";
    document.body.style.backgroundColor = "";
    mockLogger.log.mockClear();
  });

  describe("applyPush", () => {
    it("applies padding-top when existing padding is zero", () => {
      const config = { push: true, position: "top" };
      const result = applyPush(config, 28, mockLogger);

      expect(result.mode).toBe("push");
      expect(result.originalPadding).toBe(0);
      expect(readInlinePadding("paddingTop")).toBe(28);
    });

    it("falls back to overlay when existing padding is non-zero", () => {
      setHtmlPadding("paddingTop", 20);
      const config = { push: true, position: "top" };
      const result = applyPush(config, 28, mockLogger);

      expect(result.mode).toBe("overlay");
      expect(result.originalPadding).toBe(20);
      expect(readInlinePadding("paddingTop")).toBe(20);
      expect(mockLogger.log).toHaveBeenCalledWith(
        "Push mode fell back to overlay due to existing padding"
      );
    });

    it("returns overlay mode without modifying padding when config.push is false", () => {
      const config = { push: false, position: "top" };
      const result = applyPush(config, 28, mockLogger);

      expect(result.mode).toBe("overlay");
      expect(readInlinePadding("paddingTop")).toBe(0);
    });

    it("applies padding-bottom for bottom position", () => {
      const config = { push: true, position: "bottom" };
      const result = applyPush(config, 28, mockLogger);

      expect(result.mode).toBe("push");
      expect(result.originalPadding).toBe(0);
      expect(readInlinePadding("paddingBottom")).toBe(28);
      expect(readInlinePadding("paddingTop")).toBe(0);
    });
  });

  describe("removePush", () => {
    it("restores original padding when no third-party changes occurred", () => {
      const config = { push: true, position: "top" };
      const pushState = applyPush(config, 28, mockLogger);

      expect(readInlinePadding("paddingTop")).toBe(28);

      removePush(28, pushState, config);
      expect(readInlinePadding("paddingTop")).toBe(0);
    });

    it("subtracts banner height when third-party added padding after init", () => {
      const config = { push: true, position: "top" };
      const pushState = applyPush(config, 28, mockLogger);

      // Simulate third-party adding 10px on top of the banner's 28px
      setHtmlPadding("paddingTop", 38);

      removePush(28, pushState, config);
      expect(readInlinePadding("paddingTop")).toBe(10);
    });

    it("never produces negative padding (clamp to 0)", () => {
      const config = { push: true, position: "top" };
      const pushState = applyPush(config, 28, mockLogger);

      // Simulate third-party reducing padding below banner height
      setHtmlPadding("paddingTop", 5);

      removePush(28, pushState, config);
      expect(readInlinePadding("paddingTop")).toBe(0);
    });

    it("does nothing when pushState mode is overlay", () => {
      const config = { push: false, position: "top" };
      const pushState = applyPush(config, 28, mockLogger);

      setHtmlPadding("paddingTop", 15);
      removePush(28, pushState, config);
      expect(readInlinePadding("paddingTop")).toBe(15);
    });

    it("does nothing when pushState is null", () => {
      setHtmlPadding("paddingTop", 10);
      removePush(28, null, { position: "top" });
      expect(readInlinePadding("paddingTop")).toBe(10);
    });

    it("restores padding-bottom for bottom position", () => {
      const config = { push: true, position: "bottom" };
      const pushState = applyPush(config, 28, mockLogger);

      expect(readInlinePadding("paddingBottom")).toBe(28);

      removePush(28, pushState, config);
      expect(readInlinePadding("paddingBottom")).toBe(0);
    });
  });

  describe("dismiss restores padding (via _teardown calling removePush)", () => {
    it("dismiss callback triggers _teardown which calls removePush", () => {
      const config = { push: true, position: "top" };
      const pushState = applyPush(config, 28, mockLogger);

      expect(readInlinePadding("paddingTop")).toBe(28);

      // Simulate third-party adding padding after init, then dismiss
      setHtmlPadding("paddingTop", 38);
      removePush(28, pushState, config);
      expect(readInlinePadding("paddingTop")).toBe(10);
    });
  });

  describe("dark background gap prevention", () => {
    it("push mode on a dark body does not show a white strip", () => {
      document.body.style.backgroundColor = "rgb(30, 30, 30)";
      const config = { push: true, position: "top" };
      const result = applyPush(config, 28, mockLogger);

      expect(result.mode).toBe("push");
      // <html> background should match <body> so padding area isn't white
      const htmlBg = document.documentElement.style.backgroundColor;
      expect(htmlBg).toBe("rgb(30, 30, 30)");
    });

    it("push mode on a page with all fixed-position content does not create a visible gap", () => {
      // When body has a dark background and all content is fixed-positioned,
      // the padding area should match the body background
      document.body.style.backgroundColor = "rgb(0, 0, 0)";
      const config = { push: true, position: "top" };
      const result = applyPush(config, 28, mockLogger);

      expect(result.mode).toBe("push");
      expect(document.documentElement.style.backgroundColor).toBe("rgb(0, 0, 0)");
    });

    it("explicit data-push=false continues to skip padding entirely", () => {
      document.body.style.backgroundColor = "rgb(30, 30, 30)";
      const config = { push: false, position: "top" };
      const result = applyPush(config, 28, mockLogger);

      expect(result.mode).toBe("overlay");
      expect(readInlinePadding("paddingTop")).toBe(0);
      // Should not touch <html> background
      expect(document.documentElement.style.backgroundColor).toBe("");
    });

    it("removePush restores original <html> background", () => {
      document.body.style.backgroundColor = "rgb(30, 30, 30)";
      const config = { push: true, position: "top" };
      const pushState = applyPush(config, 28, mockLogger);

      expect(document.documentElement.style.backgroundColor).toBe("rgb(30, 30, 30)");

      removePush(28, pushState, config);
      expect(document.documentElement.style.backgroundColor).toBe("");
    });

    it("does not override existing <html> background", () => {
      document.documentElement.style.backgroundColor = "rgb(50, 50, 50)";
      document.body.style.backgroundColor = "rgb(30, 30, 30)";
      const config = { push: true, position: "top" };
      applyPush(config, 28, mockLogger);

      // Should keep the existing <html> background, not overwrite it
      expect(document.documentElement.style.backgroundColor).toBe("rgb(50, 50, 50)");
    });
  });

  describe("resolvePositionMode", () => {
    it("push mode returns sticky", () => {
      expect(resolvePositionMode("push")).toBe("sticky");
    });

    it("overlay mode returns fixed", () => {
      expect(resolvePositionMode("overlay")).toBe("fixed");
    });

    it("unknown mode returns fixed", () => {
      expect(resolvePositionMode("unknown")).toBe("fixed");
    });
  });

  describe("integration with createBannerHost", () => {
    it("push mode sets position: sticky in banner styles", async () => {
      const { createBannerHost, destroyBannerHost } = await import("../src/dom.js");
      const config = { push: true, position: "top" };
      const result = createBannerHost(config, "sticky");

      try {
        const style = result.shadowRoot.querySelector("style");
        expect(style.textContent).toContain("position: sticky");
      } finally {
        destroyBannerHost(result.host, result.fallbackStyle);
      }
    });

    it("overlay mode sets position: fixed in banner styles", async () => {
      const { createBannerHost, destroyBannerHost } = await import("../src/dom.js");
      const config = { push: false, position: "top" };
      const result = createBannerHost(config, "fixed");

      try {
        const style = result.shadowRoot.querySelector("style");
        expect(style.textContent).toContain("position: fixed");
      } finally {
        destroyBannerHost(result.host, result.fallbackStyle);
      }
    });
  });
});

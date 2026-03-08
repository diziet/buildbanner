/** Tests for the DOM module. */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createBannerHost, destroyBannerHost } from "../src/dom.js";

describe("DOM module", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.querySelectorAll("style").forEach((s) => s.remove());
  });

  afterEach(() => {
    document.body.innerHTML = "";
    document.head.querySelectorAll("style").forEach((s) => s.remove());
  });

  describe("createBannerHost", () => {
    it("creates a <build-banner> element", () => {
      const { host } = createBannerHost();
      expect(host.tagName.toLowerCase()).toBe("build-banner");
    });

    it("host has data-testid='buildbanner'", () => {
      const { host } = createBannerHost();
      expect(host.getAttribute("data-testid")).toBe("buildbanner");
    });

    it("attaches shadow root", () => {
      const { shadowRoot } = createBannerHost();
      expect(shadowRoot).not.toBeNull();
      expect(shadowRoot.mode).toBe("open");
    });

    it("wrapper has all: initial style", () => {
      const { shadowRoot } = createBannerHost();
      const style = shadowRoot.querySelector("style");
      expect(style.textContent).toContain("all: initial");
    });

    it("wrapper has role='toolbar'", () => {
      const { wrapper } = createBannerHost();
      expect(wrapper.getAttribute("role")).toBe("toolbar");
    });

    it("wrapper has aria-label set", () => {
      const { wrapper } = createBannerHost();
      expect(wrapper.getAttribute("aria-label")).toBe("Build information banner");
    });

    it("height matches config", () => {
      const { shadowRoot } = createBannerHost({ height: 36 });
      const style = shadowRoot.querySelector("style");
      expect(style.textContent).toContain("height: 36px");
    });

    it("z-index matches config", () => {
      const { shadowRoot } = createBannerHost({ zIndex: 123456 });
      const style = shadowRoot.querySelector("style");
      expect(style.textContent).toContain("z-index: 123456");
    });

    it("z-index defaults to 999999", () => {
      const { shadowRoot } = createBannerHost();
      const style = shadowRoot.querySelector("style");
      expect(style.textContent).toContain("z-index: 999999");
    });

    it("non-numeric height falls back to default", () => {
      const { shadowRoot } = createBannerHost({ height: "malicious; color: red" });
      const style = shadowRoot.querySelector("style");
      expect(style.textContent).toContain("height: 28px");
    });

    it("non-numeric zIndex falls back to default", () => {
      const { shadowRoot } = createBannerHost({ zIndex: "evil; background: red" });
      const style = shadowRoot.querySelector("style");
      expect(style.textContent).toContain("z-index: 999999");
    });

    it("position is sticky", () => {
      const { shadowRoot } = createBannerHost();
      const style = shadowRoot.querySelector("style");
      expect(style.textContent).toContain("position: sticky");
    });

    it("overflow is hidden", () => {
      const { shadowRoot } = createBannerHost();
      const style = shadowRoot.querySelector("style");
      expect(style.textContent).toContain("overflow: hidden");
    });

    it("font-family is monospace", () => {
      const { shadowRoot } = createBannerHost();
      const style = shadowRoot.querySelector("style");
      expect(style.textContent).toContain("ui-monospace");
      expect(style.textContent).toContain("Consolas");
      expect(style.textContent).toContain("monospace");
    });

    it("no <style> tag injected into document <head> in Shadow DOM path", () => {
      createBannerHost();
      const headStyles = document.head.querySelectorAll("style");
      expect(headStyles.length).toBe(0);
    });

    it("fallbackStyle is null in Shadow DOM path", () => {
      const { fallbackStyle } = createBannerHost();
      expect(fallbackStyle).toBeNull();
    });

    it("host is first child of <body> for position top", () => {
      const existing = document.createElement("div");
      document.body.appendChild(existing);

      const { host } = createBannerHost({ position: "top" });
      expect(document.body.firstChild).toBe(host);
    });

    it("host is last child of <body> for position bottom", () => {
      const existing = document.createElement("div");
      document.body.appendChild(existing);

      const { host } = createBannerHost({ position: "bottom" });
      expect(document.body.lastChild).toBe(host);
    });

    it("fallback mode creates div with correct classes when attachShadow is unavailable", () => {
      const origAttachShadow = HTMLElement.prototype.attachShadow;
      HTMLElement.prototype.attachShadow = undefined;

      try {
        const { host, shadowRoot, wrapper, fallbackStyle } = createBannerHost();
        expect(host.tagName.toLowerCase()).toBe("div");
        expect(host.className).toBe("__buildbanner-host");
        expect(shadowRoot).toBeNull();
        expect(wrapper.className).toBe("__buildbanner-wrapper");
        expect(wrapper.getAttribute("role")).toBe("toolbar");

        expect(fallbackStyle).not.toBeNull();
        const headStyles = document.head.querySelectorAll("style");
        expect(headStyles.length).toBe(1);
        expect(headStyles[0].textContent).toContain("__buildbanner-wrapper");
      } finally {
        HTMLElement.prototype.attachShadow = origAttachShadow;
      }
    });

    it("returns null when document.body is null", () => {
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      const origBody = document.body;
      Object.defineProperty(document, "body", {
        value: null,
        writable: true,
        configurable: true,
      });

      try {
        const result = createBannerHost();
        expect(result).toBeNull();
      } finally {
        Object.defineProperty(document, "body", {
          value: origBody,
          writable: true,
          configurable: true,
        });
        debugSpy.mockRestore();
      }
    });
  });

  describe("destroyBannerHost", () => {
    it("removes element from DOM", () => {
      const { host } = createBannerHost();
      expect(document.body.contains(host)).toBe(true);

      destroyBannerHost(host);
      expect(document.body.contains(host)).toBe(false);
    });

    it("removes fallback style from document head on destroy", () => {
      const origAttachShadow = HTMLElement.prototype.attachShadow;
      HTMLElement.prototype.attachShadow = undefined;

      try {
        const { host, fallbackStyle } = createBannerHost();
        expect(document.head.querySelectorAll("style").length).toBe(1);

        destroyBannerHost(host, fallbackStyle);
        expect(document.body.contains(host)).toBe(false);
        expect(document.head.querySelectorAll("style").length).toBe(0);
      } finally {
        HTMLElement.prototype.attachShadow = origAttachShadow;
      }
    });
  });
});

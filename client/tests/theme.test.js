/** Tests for the theme module. */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getThemeStyles,
  DARK_BG,
  DARK_FG,
  LIGHT_BG,
  LIGHT_FG,
} from "../src/theme.js";
import { createBannerHost, destroyBannerHost } from "../src/dom.js";

/** Parse hex color to { r, g, b } (0-255). */
function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

/** Compute relative luminance per WCAG 2.0. */
function relativeLuminance({ r, g, b }) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** Compute contrast ratio between two hex colors. */
function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hexToRgb(hex1));
  const l2 = relativeLuminance(hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Reset DOM state between tests. */
function cleanupDom() {
  document.body.innerHTML = "";
  document.head.querySelectorAll("style").forEach((s) => s.remove());
}

describe("theme module", () => {
  describe("getThemeStyles", () => {
    it("dark theme applies dark background", () => {
      const css = getThemeStyles("dark");
      expect(css).toContain(DARK_BG);
    });

    it("dark theme applies dark foreground color", () => {
      const css = getThemeStyles("dark");
      expect(css).toContain(DARK_FG);
    });

    it("light theme applies light background", () => {
      const css = getThemeStyles("light");
      expect(css).toContain(LIGHT_BG);
    });

    it("light theme applies light foreground color", () => {
      const css = getThemeStyles("light");
      expect(css).toContain(LIGHT_FG);
    });

    it("auto theme includes prefers-color-scheme media query", () => {
      const css = getThemeStyles("auto");
      expect(css).toContain("prefers-color-scheme");
    });

    it("auto theme includes both dark and light colors", () => {
      const css = getThemeStyles("auto");
      expect(css).toContain(DARK_BG);
      expect(css).toContain(LIGHT_BG);
    });

    it("default theme is dark", () => {
      const defaultCss = getThemeStyles("unknown");
      expect(defaultCss).toContain(DARK_BG);
      expect(defaultCss).not.toContain("prefers-color-scheme");
    });

    it("all three theme strings are valid CSS (no unclosed braces)", () => {
      for (const theme of ["dark", "light", "auto"]) {
        const css = getThemeStyles(theme);
        const opens = (css.match(/{/g) || []).length;
        const closes = (css.match(/}/g) || []).length;
        expect(opens).toBe(closes);
      }
    });

    it("exports shared font constants", () => {
      const { FONT_FAMILY, FONT_SIZE } = require("../src/theme.js");
      expect(FONT_FAMILY).toContain("ui-monospace");
      expect(FONT_FAMILY).toContain("Consolas");
      expect(FONT_FAMILY).toContain("monospace");
      expect(FONT_SIZE).toBe("12px");
    });
  });

  describe("getThemeStyles auto with data-theme", () => {
    afterEach(() => {
      document.documentElement.removeAttribute("data-theme");
    });

    it("auto uses dark colors when data-theme is dark", () => {
      document.documentElement.setAttribute("data-theme", "dark");
      const css = getThemeStyles("auto");
      expect(css).toContain(DARK_BG);
      expect(css).not.toContain("prefers-color-scheme");
    });

    it("auto uses light colors when data-theme is light", () => {
      document.documentElement.setAttribute("data-theme", "light");
      const css = getThemeStyles("auto");
      expect(css).toContain(LIGHT_BG);
      expect(css).not.toContain("prefers-color-scheme");
    });

    it("auto falls back to prefers-color-scheme when data-theme absent", () => {
      const css = getThemeStyles("auto");
      expect(css).toContain("prefers-color-scheme");
    });

    it("auto ignores unrecognized data-theme values", () => {
      document.documentElement.setAttribute("data-theme", "high-contrast");
      const css = getThemeStyles("auto");
      expect(css).toContain("prefers-color-scheme");
    });
  });

  describe("WCAG contrast ratios", () => {
    it("dark theme meets WCAG AA 4.5:1 contrast ratio", () => {
      const ratio = contrastRatio(DARK_BG, DARK_FG);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("light theme meets WCAG AA 4.5:1 contrast ratio", () => {
      const ratio = contrastRatio(LIGHT_BG, LIGHT_FG);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe("DOM integration", () => {
    beforeEach(cleanupDom);
    afterEach(cleanupDom);

    it("dark theme config injects dark colors into shadow style", () => {
      const { shadowRoot, host } = createBannerHost({ theme: "dark" });
      const style = shadowRoot.querySelector("style");
      expect(style).not.toBeNull();
      expect(style.textContent).toContain(DARK_BG);
      destroyBannerHost(host);
    });

    it("light theme config injects light colors into shadow style", () => {
      const { shadowRoot, host } = createBannerHost({ theme: "light" });
      const style = shadowRoot.querySelector("style");
      expect(style).not.toBeNull();
      expect(style.textContent).toContain(LIGHT_BG);
      destroyBannerHost(host);
    });

    it("auto theme config includes prefers-color-scheme in shadow style", () => {
      const { shadowRoot, host } = createBannerHost({ theme: "auto" });
      const style = shadowRoot.querySelector("style");
      expect(style).not.toBeNull();
      expect(style.textContent).toContain("prefers-color-scheme");
      destroyBannerHost(host);
    });

    it("default config uses dark theme", () => {
      const { shadowRoot, host } = createBannerHost({});
      const style = shadowRoot.querySelector("style");
      expect(style).not.toBeNull();
      expect(style.textContent).toContain(DARK_BG);
      destroyBannerHost(host);
    });

    it("all themes include monospace font-family in stylesheet", () => {
      for (const theme of ["dark", "light", "auto"]) {
        cleanupDom();
        const { shadowRoot, host } = createBannerHost({ theme });
        const style = shadowRoot.querySelector("style");
        expect(style).not.toBeNull();
        expect(style.textContent).toContain("ui-monospace");
        expect(style.textContent).toContain("Consolas");
        expect(style.textContent).toContain("monospace");
        destroyBannerHost(host);
      }
    });

    it("all themes include 12px font-size in stylesheet", () => {
      for (const theme of ["dark", "light", "auto"]) {
        cleanupDom();
        const { shadowRoot, host } = createBannerHost({ theme });
        const style = shadowRoot.querySelector("style");
        expect(style).not.toBeNull();
        expect(style.textContent).toContain("12px");
        destroyBannerHost(host);
      }
    });
  });
});

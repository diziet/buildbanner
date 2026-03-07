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
      const darkCss = getThemeStyles("dark");
      const defaultCss = getThemeStyles("unknown");
      // Both should contain dark colors and no light overrides
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

    it("all themes include monospace font-family", () => {
      for (const theme of ["dark", "light", "auto"]) {
        const css = getThemeStyles(theme);
        expect(css).toContain("ui-monospace");
        expect(css).toContain("Consolas");
        expect(css).toContain("monospace");
      }
    });

    it("all themes include 12px font-size", () => {
      for (const theme of ["dark", "light", "auto"]) {
        const css = getThemeStyles(theme);
        expect(css).toContain("12px");
      }
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
    beforeEach(() => {
      document.body.innerHTML = "";
      document.head.querySelectorAll("style").forEach((s) => s.remove());
    });

    afterEach(() => {
      document.body.innerHTML = "";
      document.head.querySelectorAll("style").forEach((s) => s.remove());
    });

    it("dark theme config injects dark colors into shadow style", () => {
      const { shadowRoot, host } = createBannerHost({ theme: "dark" });
      const style = shadowRoot.querySelector("style");
      expect(style.textContent).toContain(DARK_BG);
      destroyBannerHost(host);
    });

    it("light theme config injects light colors into shadow style", () => {
      const { shadowRoot, host } = createBannerHost({ theme: "light" });
      const style = shadowRoot.querySelector("style");
      expect(style.textContent).toContain(LIGHT_BG);
      destroyBannerHost(host);
    });

    it("auto theme config includes prefers-color-scheme in shadow style", () => {
      const { shadowRoot, host } = createBannerHost({ theme: "auto" });
      const style = shadowRoot.querySelector("style");
      expect(style.textContent).toContain("prefers-color-scheme");
      destroyBannerHost(host);
    });

    it("default config uses dark theme", () => {
      const { shadowRoot, host } = createBannerHost({});
      const style = shadowRoot.querySelector("style");
      expect(style.textContent).toContain(DARK_BG);
      destroyBannerHost(host);
    });
  });
});

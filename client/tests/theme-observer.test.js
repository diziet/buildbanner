/** Tests for the theme-observer module. */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { startThemeObserver } from "../src/theme-observer.js";
import { createBannerHost, destroyBannerHost } from "../src/dom.js";
import { DARK_BG, DARK_FG, LIGHT_BG, LIGHT_FG } from "../src/theme.js";

/** Reset DOM state between tests. */
function cleanupDom() {
  document.body.innerHTML = "";
  document.head.querySelectorAll("style").forEach((s) => s.remove());
  document.documentElement.removeAttribute("data-theme");
}

describe("theme-observer module", () => {
  let host;
  let shadowRoot;

  beforeEach(() => {
    cleanupDom();
    const result = createBannerHost({ theme: "auto" });
    host = result.host;
    shadowRoot = result.shadowRoot;
  });

  afterEach(() => {
    cleanupDom();
    if (host) destroyBannerHost(host);
  });

  describe("startThemeObserver", () => {
    it("returns null for non-auto themes", () => {
      expect(startThemeObserver(shadowRoot, "dark")).toBeNull();
      expect(startThemeObserver(shadowRoot, "light")).toBeNull();
    });

    it("returns null when shadowRoot is null", () => {
      expect(startThemeObserver(null, "auto")).toBeNull();
    });

    it("returns handle with stop method for auto theme", () => {
      const handle = startThemeObserver(shadowRoot, "auto");
      expect(handle).not.toBeNull();
      expect(typeof handle.stop).toBe("function");
      handle.stop();
    });

    it("applies dark override when data-theme=dark is already set", () => {
      document.documentElement.setAttribute("data-theme", "dark");
      const handle = startThemeObserver(shadowRoot, "auto");
      const overrideStyle = shadowRoot.getElementById("bb-theme-override");
      expect(overrideStyle).not.toBeNull();
      expect(overrideStyle.textContent).toContain(DARK_BG);
      handle.stop();
    });

    it("applies light override when data-theme=light is already set", () => {
      document.documentElement.setAttribute("data-theme", "light");
      const handle = startThemeObserver(shadowRoot, "auto");
      const overrideStyle = shadowRoot.getElementById("bb-theme-override");
      expect(overrideStyle).not.toBeNull();
      expect(overrideStyle.textContent).toContain(LIGHT_BG);
      handle.stop();
    });

    it("does not apply override when no data-theme is set", () => {
      const handle = startThemeObserver(shadowRoot, "auto");
      const overrideStyle = shadowRoot.getElementById("bb-theme-override");
      expect(overrideStyle).toBeNull();
      handle.stop();
    });
  });

  describe("MutationObserver reactions", () => {
    it("switches to dark when data-theme changes to dark", async () => {
      const handle = startThemeObserver(shadowRoot, "auto");
      document.documentElement.setAttribute("data-theme", "dark");

      // MutationObserver is async — flush microtasks
      await new Promise((r) => setTimeout(r, 0));

      const overrideStyle = shadowRoot.getElementById("bb-theme-override");
      expect(overrideStyle).not.toBeNull();
      expect(overrideStyle.textContent).toContain(DARK_BG);
      expect(overrideStyle.textContent).toContain(DARK_FG);
      handle.stop();
    });

    it("switches to light when data-theme changes to light", async () => {
      const handle = startThemeObserver(shadowRoot, "auto");
      document.documentElement.setAttribute("data-theme", "light");

      await new Promise((r) => setTimeout(r, 0));

      const overrideStyle = shadowRoot.getElementById("bb-theme-override");
      expect(overrideStyle).not.toBeNull();
      expect(overrideStyle.textContent).toContain(LIGHT_BG);
      expect(overrideStyle.textContent).toContain(LIGHT_FG);
      handle.stop();
    });

    it("removes override when data-theme is removed", async () => {
      document.documentElement.setAttribute("data-theme", "dark");
      const handle = startThemeObserver(shadowRoot, "auto");

      expect(shadowRoot.getElementById("bb-theme-override")).not.toBeNull();

      document.documentElement.removeAttribute("data-theme");
      await new Promise((r) => setTimeout(r, 0));

      expect(shadowRoot.getElementById("bb-theme-override")).toBeNull();
      handle.stop();
    });

    it("updates override when data-theme switches from dark to light", async () => {
      const handle = startThemeObserver(shadowRoot, "auto");

      document.documentElement.setAttribute("data-theme", "dark");
      await new Promise((r) => setTimeout(r, 0));
      expect(shadowRoot.getElementById("bb-theme-override").textContent).toContain(DARK_BG);

      document.documentElement.setAttribute("data-theme", "light");
      await new Promise((r) => setTimeout(r, 0));
      expect(shadowRoot.getElementById("bb-theme-override").textContent).toContain(LIGHT_BG);

      handle.stop();
    });

    it("ignores invalid data-theme values", async () => {
      const handle = startThemeObserver(shadowRoot, "auto");

      document.documentElement.setAttribute("data-theme", "sepia");
      await new Promise((r) => setTimeout(r, 0));

      expect(shadowRoot.getElementById("bb-theme-override")).toBeNull();
      handle.stop();
    });
  });

  describe("stop", () => {
    it("disconnects observer and removes override style", async () => {
      document.documentElement.setAttribute("data-theme", "dark");
      const handle = startThemeObserver(shadowRoot, "auto");

      expect(shadowRoot.getElementById("bb-theme-override")).not.toBeNull();
      handle.stop();
      expect(shadowRoot.getElementById("bb-theme-override")).toBeNull();
    });

    it("stops reacting to data-theme changes after stop", async () => {
      const handle = startThemeObserver(shadowRoot, "auto");
      handle.stop();

      document.documentElement.setAttribute("data-theme", "light");
      await new Promise((r) => setTimeout(r, 0));

      expect(shadowRoot.getElementById("bb-theme-override")).toBeNull();
    });
  });

  describe("case insensitivity", () => {
    it("handles uppercase data-theme=DARK", () => {
      document.documentElement.setAttribute("data-theme", "DARK");
      const handle = startThemeObserver(shadowRoot, "auto");
      const overrideStyle = shadowRoot.getElementById("bb-theme-override");
      expect(overrideStyle).not.toBeNull();
      expect(overrideStyle.textContent).toContain(DARK_BG);
      handle.stop();
    });

    it("handles mixed case data-theme=Light", () => {
      document.documentElement.setAttribute("data-theme", "Light");
      const handle = startThemeObserver(shadowRoot, "auto");
      const overrideStyle = shadowRoot.getElementById("bb-theme-override");
      expect(overrideStyle).not.toBeNull();
      expect(overrideStyle.textContent).toContain(LIGHT_BG);
      handle.stop();
    });
  });
});

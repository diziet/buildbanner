/** Theme observer — watches data-theme on <html> for runtime theme switching. */

import constants from "./style-constants.json" with { type: "json" };

const DARK_BG = constants.DARK_BG;
const DARK_FG = constants.DARK_FG;
const DARK_LINK = constants.DARK_LINK;
const LIGHT_BG = constants.LIGHT_BG;
const LIGHT_FG = constants.LIGHT_FG;
const LIGHT_LINK = constants.LIGHT_LINK;

const OVERRIDE_STYLE_ID = "bb-theme-override";

/** Build CSS variable override string for a given scheme. */
function _buildOverrideCss(scheme) {
  if (scheme === "light") {
    return `:host { --bb-bg: ${LIGHT_BG}; --bb-fg: ${LIGHT_FG}; --bb-link: ${LIGHT_LINK}; }`;
  }
  return `:host { --bb-bg: ${DARK_BG}; --bb-fg: ${DARK_FG}; --bb-link: ${DARK_LINK}; }`;
}

/** Read the current data-theme value from document.documentElement. */
function _readDataTheme() {
  if (typeof document === "undefined") return null;
  const value = document.documentElement.getAttribute("data-theme");
  if (!value) return null;
  const lower = value.toLowerCase().trim();
  if (lower === "dark" || lower === "light") return lower;
  return null;
}

/** Apply or remove the theme override style in the shadow root. */
function _applyThemeOverride(shadowRoot, scheme) {
  if (!shadowRoot) return;
  const existing = shadowRoot.getElementById(OVERRIDE_STYLE_ID);
  if (scheme) {
    const css = _buildOverrideCss(scheme);
    if (existing) {
      existing.textContent = css;
    } else {
      const style = document.createElement("style");
      style.id = OVERRIDE_STYLE_ID;
      style.textContent = css;
      shadowRoot.appendChild(style);
    }
  } else if (existing) {
    existing.remove();
  }
}

/**
 * Start observing theme changes for a banner with "auto" theme.
 * Watches data-theme on <html> and prefers-color-scheme media query.
 * Priority: data-theme > prefers-color-scheme > default (dark).
 * @param {ShadowRoot} shadowRoot - The banner's shadow root.
 * @param {string} theme - The configured theme ("dark", "light", "auto").
 * @returns {{ stop: () => void }|null} Handle to stop observing, or null if not applicable.
 */
export function startThemeObserver(shadowRoot, theme) {
  if (theme !== "auto" || !shadowRoot) return null;
  if (typeof document === "undefined") return null;

  const dataTheme = _readDataTheme();
  if (dataTheme) {
    _applyThemeOverride(shadowRoot, dataTheme);
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.attributeName === "data-theme") {
        const newTheme = _readDataTheme();
        _applyThemeOverride(shadowRoot, newTheme);
      }
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  let mediaQuery = null;
  let mediaHandler = null;

  if (typeof window !== "undefined" && window.matchMedia) {
    mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    mediaHandler = () => {
      const current = _readDataTheme();
      if (!current) {
        _applyThemeOverride(shadowRoot, null);
      }
    };
    mediaQuery.addEventListener("change", mediaHandler);
  }

  return {
    stop() {
      observer.disconnect();
      if (mediaQuery && mediaHandler) {
        mediaQuery.removeEventListener("change", mediaHandler);
      }
      const existing = shadowRoot.getElementById(OVERRIDE_STYLE_ID);
      if (existing) existing.remove();
    },
  };
}

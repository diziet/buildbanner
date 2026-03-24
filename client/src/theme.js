/** Theme module — provides dark/light/auto CSS for the banner. */

import constants from "./style-constants.json" with { type: "json" };

export const DARK_BG = constants.DARK_BG;
export const DARK_FG = constants.DARK_FG;
export const LIGHT_BG = constants.LIGHT_BG;
export const LIGHT_FG = constants.LIGHT_FG;

export const DARK_LINK = constants.DARK_LINK;
export const LIGHT_LINK = constants.LIGHT_LINK;

export const FONT_FAMILY = constants.FONT_FAMILY;
export const FONT_SIZE = constants.FONT_SIZE;

/** Read data-theme from the host document's root element. */
function _getHostDataTheme() {
  try {
    return document.documentElement.getAttribute("data-theme");
  } catch {
    return null;
  }
}

/** Build CSS variable declarations for a color scheme. */
function _colorVars(bg, fg, link) {
  return `--bb-bg: ${bg}; --bb-fg: ${fg}; --bb-link: ${link};`;
}

/**
 * Return a CSS string for the given theme.
 * @param {"dark"|"light"|"auto"} theme
 * @returns {string}
 */
export function getThemeStyles(theme) {
  if (theme === "light") {
    return `
    :host {
      ${_colorVars(LIGHT_BG, LIGHT_FG, LIGHT_LINK)}
    }`;
  }

  if (theme === "auto") {
    const hostTheme = _getHostDataTheme();
    if (hostTheme === "dark" || hostTheme === "light") {
      return getThemeStyles(hostTheme);
    }
    return `
    :host {
      ${_colorVars(DARK_BG, DARK_FG, DARK_LINK)}
    }
    @media (prefers-color-scheme: light) {
      :host {
        ${_colorVars(LIGHT_BG, LIGHT_FG, LIGHT_LINK)}
      }
    }`;
  }

  // Default: dark
  return `
    :host {
      ${_colorVars(DARK_BG, DARK_FG, DARK_LINK)}
    }`;
}

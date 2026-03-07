/** Theme module — provides dark/light/auto CSS for the banner. */

export const DARK_BG = "#1a1a2e";
export const DARK_FG = "#e0e0e0";
export const LIGHT_BG = "#f0f0f0";
export const LIGHT_FG = "#333333";

const DARK_LINK = "#6fa8dc";
const LIGHT_LINK = "#1a5dab";

export const FONT_FAMILY =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';
export const FONT_SIZE = "12px";

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

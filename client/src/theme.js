/** Theme module — provides dark/light/auto CSS for the banner. */

export const DARK_BG = "#1a1a2e";
export const DARK_FG = "#e0e0e0";
export const LIGHT_BG = "#f0f0f0";
export const LIGHT_FG = "#333333";

const DARK_LINK = "#6fa8dc";
const LIGHT_LINK = "#1a5dab";

const FONT_FAMILY =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';
const FONT_SIZE = "12px";

/** Build CSS variable declarations for a color scheme. */
function _colorVars(bg, fg, link) {
  return `--bb-bg: ${bg}; --bb-fg: ${fg}; --bb-link: ${link};`;
}

/** CSS block that applies the color variables to the wrapper. */
function _applyVars() {
  return `
    .bb-wrapper {
      background: var(--bb-bg);
      color: var(--bb-fg);
    }
    .bb-wrapper a {
      color: var(--bb-link);
    }`;
}

/** Base typography shared by all themes. */
function _baseTypography() {
  return `
    .bb-wrapper {
      font-family: ${FONT_FAMILY};
      font-size: ${FONT_SIZE};
    }`;
}

/**
 * Return a CSS string for the given theme.
 * @param {"dark"|"light"|"auto"} theme
 * @returns {string}
 */
export function getThemeStyles(theme) {
  const base = _baseTypography();

  if (theme === "light") {
    return `${base}
    :host {
      ${_colorVars(LIGHT_BG, LIGHT_FG, LIGHT_LINK)}
    }${_applyVars()}`;
  }

  if (theme === "auto") {
    return `${base}
    :host {
      ${_colorVars(DARK_BG, DARK_FG, DARK_LINK)}
    }
    @media (prefers-color-scheme: light) {
      :host {
        ${_colorVars(LIGHT_BG, LIGHT_FG, LIGHT_LINK)}
      }
    }${_applyVars()}`;
  }

  // Default: dark
  return `${base}
    :host {
      ${_colorVars(DARK_BG, DARK_FG, DARK_LINK)}
    }${_applyVars()}`;
}

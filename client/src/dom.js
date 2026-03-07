/** DOM module — creates and destroys the banner host element. */

import { createLogger } from "./logger.js";
import { getThemeStyles, FONT_FAMILY, FONT_SIZE, DARK_BG, DARK_FG } from "./theme.js";
import constants from "./style-constants.json" with { type: "json" };
export const DEFAULT_HEIGHT = constants.DEFAULT_HEIGHT;
const DEFAULT_Z_INDEX = constants.DEFAULT_Z_INDEX;
const VALID_POSITION_MODES = ["sticky", "fixed"];

/** Resolve and validate height/zIndex as safe integers. */
function _resolveStyleValues(config) {
  const height = parseInt(config.height, 10) || DEFAULT_HEIGHT;
  const zIndex = parseInt(config.zIndex, 10) || DEFAULT_Z_INDEX;
  return { height, zIndex };
}

/** Build shared CSS properties for the banner wrapper. */
function _buildWrapperCssProperties(height, zIndex, positionMode = "sticky") {
  const safePosition = VALID_POSITION_MODES.includes(positionMode) ? positionMode : "sticky";
  return `
      all: initial;
      display: flex;
      align-items: center;
      gap: 0;
      position: ${safePosition};
      top: 0;
      z-index: ${zIndex};
      height: ${height}px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: ${FONT_FAMILY};
      font-size: ${FONT_SIZE};
      line-height: ${height}px;
      color: var(--bb-fg, ${DARK_FG});
      background: var(--bb-bg, ${DARK_BG});
      padding: 0 8px;
      box-sizing: border-box;`;
}

/** Build anchor link CSS rules for a given parent selector. */
function _buildAnchorCss(parentSelector) {
  return `
    ${parentSelector} a {
      color: var(--bb-link);
      text-decoration: none;
    }
    ${parentSelector} a:hover {
      text-decoration: underline;
    }`;
}

/** Generate shadow DOM stylesheet for the banner. */
function _buildStyles(config, positionMode) {
  const { height, zIndex } = _resolveStyleValues(config);
  const theme = config.theme || "dark";

  return `${getThemeStyles(theme)}
    .bb-wrapper {${_buildWrapperCssProperties(height, zIndex, positionMode)}
    }
    .bb-clickable {
      cursor: pointer;
    }
    .bb-live-region {
      display: contents;
    }
    .bb-dismiss {
      all: unset;
      cursor: pointer;
      margin-left: auto;
      padding: 0 4px;
      color: inherit;
      font-size: 14px;
      line-height: inherit;
    }
    .bb-dismiss:focus-visible,
    .bb-wrapper a:focus-visible {
      outline: 2px solid #4da6ff;
      outline-offset: 2px;
      border-radius: 2px;
    }${_buildAnchorCss(".bb-wrapper")}
  `;
}

/** Generate fallback stylesheet for environments without Shadow DOM. */
function _buildFallbackStyles(config, positionMode) {
  const { height, zIndex } = _resolveStyleValues(config);

  return `
    .__buildbanner-host {
      all: initial;
      display: block;
    }
    .__buildbanner-wrapper {${_buildWrapperCssProperties(height, zIndex, positionMode)}
      font-weight: normal;
      font-style: normal;
      text-transform: none;
      letter-spacing: normal;
      word-spacing: normal;
      text-align: left;
      text-decoration: none;
      visibility: visible;
      opacity: 1;
      direction: ltr;
    }
    .__buildbanner-clickable {
      cursor: pointer;
    }${_buildAnchorCss(".__buildbanner-wrapper")}
  `;
}

/** Apply shared attributes to host and wrapper elements. */
function _applyCommonAttributes(host, wrapper) {
  host.setAttribute("data-testid", "buildbanner");
  wrapper.setAttribute("role", "toolbar");
  wrapper.setAttribute("aria-label", "Build information banner");
}

/**
 * Create the banner host element with Shadow DOM (or fallback).
 * @param {object} config - Banner configuration.
 * @param {"sticky"|"fixed"} positionMode - CSS position for the wrapper ("sticky" for push, "fixed" for overlay).
 * @returns {{ host: Element, shadowRoot: ShadowRoot|null, wrapper: Element, fallbackStyle: Element|null }|null}
 */
export function createBannerHost(config = {}, positionMode = "sticky") {
  const logger = createLogger(config.debug);

  if (!document.body) {
    logger.log("document.body is null — cannot create banner host");
    return null;
  }

  const hasShadow = typeof HTMLElement.prototype.attachShadow === "function";

  let host;
  let shadowRoot = null;
  let wrapper;
  let fallbackStyle = null;

  if (hasShadow) {
    host = document.createElement("build-banner");
    shadowRoot = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = _buildStyles(config, positionMode);
    shadowRoot.appendChild(style);

    wrapper = document.createElement("div");
    wrapper.className = "bb-wrapper";
    shadowRoot.appendChild(wrapper);
  } else {
    host = document.createElement("div");
    host.className = "__buildbanner-host";

    fallbackStyle = document.createElement("style");
    fallbackStyle.textContent = _buildFallbackStyles(config, positionMode);
    document.head.appendChild(fallbackStyle);

    wrapper = document.createElement("div");
    wrapper.className = "__buildbanner-wrapper";
    host.appendChild(wrapper);
  }

  _applyCommonAttributes(host, wrapper);

  if (config.position === "bottom") {
    document.body.appendChild(host);
  } else {
    document.body.insertBefore(host, document.body.firstChild);
  }

  return { host, shadowRoot, wrapper, fallbackStyle };
}

/** Remove the banner host element and any fallback style from the DOM. */
export function destroyBannerHost(host, fallbackStyle) {
  if (host && host.parentNode) {
    host.parentNode.removeChild(host);
  }
  if (fallbackStyle && fallbackStyle.parentNode) {
    fallbackStyle.parentNode.removeChild(fallbackStyle);
  }
}

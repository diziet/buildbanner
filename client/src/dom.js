/** DOM module — creates and destroys the banner host element. */

import { createLogger } from "./logger.js";

const FONT_STACK = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

/** Build shared CSS properties for the banner wrapper. */
function _buildWrapperCssProperties(height, zIndex) {
  return `
      all: initial;
      display: flex;
      align-items: center;
      gap: 0;
      position: sticky;
      top: 0;
      z-index: ${zIndex};
      height: ${height}px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: ${FONT_STACK};
      font-size: 12px;
      line-height: ${height}px;
      color: #e0e0e0;
      background: #1a1a1a;
      padding: 0 8px;
      box-sizing: border-box;`;
}

/** Generate shadow DOM stylesheet for the banner. */
function _buildStyles(config) {
  const height = config.height || 28;
  const zIndex = config.zIndex || 999999;

  return `
    .bb-wrapper {${_buildWrapperCssProperties(height, zIndex)}
    }
  `;
}

/** Generate fallback stylesheet for environments without Shadow DOM. */
function _buildFallbackStyles(config) {
  const height = config.height || 28;
  const zIndex = config.zIndex || 999999;

  return `
    .__buildbanner-host {
      all: initial;
      display: block;
    }
    .__buildbanner-wrapper {${_buildWrapperCssProperties(height, zIndex)}
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
  `;
}

/**
 * Create the banner host element with Shadow DOM (or fallback).
 * Returns { host, shadowRoot, wrapper, fallbackStyle }.
 */
export function createBannerHost(config = {}) {
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
    host.setAttribute("data-testid", "buildbanner");
    shadowRoot = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = _buildStyles(config);
    shadowRoot.appendChild(style);

    wrapper = document.createElement("div");
    wrapper.className = "bb-wrapper";
    wrapper.setAttribute("role", "toolbar");
    wrapper.setAttribute("aria-label", "Build information banner");
    shadowRoot.appendChild(wrapper);
  } else {
    host = document.createElement("div");
    host.className = "__buildbanner-host";
    host.setAttribute("data-testid", "buildbanner");

    fallbackStyle = document.createElement("style");
    fallbackStyle.textContent = _buildFallbackStyles(config);
    document.head.appendChild(fallbackStyle);

    wrapper = document.createElement("div");
    wrapper.className = "__buildbanner-wrapper";
    wrapper.setAttribute("role", "toolbar");
    wrapper.setAttribute("aria-label", "Build information banner");
    host.appendChild(wrapper);
  }

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

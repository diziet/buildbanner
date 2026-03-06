/** BuildBanner client entry point — init, destroy, and lifecycle. */

import { parseConfig, resolveConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { fetchBannerData } from "./fetch.js";
import { createBannerHost, destroyBannerHost } from "./dom.js";

const SYMBOL_KEY = Symbol.for("buildbanner");

/** Render branch and sha as plain spans separated by · */
function _renderSegments(data, wrapper) {
  const segments = [];

  if (data.branch !== null && data.branch !== undefined) {
    const span = document.createElement("span");
    span.setAttribute("data-segment", "branch");
    span.textContent = data.branch;
    segments.push(span);
  }

  if (data.sha !== null && data.sha !== undefined) {
    const span = document.createElement("span");
    span.setAttribute("data-segment", "sha");
    span.textContent = data.sha;
    segments.push(span);
  }

  for (let i = 0; i < segments.length; i++) {
    if (i > 0) {
      const sep = document.createElement("span");
      sep.textContent = " \u00B7 ";
      wrapper.appendChild(sep);
    }
    wrapper.appendChild(segments[i]);
  }
}

/** Get the singleton instance tracker. */
function _getInstance() {
  try {
    return window[SYMBOL_KEY];
  } catch {
    return window.__buildBannerInstance;
  }
}

/** Set the singleton instance tracker. */
function _setInstance(instance) {
  try {
    window[SYMBOL_KEY] = instance;
  } catch {
    /* Symbol not supported — ignore */
  }
  window.__buildBannerInstance = instance;
}

/** Clear the singleton instance tracker. */
function _clearInstance() {
  try {
    window[SYMBOL_KEY] = null;
  } catch {
    /* Symbol not supported — ignore */
  }
  window.__buildBannerInstance = null;
}

/** Initialize the banner. */
async function init(opts = {}) {
  try {
    const existing = _getInstance();
    if (existing && !existing.destroyed) {
      console.debug("[BuildBanner] Already initialized, skipping");
      return;
    }

    const config = resolveConfig({}, opts);
    const logger = createLogger(config.debug);

    const data = await fetchBannerData(config.endpoint, {
      token: config.token,
      logger,
    });

    if (!data) {
      return;
    }

    const { host, shadowRoot, wrapper } = createBannerHost(config);
    _renderSegments(data, wrapper);

    const instance = { host, shadowRoot, wrapper, destroyed: false };
    _setInstance(instance);
  } catch {
    /* Never throw — hide banner silently on error. */
  }
}

/** Destroy the banner and clean up. */
function destroy() {
  try {
    const instance = _getInstance();
    if (!instance) return;
    destroyBannerHost(instance.host);
    instance.destroyed = true;
    _clearInstance();
  } catch {
    /* Never throw. */
  }
}

/** Check if the banner is currently visible. */
function isVisible() {
  try {
    const instance = _getInstance();
    return Boolean(instance && !instance.destroyed);
  } catch {
    return false;
  }
}

/** Auto-detect script tag and initialize on DOMContentLoaded. */
function _autoInit() {
  const scripts = document.querySelectorAll("script[src]");
  let scriptEl = null;

  for (const s of scripts) {
    if (s.src && s.src.includes("buildbanner")) {
      scriptEl = s;
      break;
    }
  }

  if (!scriptEl) return;
  if (scriptEl.dataset.manual !== undefined) return;

  const config = parseConfig(scriptEl);
  init(config);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _autoInit);
  } else {
    _autoInit();
  }
}

/** Public API exposed as window.BuildBanner. */
const BuildBanner = { init, destroy, isVisible };

if (typeof window !== "undefined") {
  window.BuildBanner = BuildBanner;
}

export { init, destroy, isVisible };
export default BuildBanner;

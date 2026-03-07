/** BuildBanner client entry point — init, destroy, and lifecycle. */

import { parseConfig, resolveConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { fetchBannerData } from "./fetch.js";
import { createBannerHost, destroyBannerHost } from "./dom.js";
import { renderSegments } from "./segments.js";
import { checkTokenWarnings } from "./token-warnings.js";
import { isDismissed, createDismissButton } from "./dismiss.js";

const SYMBOL_KEY = Symbol.for("buildbanner");

/** Get the singleton instance tracker. */
function _getInstance() {
  return window[SYMBOL_KEY];
}

/** Set the singleton instance tracker. */
function _setInstance(instance) {
  window[SYMBOL_KEY] = instance;
}

/** Clear the singleton instance tracker. */
function _clearInstance() {
  window[SYMBOL_KEY] = null;
}

/** Initialize the banner. */
async function init(opts = {}) {
  try {
    const existing = _getInstance();
    if (existing && !existing.destroyed) {
      if (!existing.pending) {
        console.debug("[BuildBanner] Already initialized, skipping");
      }
      return;
    }

    const pending = { destroyed: false, pending: true };
    _setInstance(pending);

    const config = resolveConfig({}, opts);
    checkTokenWarnings(config);

    if (isDismissed(config)) {
      _clearInstance();
      return;
    }

    const logger = createLogger(config.debug);

    const data = await fetchBannerData(config.endpoint, {
      token: config.token,
      logger,
    });

    if (!data) {
      _clearInstance();
      return;
    }

    const result = createBannerHost(config);
    if (!result) {
      _clearInstance();
      return;
    }

    const { host, shadowRoot, wrapper, fallbackStyle } = result;
    const { tickerTimerId } = renderSegments(data, wrapper, config);

    const dismissBtn = createDismissButton(config, () => {
      destroyBannerHost(host, fallbackStyle);
    });
    if (dismissBtn) {
      wrapper.appendChild(dismissBtn);
    }

    const instance = { host, shadowRoot, wrapper, fallbackStyle, tickerTimerId, destroyed: false };
    _setInstance(instance);
  } catch (err) {
    _clearInstance();
    console.debug("[BuildBanner] init failed:", err);
  }
}

/** Destroy the banner and clean up. */
function destroy() {
  try {
    const instance = _getInstance();
    if (!instance) return;
    if (instance.tickerTimerId) {
      clearInterval(instance.tickerTimerId);
    }
    destroyBannerHost(instance.host, instance.fallbackStyle);
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
    return Boolean(instance && !instance.destroyed && !instance.pending);
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
  init(config).catch(() => { /* Never throw — auto-init is fire-and-forget. */ });
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

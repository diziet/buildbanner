/** BuildBanner client entry point — init, destroy, and lifecycle. */

import { parseConfig, resolveConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { fetchBannerData } from "./fetch.js";
import { createBannerHost, destroyBannerHost, DEFAULT_HEIGHT } from "./dom.js";
import { renderSegments } from "./segments.js";
import { checkTokenWarnings } from "./token-warnings.js";
import { isDismissed, createDismissButton, resetDismiss } from "./dismiss.js";
import { startPolling, stopPolling } from "./polling.js";
import { applyPush, removePush, resolvePositionMode } from "./push.js";
import { shouldHide } from "./env-hide.js";

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

/** Tear down an instance — clear timers, stop polling, remove DOM, restore padding. */
function _teardown(instance) {
  if (instance.tickerTimerId) {
    clearInterval(instance.tickerTimerId);
  }
  if (instance.pollingState) {
    stopPolling(instance.pollingState);
  }
  removePush(instance.bannerHeight, instance.pushState, instance.config);
  destroyBannerHost(instance.host, instance.fallbackStyle);
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
      pending.destroyed = true;
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

    if (Array.isArray(config.envHide) && config.envHide.length > 0 && !data.environment) {
      logger.log("envHide is configured but server response has no environment field");
    }

    if (shouldHide(config.envHide, data.environment)) {
      logger.log("Banner hidden: environment '" + data.environment + "' is in envHide list");
      pending.destroyed = true;
      _clearInstance();
      return;
    }

    const bannerHeight = parseInt(config.height, 10) || DEFAULT_HEIGHT;
    const pushState = applyPush(config, bannerHeight, logger);
    const positionMode = resolvePositionMode(pushState.mode);

    const result = createBannerHost(config, positionMode);
    if (!result) {
      removePush(bannerHeight, pushState, config);
      _clearInstance();
      return;
    }

    const { host, shadowRoot, wrapper, fallbackStyle } = result;
    const previousStatuses = {};
    const { tickerTimerId } = renderSegments(data, wrapper, config, previousStatuses);

    const instance = {
      host, shadowRoot, wrapper, fallbackStyle, tickerTimerId,
      pollingState: null, destroyed: false,
      pushState, bannerHeight, config,
      data, previousStatuses,
    };

    if (config.poll > 0) {
      const pollFetchFn = () => fetchBannerData(config.endpoint, { token: config.token, logger });
      const pollOnData = (newData) => {
        instance.data = newData;
        _rerender(instance);
      };
      instance.pollingState = startPolling(config, pollFetchFn, pollOnData, logger);
    }

    const dismissBtn = createDismissButton(config, () => {
      _teardown(instance);
      _clearInstance();
    });
    if (dismissBtn) {
      wrapper.appendChild(dismissBtn);
    }

    _setInstance(instance);
  } catch (err) {
    _clearInstance();
    console.debug("[BuildBanner] init failed:", err);
  }
}

/** Re-render segments from current instance data. */
function _rerender(instance) {
  if (instance.tickerTimerId) {
    clearInterval(instance.tickerTimerId);
  }
  instance.wrapper.textContent = "";
  const rendered = renderSegments(
    instance.data, instance.wrapper, instance.config, instance.previousStatuses,
  );
  instance.tickerTimerId = rendered.tickerTimerId;
}

/** Trigger a manual re-fetch and update segments. */
async function refresh() {
  try {
    const instance = _getInstance();
    if (!instance || instance.destroyed || instance.pending) return;

    const logger = createLogger(instance.config.debug);
    const newData = await fetchBannerData(instance.config.endpoint, {
      token: instance.config.token,
      logger,
      isRefetch: true,
    });

    if (!newData) return;
    instance.data = newData;
    _rerender(instance);
  } catch {
    /* Never throw. */
  }
}

/** Merge partial data into current state and re-render without fetching. */
function update(partialData) {
  try {
    const instance = _getInstance();
    if (!instance || instance.destroyed || instance.pending) return;
    if (!partialData || typeof partialData !== "object") return;

    if (partialData.custom && instance.data.custom) {
      partialData = {
        ...partialData,
        custom: { ...instance.data.custom, ...partialData.custom },
      };
    }
    instance.data = { ...instance.data, ...partialData };
    _rerender(instance);
  } catch {
    /* Never throw. */
  }
}

/** Destroy the banner and clean up. All methods become no-ops after this. */
function destroy() {
  try {
    const instance = _getInstance();
    if (!instance) return;
    _teardown(instance);
    resetDismiss();
    instance.destroyed = true;
    _clearInstance();
    _disableMethods();
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

/** Replace all public methods with no-ops except init (which re-enables). */
function _disableMethods() {
  const noop = () => {};
  const noopAsync = () => Promise.resolve();
  const noopFalse = () => false;

  BuildBanner.destroy = noop;
  BuildBanner.refresh = noopAsync;
  BuildBanner.update = noop;
  BuildBanner.isVisible = noopFalse;
  BuildBanner.init = function restoreAndInit(opts) {
    _restoreMethods();
    return init(opts);
  };
}

/** Restore original methods on the public API. */
function _restoreMethods() {
  BuildBanner.init = init;
  BuildBanner.destroy = destroy;
  BuildBanner.refresh = refresh;
  BuildBanner.update = update;
  BuildBanner.isVisible = isVisible;
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
const BuildBanner = { init, destroy, refresh, update, isVisible };

if (typeof window !== "undefined") {
  window.BuildBanner = BuildBanner;
}

export { init, destroy, refresh, update, isVisible };
export default BuildBanner;

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
import { startThemeObserver } from "./theme-observer.js";
import { readCache, writeCache, hasCacheEntry } from "./cache.js";

const SYMBOL_KEY = Symbol.for("buildbanner");

/** Get the singleton instance tracker. */
function _getInstance() {
  return window[SYMBOL_KEY];
}

/** Get the active (non-destroyed) instance, or null. */
function _getActiveInstance() {
  const instance = _getInstance();
  if (!instance || instance.destroyed) return null;
  return instance;
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
  if (instance.themeObserver) {
    instance.themeObserver.stop();
  }
  removePush(instance.bannerHeight, instance.pushState, instance.config);
  destroyBannerHost(instance.host, instance.fallbackStyle);
}

/** Fetch data or tear down DOM on failure. Returns data or null. */
async function _fetchOrTeardown(ctx) {
  const { config, logger, pending, host, fallbackStyle, bannerHeight, pushState } = ctx;
  const data = await fetchBannerData(config.endpoint, {
    token: config.token,
    logger,
  });

  if (!data) {
    removePush(bannerHeight, pushState, config);
    destroyBannerHost(host, fallbackStyle);
    pending.destroyed = true;
    _clearInstance();
    return null;
  }
  return data;
}

/** Render segments, set up polling/dismiss, and register the instance. Returns instance or null. */
function _renderAndSetup(ctx) {
  const {
    data, config, logger, pending,
    host, shadowRoot, wrapper, fallbackStyle,
    bannerHeight, pushState,
  } = ctx;

  try {
    if (Array.isArray(config.envHide) && config.envHide.length > 0 && !data.environment) {
      logger.log("envHide is configured but server response has no environment field");
    }

    if (shouldHide(config.envHide, data.environment)) {
      logger.log("Banner hidden: environment '" + data.environment + "' is in envHide list");
      removePush(bannerHeight, pushState, config);
      destroyBannerHost(host, fallbackStyle);
      pending.destroyed = true;
      _clearInstance();
      return null;
    }

    const previousStatuses = {};
    const { tickerTimerId, shaColor } = renderSegments(data, wrapper, config, previousStatuses);
    _injectShaColorStyle(shadowRoot, shaColor);

    const themeObserver = startThemeObserver(shadowRoot, config.theme);
    const instance = {
      host, shadowRoot, wrapper, fallbackStyle, tickerTimerId,
      pollingState: null, destroyed: false,
      pushState, bannerHeight, config,
      data, previousStatuses, themeObserver,
    };

    if (config.poll > 0) {
      const pollFetchFn = () => fetchBannerData(config.endpoint, { token: config.token, logger });
      const pollOnData = (newData) => {
        instance.data = newData;
        _rerender(instance);
        if (config.cache) writeCache(config.endpoint, newData, config.theme);
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

    if (config.cache) writeCache(config.endpoint, data, config.theme);
    _setInstance(instance);
    return instance;
  } catch (postFetchErr) {
    removePush(bannerHeight, pushState, config);
    destroyBannerHost(host, fallbackStyle);
    pending.destroyed = true;
    _clearInstance();
    console.debug("[BuildBanner] post-fetch setup failed:", postFetchErr);
    return null;
  }
}

/** After rendering from cache, fetch in background and update if needed. */
function _backgroundRefresh(instance, logger) {
  fetchBannerData(instance.config.endpoint, {
    token: instance.config.token,
    logger,
  }).then((newData) => {
    if (!newData) return; // Fetch failed — keep showing cached data
    if (instance.destroyed) return;

    const isDataChanged = newData.sha !== instance.data.sha
      || newData.server_started !== instance.data.server_started;
    instance.data = newData;

    if (isDataChanged) {
      _rerender(instance);
    }

    if (instance.config.cache) {
      writeCache(instance.config.endpoint, newData, instance.config.theme);
    }
  }).catch(() => {
    // Never throw — background refresh is fire-and-forget
  });
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

    // Render placeholder synchronously before fetch to eliminate flash
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

    const cachedEntry = config.cache ? readCache(config.endpoint) : null;

    if (cachedEntry) {
      const instance = _renderAndSetup({
        data: cachedEntry.data, config, logger, pending,
        host, shadowRoot, wrapper, fallbackStyle,
        bannerHeight, pushState,
      });
      if (!instance) return;
      _backgroundRefresh(instance, logger);
    } else {
      const data = await _fetchOrTeardown({
        config, logger, pending,
        host, fallbackStyle, bannerHeight, pushState,
      });
      if (!data) return;

      _renderAndSetup({
        data, config, logger, pending,
        host, shadowRoot, wrapper, fallbackStyle,
        bannerHeight, pushState,
      });
    }
  } catch (err) {
    _clearInstance();
    console.debug("[BuildBanner] init failed:", err);
  }
}

/** Inject or update a <style> rule for the SHA background color in Shadow DOM. */
function _injectShaColorStyle(shadowRoot, shaColor) {
  if (!shadowRoot) return;
  const existingId = "bb-sha-color-style";
  const existing = shadowRoot.getElementById(existingId);
  if (existing) existing.remove();
  if (!shaColor) return;
  const style = document.createElement("style");
  style.id = existingId;
  style.textContent = `.bb-sha-color { --sha-color: ${shaColor}; }`;
  shadowRoot.appendChild(style);
}

/** Re-render segments from current instance data, preserving dismiss button. */
function _rerender(instance) {
  if (instance.tickerTimerId) {
    clearInterval(instance.tickerTimerId);
  }
  instance.wrapper.textContent = "";
  const rendered = renderSegments(
    instance.data, instance.wrapper, instance.config, instance.previousStatuses,
  );
  instance.tickerTimerId = rendered.tickerTimerId;
  _injectShaColorStyle(instance.shadowRoot, rendered.shaColor);

  const dismissBtn = createDismissButton(instance.config, () => {
    _teardown(instance);
    _clearInstance();
  });
  if (dismissBtn) {
    instance.wrapper.appendChild(dismissBtn);
  }
}

/** Trigger a manual re-fetch and update segments. */
async function refresh() {
  try {
    const instance = _getActiveInstance();
    if (!instance) return;

    const logger = createLogger(instance.config.debug);
    const newData = await fetchBannerData(instance.config.endpoint, {
      token: instance.config.token,
      logger,
      isRefetch: true,
    });

    if (!newData) return;
    instance.data = newData;
    _rerender(instance);
  } catch (err) {
    console.debug("[BuildBanner] refresh failed:", err);
  }
}

/**
 * Merge partial data into current state and re-render without fetching.
 * Top-level fields are replaced; `custom` is merged key-by-key per spec
 * so callers can update individual custom fields without losing others.
 */
function update(partialData) {
  try {
    const instance = _getActiveInstance();
    if (!instance || !instance.data) return;
    if (!partialData || typeof partialData !== "object") return;

    if (partialData.custom && instance.data.custom) {
      partialData = {
        ...partialData,
        custom: { ...instance.data.custom, ...partialData.custom },
      };
    }
    instance.data = { ...instance.data, ...partialData };
    _rerender(instance);
  } catch (err) {
    console.debug("[BuildBanner] update failed:", err);
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
  } catch (err) {
    console.debug("[BuildBanner] destroy failed:", err);
  }
}

/** Check if the banner is currently visible. */
function isVisible() {
  try {
    return Boolean(_getActiveInstance());
  } catch {
    return false;
  }
}

const ORIGINAL_METHODS = { init, destroy, refresh, update, isVisible };

/** Replace all public methods with no-ops except init (which re-enables). */
function _disableMethods() {
  BuildBanner.destroy = () => {};
  BuildBanner.refresh = () => Promise.resolve();
  BuildBanner.update = () => {};
  BuildBanner.isVisible = () => false;
  BuildBanner.init = function restoreAndInit(opts) {
    _restoreMethods();
    return init(opts);
  };
}

/** Restore original methods on the public API. */
function _restoreMethods() {
  Object.assign(BuildBanner, ORIGINAL_METHODS);
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

/** Check if a script element has warm cache available for immediate render. */
function _hasCachedData(scriptEl) {
  if (!scriptEl) return false;
  if (scriptEl.getAttribute("data-cache") !== "true") return false;
  const endpoint = scriptEl.getAttribute("data-endpoint");
  if (!endpoint) return false;
  return hasCacheEntry(endpoint);
}

if (typeof document !== "undefined") {
  const scripts = document.querySelectorAll("script[src]");
  let _scriptEl = null;
  for (const s of scripts) {
    if (s.src && s.src.includes("buildbanner")) {
      _scriptEl = s;
      break;
    }
  }

  if (document.body && _hasCachedData(_scriptEl)) {
    // Cache exists and body is available — render immediately
    // to avoid flash between page navigations
    _autoInit();
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _autoInit);
  } else {
    _autoInit();
  }
}

/**
 * Public API exposed as window.BuildBanner.
 * Note: the no-op-after-destroy guard via _disableMethods() only applies to
 * consumers using `window.BuildBanner` or the default export. ES module named
 * imports hold direct references to the original functions; those are guarded
 * by the internal _getActiveInstance() check instead.
 */
const BuildBanner = { ...ORIGINAL_METHODS };

if (typeof window !== "undefined") {
  window.BuildBanner = BuildBanner;
}

export { init, destroy, refresh, update, isVisible };
export default BuildBanner;

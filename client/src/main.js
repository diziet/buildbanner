/** The public API (init, destroy, refresh, update, isVisible) and the auto-init on page load. */

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

/** Return the instance record stored on window, which may be pending or destroyed. */
function _getInstance() {
  return window[SYMBOL_KEY];
}

/** Get the active (non-destroyed) instance, or null. */
function _getActiveInstance() {
  const instance = _getInstance();
  if (!instance || instance.destroyed) return null;
  return instance;
}

/** Store the instance record on window under SYMBOL_KEY. */
function _setInstance(instance) {
  window[SYMBOL_KEY] = instance;
}

/** Remove the stored instance record. */
function _clearInstance() {
  window[SYMBOL_KEY] = null;
}

/**
 * Stop the instance's uptime ticker, polling and theme observer, restore the padding, and remove
 * its DOM.
 */
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

/** Fetch the banner data. On failure, remove the empty banner and its padding, and return null. */
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

/**
 * Render the segments, start polling, add the dismiss button and store the instance. Returns it, or
 * null when the banner is hidden or setup fails.
 */
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

/**
 * After a render from the cache, fetch in the background; re-render when the SHA or server_started
 * changed.
 */
function _backgroundRefresh(instance, logger) {
  fetchBannerData(instance.config.endpoint, {
    token: instance.config.token,
    logger,
  }).then((newData) => {
    if (!newData) return; // On a failed fetch, keep the cached banner.
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
    // Nothing awaits this promise; drop the error so that it never reaches the host page.
  });
}

/** Initialize the banner. A call while another instance is active or pending does nothing. */
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

    // Add the padding and an empty banner before the fetch, so the page does not flash when the
    // data arrives.
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

/** Replace the <style> rule that sets the SHA background color in the shadow root. */
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

/** Render the segments again from instance.data, with a new dismiss button. */
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

/** Fetch the endpoint now and re-render. */
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
 * Merge partial data into the current data and re-render, without a fetch.
 * Top-level fields are replaced. `custom` is merged key by key, as the spec
 * requires, so a caller can change one custom field and keep the others.
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

/**
 * Remove the banner and stop its timers and listeners. Afterwards the methods of window.BuildBanner
 * do nothing until init() is called.
 */
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

/** Replace the public methods with no-ops; init restores the originals, then initializes. */
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

/** Return the first <script src> whose URL contains "buildbanner", or null. */
function _findScriptEl() {
  const scripts = document.querySelectorAll("script[src]");
  for (const s of scripts) {
    if (s.src && s.src.includes("buildbanner")) {
      return s;
    }
  }
  return null;
}

/** Initialize from the script tag's data attributes, unless it has data-manual. */
function _autoInit() {
  const scriptEl = _findScriptEl();
  if (!scriptEl) return;
  if (scriptEl.dataset.manual !== undefined) return;

  const config = parseConfig(scriptEl);
  init(config).catch(() => { /* No caller awaits this; keep errors from the host page. */ });
}

/**
 * True when the script tag has no data-manual, has data-cache="true" and a data-endpoint, and a
 * valid cache entry exists for that endpoint.
 */
function _hasCachedData(scriptEl) {
  if (!scriptEl) return false;
  if (scriptEl.dataset.manual !== undefined) return false;
  if (scriptEl.getAttribute("data-cache") !== "true") return false;
  const endpoint = scriptEl.getAttribute("data-endpoint");
  if (!endpoint) return false;
  return hasCacheEntry(endpoint);
}

if (typeof document !== "undefined") {
  const _scriptEl = _findScriptEl();

  if (document.body && _hasCachedData(_scriptEl)) {
    // With a cache entry and a <body>, render now instead of at DOMContentLoaded,
    // so the banner does not flash between page navigations.
    _autoInit();
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _autoInit);
  } else {
    _autoInit();
  }
}

/**
 * The public API, also set as window.BuildBanner.
 * _disableMethods() makes the methods no-ops after destroy only on this object,
 * that is, for `window.BuildBanner` and the default export. ES module named
 * imports hold the original functions; _getActiveInstance() guards those.
 */
const BuildBanner = { ...ORIGINAL_METHODS };

if (typeof window !== "undefined") {
  window.BuildBanner = BuildBanner;
}

export { init, destroy, refresh, update, isVisible };
export default BuildBanner;

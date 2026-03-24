/** Push mode — manages <html> padding to make room for the banner. */

/**
 * Apply push mode if conditions allow, otherwise fall back to overlay.
 * @param {object} config - Banner configuration.
 * @param {number} bannerHeight - Height of the banner in pixels.
 * @param {object} logger - Logger instance.
 * @returns {{ mode: string, originalPadding: number, originalBg: string }}
 */
export function applyPush(config, bannerHeight, logger) {
  const prop = _paddingProperty(config);
  const existing = _readPadding(prop);

  if (!config.push) {
    return { mode: "overlay", originalPadding: existing, originalBg: "" };
  }

  if (existing !== 0) {
    if (logger) {
      logger.log("Push mode fell back to overlay due to existing padding");
    }
    return { mode: "overlay", originalPadding: existing, originalBg: "" };
  }

  const originalBg = document.documentElement.style.backgroundColor || "";
  document.documentElement.style[prop] = `${bannerHeight}px`;
  _matchRootBackground(logger);
  return { mode: "push", originalPadding: 0, originalBg };
}

/**
 * Remove push mode padding using subtract-not-overwrite strategy.
 *
 * Compares current computed padding against the expected value
 * (originalPadding + bannerHeight). If they match, restores to
 * originalPadding directly. Otherwise subtracts bannerHeight from
 * the current value (clamped to 0) to handle third-party changes.
 *
 * Note: originalPadding is always 0 when mode === "push" (since push
 * mode only activates when existing padding is zero), so the "exact
 * restore" path always clears to "". The subtraction path handles the
 * case where external code modified padding after init.
 *
 * @param {number} bannerHeight - Height of the banner in pixels.
 * @param {{ mode: string, originalPadding: number }} pushState - State from applyPush.
 * @param {object} config - Banner configuration.
 */
export function removePush(bannerHeight, pushState, config) {
  if (!pushState || pushState.mode !== "push") return;

  const prop = _paddingProperty(config);
  const current = _readPadding(prop);
  const expected = pushState.originalPadding + bannerHeight;

  if (current === expected) {
    document.documentElement.style[prop] = "";
  } else {
    const restored = Math.max(0, current - bannerHeight);
    document.documentElement.style[prop] = restored ? `${restored}px` : "";
  }

  document.documentElement.style.backgroundColor = pushState.originalBg || "";
}

/** Map push mode result to CSS position value. */
export function resolvePositionMode(pushMode) {
  return pushMode === "push" ? "sticky" : "fixed";
}

/** Determine which padding property to use based on position. */
function _paddingProperty(config) {
  return config && config.position === "bottom" ? "paddingBottom" : "paddingTop";
}

/** Read the current computed padding value in pixels. */
function _readPadding(prop) {
  const raw = getComputedStyle(document.documentElement)[prop];
  return parseInt(raw, 10) || 0;
}

/**
 * Copy the computed background-color of <body> to <html> so push-mode
 * padding doesn't expose a bare white strip on dark or themed pages.
 * Only acts when <html> has no explicit inline background already set
 * and <body> has a non-transparent computed background.
 */
function _matchRootBackground(logger) {
  if (!document.body) return;

  const bodyBg = getComputedStyle(document.body).backgroundColor;
  if (!bodyBg || _isTransparent(bodyBg)) return;

  const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
  if (!_isTransparent(htmlBg)) return;

  document.documentElement.style.backgroundColor = bodyBg;
  if (logger) {
    logger.log(`Matched <html> background to <body>: ${bodyBg}`);
  }
}

/** Check whether a CSS color string is transparent. */
function _isTransparent(color) {
  if (!color) return true;
  const lower = color.toLowerCase().replace(/\s/g, "");
  if (lower === "transparent") return true;
  if (lower === "rgba(0,0,0,0)") return true;
  return false;
}

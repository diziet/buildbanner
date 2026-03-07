/** Push mode — manages <html> padding to make room for the banner. */

/**
 * Apply push mode if conditions allow, otherwise fall back to overlay.
 * @param {object} config - Banner configuration.
 * @param {number} bannerHeight - Height of the banner in pixels.
 * @param {object} logger - Logger instance.
 * @returns {{ mode: string, originalPadding: number }}
 */
export function applyPush(config, bannerHeight, logger) {
  const prop = _paddingProperty(config);
  const existing = _readPadding(prop);

  if (!config.push) {
    return { mode: "overlay", originalPadding: existing };
  }

  if (existing !== 0) {
    if (logger) {
      logger.log("Push mode fell back to overlay due to existing padding");
    }
    return { mode: "overlay", originalPadding: existing };
  }

  document.documentElement.style[prop] = `${bannerHeight}px`;
  return { mode: "push", originalPadding: 0 };
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

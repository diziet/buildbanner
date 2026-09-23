/** Push mode: pad <html> by the banner height, so the banner does not cover the page. */

/**
 * Add the push-mode padding, or fall back to overlay when push is off or <html> already has
 * padding.
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
 * Remove the push-mode padding with the subtract-not-overwrite strategy, and
 * restore the <html> background color that applyPush may have set.
 *
 * If the computed padding equals originalPadding + bannerHeight, the inline
 * padding is cleared. Otherwise other code changed the padding after init, so
 * bannerHeight is subtracted from the current value, stopping at 0.
 *
 * originalPadding is always 0 when mode === "push", because push mode starts
 * only when the existing padding is 0. The first branch therefore always
 * clears the padding to "".
 *
 * @param {number} bannerHeight - Height of the banner in pixels.
 * @param {{ mode: string, originalPadding: number, originalBg: string }} pushState - State from
 * applyPush.
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

/** "sticky" in push mode, "fixed" in overlay mode. */
export function resolvePositionMode(pushMode) {
  return pushMode === "push" ? "sticky" : "fixed";
}

/** paddingBottom for a bottom banner, paddingTop otherwise. */
function _paddingProperty(config) {
  return config && config.position === "bottom" ? "paddingBottom" : "paddingTop";
}

/** Read the current computed padding value in pixels. */
function _readPadding(prop) {
  const raw = getComputedStyle(document.documentElement)[prop];
  return parseInt(raw, 10) || 0;
}

/**
 * Copy the computed background-color of <body> to <html>, so the push-mode
 * padding does not show a white strip on a dark or themed page.
 * Acts only when the computed background of <html> is transparent and that of
 * <body> is not.
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

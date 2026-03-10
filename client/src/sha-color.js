/** SHA-based color derivation for visually distinct deploy identification. */

const MIN_LUMINANCE_DARK = 0.4;
const MAX_LUMINANCE_LIGHT = 0.5;

/** Convert a single sRGB channel (0–255) to linear RGB. */
function _toLinear(channel) {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Compute relative luminance (WCAG formula) from r, g, b (0–255). */
function _luminance(r, g, b) {
  return 0.2126 * _toLinear(r) + 0.7152 * _toLinear(g) + 0.0722 * _toLinear(b);
}

/** Clamp a value to 0–255. */
function _clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** Adjust color channels to meet minimum luminance for dark theme. */
function _adjustForDarkTheme(r, g, b) {
  const lum = _luminance(r, g, b);
  if (lum >= MIN_LUMINANCE_DARK) return { r, g, b };
  const factor = Math.sqrt(MIN_LUMINANCE_DARK / Math.max(lum, 0.001));
  return {
    r: _clamp(r * factor + (factor - 1) * 40),
    g: _clamp(g * factor + (factor - 1) * 40),
    b: _clamp(b * factor + (factor - 1) * 40),
  };
}

/** Adjust color channels to meet maximum luminance for light theme. */
function _adjustForLightTheme(r, g, b) {
  const lum = _luminance(r, g, b);
  if (lum <= MAX_LUMINANCE_LIGHT) return { r, g, b };
  const factor = Math.sqrt(MAX_LUMINANCE_LIGHT / lum);
  return {
    r: _clamp(r * factor),
    g: _clamp(g * factor),
    b: _clamp(b * factor),
  };
}

/** Format r, g, b as a hex color string. */
function _toHex(r, g, b) {
  const hex = (v) => v.toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * Derive a background color from a commit SHA.
 * @param {string|null} sha - The commit SHA (at least 6 characters).
 * @param {"dark"|"light"} theme - Current banner theme for readability adjustment.
 * @returns {string|null} Hex color string or null if SHA is invalid.
 */
export function getShaColor(sha, theme = "dark") {
  if (!sha || typeof sha !== "string" || sha.length < 6) return null;

  const hexStr = sha.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(hexStr)) return null;

  const r = parseInt(hexStr.slice(0, 2), 16);
  const g = parseInt(hexStr.slice(2, 4), 16);
  const b = parseInt(hexStr.slice(4, 6), 16);

  const adjusted = theme === "light"
    ? _adjustForLightTheme(r, g, b)
    : _adjustForDarkTheme(r, g, b);

  return _toHex(adjusted.r, adjusted.g, adjusted.b);
}

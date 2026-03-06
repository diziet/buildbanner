/** Client configuration parsing for BuildBanner. */

const VALID_POSITIONS = ["top", "bottom"];
const VALID_THEMES = ["dark", "light", "auto"];
const VALID_DISMISS = ["session", "permanent", "none"];
const HEIGHT_MIN = 24;
const HEIGHT_MAX = 48;

/** Default configuration values. */
export const DEFAULT_CONFIG = Object.freeze({
  endpoint: "/buildbanner.json",
  position: "top",
  theme: "dark",
  dismiss: "session",
  envHide: null,
  height: 28,
  debug: false,
  poll: 0,
  push: true,
  token: null,
  manual: false,
  zIndex: 999999,
  hostPatterns: [],
});

/** Parse a boolean data attribute string. */
function _parseBool(value, fallback) {
  if (value === null || value === undefined) return fallback;
  const lower = String(value).toLowerCase().trim();
  if (lower === "false" || lower === "0" || lower === "no") return false;
  if (lower === "true" || lower === "1" || lower === "yes" || lower === "") return true;
  return fallback;
}

/** Parse an integer data attribute string. */
function _parseInt(value, fallback) {
  if (value === null || value === undefined) return fallback;
  const parsed = parseInt(String(value), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/** Clamp a number between min and max. */
function _clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/** Parse a comma-separated list, trimming whitespace. */
function _parseList(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (str === "") return null;
  return str.split(",").map((item) => item.trim()).filter(Boolean);
}

/** Validate a value against an allowed list, returning fallback if invalid. */
function _validateEnum(value, allowed, fallback) {
  if (value === null || value === undefined) return fallback;
  const lower = String(value).toLowerCase().trim();
  return allowed.includes(lower) ? lower : fallback;
}

/**
 * Parse config from a script element's data attributes.
 * Returns defaults if element is null/undefined.
 */
export function parseConfig(scriptElement) {
  if (!scriptElement || typeof scriptElement.getAttribute !== "function") {
    return { ...DEFAULT_CONFIG };
  }

  const get = (name) => scriptElement.getAttribute(`data-${name}`);

  const rawHeight = _parseInt(get("height"), DEFAULT_CONFIG.height);

  return {
    endpoint: get("endpoint") || DEFAULT_CONFIG.endpoint,
    position: _validateEnum(get("position"), VALID_POSITIONS, DEFAULT_CONFIG.position),
    theme: _validateEnum(get("theme"), VALID_THEMES, DEFAULT_CONFIG.theme),
    dismiss: _validateEnum(get("dismiss"), VALID_DISMISS, DEFAULT_CONFIG.dismiss),
    envHide: _parseList(get("env-hide")),
    height: _clamp(rawHeight, HEIGHT_MIN, HEIGHT_MAX),
    debug: _parseBool(get("debug"), DEFAULT_CONFIG.debug),
    poll: _parseInt(get("poll"), DEFAULT_CONFIG.poll),
    push: _parseBool(get("push"), DEFAULT_CONFIG.push),
    token: get("token") || DEFAULT_CONFIG.token,
    manual: _parseBool(get("manual"), DEFAULT_CONFIG.manual),
    zIndex: DEFAULT_CONFIG.zIndex,
    hostPatterns: DEFAULT_CONFIG.hostPatterns,
  };
}

/**
 * Merge data-attribute config with programmatic options.
 * Programmatic options win over data attributes.
 */
export function resolveConfig(dataAttrs, programmaticOpts) {
  const base = dataAttrs || { ...DEFAULT_CONFIG };
  const opts = programmaticOpts || {};

  const merged = { ...base };

  if (opts.endpoint !== undefined) merged.endpoint = opts.endpoint;
  if (opts.position !== undefined) {
    merged.position = _validateEnum(opts.position, VALID_POSITIONS, base.position);
  }
  if (opts.theme !== undefined) {
    merged.theme = _validateEnum(opts.theme, VALID_THEMES, base.theme);
  }
  if (opts.dismiss !== undefined) {
    merged.dismiss = _validateEnum(opts.dismiss, VALID_DISMISS, base.dismiss);
  }
  if (opts.envHide !== undefined) {
    merged.envHide = Array.isArray(opts.envHide) ? opts.envHide : _parseList(opts.envHide);
  }
  if (opts.height !== undefined) {
    merged.height = _clamp(Number(opts.height) || base.height, HEIGHT_MIN, HEIGHT_MAX);
  }
  if (opts.debug !== undefined) merged.debug = !!opts.debug;
  if (opts.poll !== undefined) merged.poll = _parseInt(opts.poll, base.poll);
  if (opts.push !== undefined) merged.push = !!opts.push;
  if (opts.token !== undefined) merged.token = opts.token || null;
  if (opts.manual !== undefined) merged.manual = !!opts.manual;
  if (opts.zIndex !== undefined) merged.zIndex = Number(opts.zIndex) || base.zIndex;
  if (opts.hostPatterns !== undefined) {
    merged.hostPatterns = Array.isArray(opts.hostPatterns) ? opts.hostPatterns : base.hostPatterns;
  }

  return merged;
}

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
  hostPatterns: Object.freeze([]),
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
    return { ...DEFAULT_CONFIG, hostPatterns: [...DEFAULT_CONFIG.hostPatterns] };
  }

  const get = (name) => scriptElement.getAttribute(`data-${name}`);

  const rawHeight = _parseInt(get("height"), DEFAULT_CONFIG.height);

  return {
    endpoint: get("endpoint") || DEFAULT_CONFIG.endpoint,
    position: _validateEnum(get("position"), VALID_POSITIONS, DEFAULT_CONFIG.position),
    theme: _validateEnum(get("theme"), VALID_THEMES, DEFAULT_CONFIG.theme),
    dismiss: _validateEnum(get("dismiss"), VALID_DISMISS, DEFAULT_CONFIG.dismiss),
    envHide: _parseList(get("env-hide")) ?? DEFAULT_CONFIG.envHide,
    height: _clamp(rawHeight, HEIGHT_MIN, HEIGHT_MAX),
    debug: _parseBool(get("debug"), DEFAULT_CONFIG.debug),
    poll: Math.max(0, _parseInt(get("poll"), DEFAULT_CONFIG.poll)),
    push: _parseBool(get("push"), DEFAULT_CONFIG.push),
    token: get("token") || DEFAULT_CONFIG.token,
    manual: _parseBool(get("manual"), DEFAULT_CONFIG.manual),
    zIndex: DEFAULT_CONFIG.zIndex,
    hostPatterns: [...DEFAULT_CONFIG.hostPatterns],
  };
}

/**
 * Merge data-attribute config with programmatic options.
 * Programmatic options win over data attributes.
 */
export function resolveConfig(dataAttrs, programmaticOpts) {
  const base = dataAttrs || { ...DEFAULT_CONFIG, hostPatterns: [...DEFAULT_CONFIG.hostPatterns] };
  const opts = programmaticOpts || {};

  const merged = { ...base };

  if (opts.endpoint !== undefined) merged.endpoint = opts.endpoint;

  const ENUM_FIELDS = { position: VALID_POSITIONS, theme: VALID_THEMES, dismiss: VALID_DISMISS };
  for (const [key, allowed] of Object.entries(ENUM_FIELDS)) {
    if (opts[key] !== undefined) merged[key] = _validateEnum(opts[key], allowed, base[key]);
  }

  if (opts.envHide !== undefined) {
    merged.envHide = Array.isArray(opts.envHide) ? opts.envHide : _parseList(opts.envHide);
  }
  if (opts.height !== undefined) {
    const h = Number(opts.height);
    merged.height = _clamp(Number.isNaN(h) ? base.height : h, HEIGHT_MIN, HEIGHT_MAX);
  }

  for (const key of ["debug", "push", "manual"]) {
    if (opts[key] !== undefined) merged[key] = !!opts[key];
  }

  if (opts.poll !== undefined) merged.poll = Math.max(0, _parseInt(opts.poll, base.poll));
  if (opts.token !== undefined) merged.token = opts.token || null;
  if (opts.zIndex !== undefined) {
    const z = Number(opts.zIndex);
    merged.zIndex = Number.isNaN(z) ? base.zIndex : z;
  }
  if (opts.hostPatterns !== undefined) {
    merged.hostPatterns = Array.isArray(opts.hostPatterns) ? opts.hostPatterns : base.hostPatterns;
  }

  return merged;
}

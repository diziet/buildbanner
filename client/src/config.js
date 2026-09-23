/** Parse and validate the client configuration from data attributes and init() options. */

const VALID_POSITIONS = ["top", "bottom"];
const VALID_THEMES = ["dark", "light", "auto"];
const VALID_DISMISS = ["session", "permanent", "none"];
const VALID_SHA_COLOR = ["auto", "off"];

const MIN_HEIGHT = 24;
const MAX_HEIGHT = 48;

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
  shaColor: "auto",
  cache: false,
});

/**
 * Parse "true", "1", "yes" or "" as true and "false", "0" or "no" as false; anything else gives
 * defaultValue.
 */
function _parseBool(value, defaultValue) {
  if (value == null) return defaultValue;
  const lower = String(value).toLowerCase().trim();
  if (lower === "false" || lower === "0" || lower === "no") return false;
  if (lower === "true" || lower === "1" || lower === "yes" || lower === "") return true;
  return defaultValue;
}

/** Parse an integer, returning defaultValue when value is missing or non-numeric. */
function _parseIntOrDefault(value, defaultValue) {
  if (value == null) return defaultValue;
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return defaultValue;
  return parsed;
}

/** Parse the height and clamp it to MIN_HEIGHT..MAX_HEIGHT. */
function _parseHeight(value) {
  const parsed = _parseIntOrDefault(value, DEFAULT_CONFIG.height);
  return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, parsed));
}

/** Parse the poll interval in whole seconds; a negative value gives the default. */
function _parsePoll(value) {
  const parsed = _parseIntOrDefault(value, DEFAULT_CONFIG.poll);
  return parsed < 0 ? DEFAULT_CONFIG.poll : parsed;
}

/** Split a comma-separated list and trim each entry; an empty value gives null. */
function _parseEnvHide(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (trimmed === "") return null;
  return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Validate a string against allowed values, returning default if invalid. */
function _validateEnum(value, allowed, defaultValue) {
  if (value == null) return defaultValue;
  const lower = String(value).toLowerCase().trim();
  return allowed.includes(lower) ? lower : defaultValue;
}

/** Parse config from a script element's data attributes. */
export function parseConfig(scriptElement) {
  if (!scriptElement || typeof scriptElement.getAttribute !== "function") {
    return { ...DEFAULT_CONFIG, hostPatterns: [...DEFAULT_CONFIG.hostPatterns] };
  }

  return {
    endpoint: scriptElement.getAttribute("data-endpoint") || DEFAULT_CONFIG.endpoint,
    position: _validateEnum(scriptElement.getAttribute("data-position"), VALID_POSITIONS, DEFAULT_CONFIG.position),
    theme: _validateEnum(scriptElement.getAttribute("data-theme"), VALID_THEMES, DEFAULT_CONFIG.theme),
    dismiss: _validateEnum(scriptElement.getAttribute("data-dismiss"), VALID_DISMISS, DEFAULT_CONFIG.dismiss),
    envHide: _parseEnvHide(scriptElement.getAttribute("data-env-hide")) ?? DEFAULT_CONFIG.envHide,
    height: _parseHeight(scriptElement.getAttribute("data-height")),
    debug: _parseBool(scriptElement.getAttribute("data-debug"), DEFAULT_CONFIG.debug),
    poll: _parsePoll(scriptElement.getAttribute("data-poll")),
    push: _parseBool(scriptElement.getAttribute("data-push"), DEFAULT_CONFIG.push),
    token: scriptElement.getAttribute("data-token") || null,
    manual: _parseBool(scriptElement.getAttribute("data-manual"), DEFAULT_CONFIG.manual),
    zIndex: DEFAULT_CONFIG.zIndex,
    hostPatterns: [...DEFAULT_CONFIG.hostPatterns],
    shaColor: _validateEnum(scriptElement.getAttribute("data-sha-color"), VALID_SHA_COLOR, DEFAULT_CONFIG.shaColor),
    cache: _parseBool(scriptElement.getAttribute("data-cache"), DEFAULT_CONFIG.cache),
  };
}

/** Validate and normalize a merged config object. */
function _validateConfig(config) {
  config.position = _validateEnum(config.position, VALID_POSITIONS, DEFAULT_CONFIG.position);
  config.theme = _validateEnum(config.theme, VALID_THEMES, DEFAULT_CONFIG.theme);
  config.dismiss = _validateEnum(config.dismiss, VALID_DISMISS, DEFAULT_CONFIG.dismiss);
  config.height = _parseHeight(config.height);
  config.poll = _parsePoll(config.poll);
  config.debug = _parseBool(config.debug, DEFAULT_CONFIG.debug);
  config.push = _parseBool(config.push, DEFAULT_CONFIG.push);
  config.manual = _parseBool(config.manual, DEFAULT_CONFIG.manual);
  config.shaColor = _validateEnum(config.shaColor, VALID_SHA_COLOR, DEFAULT_CONFIG.shaColor);
  config.cache = _parseBool(config.cache, DEFAULT_CONFIG.cache);

  // Copy the arrays, so that the config never shares an array with the caller.
  if (Array.isArray(config.hostPatterns)) {
    config.hostPatterns = [...config.hostPatterns];
  }
  if (Array.isArray(config.envHide)) {
    config.envHide = [...config.envHide];
  }

  return config;
}

/**
 * Merge the data-attribute config with init() options; an init() option wins, and unknown keys are
 * ignored.
 */
export function resolveConfig(dataAttrs, programmaticOpts) {
  const base = { ...DEFAULT_CONFIG, ...dataAttrs };
  if (!programmaticOpts || typeof programmaticOpts !== "object") {
    return _validateConfig(base);
  }

  const merged = { ...base };

  for (const key of Object.keys(programmaticOpts)) {
    if (!Object.hasOwn(DEFAULT_CONFIG, key)) continue;
    merged[key] = programmaticOpts[key];
  }

  // An empty endpoint falls back to the base value, as in parseConfig.
  if (!merged.endpoint) merged.endpoint = base.endpoint;

  return _validateConfig(merged);
}

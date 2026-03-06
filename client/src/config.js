/** Client configuration parsing for BuildBanner. */

const VALID_POSITIONS = ["top", "bottom"];
const VALID_THEMES = ["dark", "light", "auto"];
const VALID_DISMISS = ["session", "permanent", "none"];

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
});

/** Parse a boolean data attribute string. */
function _parseBool(value, defaultValue) {
  if (value === null || value === undefined) return defaultValue;
  const lower = String(value).toLowerCase().trim();
  if (lower === "false" || lower === "0" || lower === "no") return false;
  if (lower === "true" || lower === "1" || lower === "yes" || lower === "") return true;
  return defaultValue;
}

/** Parse and clamp height to valid range. */
function _parseHeight(value) {
  if (value === null || value === undefined) return DEFAULT_CONFIG.height;
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return DEFAULT_CONFIG.height;
  return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, parsed));
}

/** Parse poll interval as integer seconds. */
function _parsePoll(value) {
  if (value === null || value === undefined) return DEFAULT_CONFIG.poll;
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) return DEFAULT_CONFIG.poll;
  return parsed;
}

/** Parse comma-separated list, trimming whitespace. */
function _parseEnvHide(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (trimmed === "") return null;
  return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Validate a string against allowed values, returning default if invalid. */
function _validateEnum(value, allowed, defaultValue) {
  if (value === null || value === undefined) return defaultValue;
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
  };
}

/** Merge data-attribute config with programmatic options (programmatic wins). */
export function resolveConfig(dataAttrs, programmaticOpts) {
  const base = { ...DEFAULT_CONFIG, ...dataAttrs };
  if (!programmaticOpts || typeof programmaticOpts !== "object") {
    return base;
  }

  const merged = { ...base };

  for (const key of Object.keys(programmaticOpts)) {
    if (!(key in DEFAULT_CONFIG)) continue;
    merged[key] = programmaticOpts[key];
  }

  // Normalize endpoint — falsy values fall back to base, matching parseConfig
  if (!merged.endpoint) merged.endpoint = base.endpoint;

  // Defensive copy to prevent shared mutable array references
  if (Array.isArray(merged.hostPatterns)) {
    merged.hostPatterns = [...merged.hostPatterns];
  }

  return merged;
}

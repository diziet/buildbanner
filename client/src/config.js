/** Client configuration parsing from data-attributes and programmatic options. */

/** Default configuration values. */
export const DEFAULT_CONFIG = {
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
};

const VALID_POSITIONS = ["top", "bottom"];
const VALID_THEMES = ["dark", "light", "auto"];
const VALID_DISMISS = ["session", "permanent", "none"];

/** Parse a boolean data-attribute value. */
function _parseBool(value, fallback) {
  if (value === null || value === undefined) return fallback;
  return value !== "false";
}

/** Parse an integer data-attribute value. */
function _parseInt(value, fallback) {
  if (value === null || value === undefined) return fallback;
  const num = parseInt(value, 10);
  return Number.isNaN(num) ? fallback : num;
}

/** Clamp a number to a range. */
function _clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Parse config from a script element's data-attributes. */
export function parseConfig(scriptElement) {
  if (!scriptElement || !scriptElement.dataset) {
    return { ...DEFAULT_CONFIG };
  }

  const d = scriptElement.dataset;
  const position = VALID_POSITIONS.includes(d.position) ? d.position : DEFAULT_CONFIG.position;
  const theme = VALID_THEMES.includes(d.theme) ? d.theme : DEFAULT_CONFIG.theme;
  const dismiss = VALID_DISMISS.includes(d.dismiss) ? d.dismiss : DEFAULT_CONFIG.dismiss;
  const height = _clamp(_parseInt(d.height, DEFAULT_CONFIG.height), 24, 48);
  const poll = _parseInt(d.poll, DEFAULT_CONFIG.poll);

  let envHide = DEFAULT_CONFIG.envHide;
  if (d.envHide !== undefined && d.envHide !== null) {
    envHide = d.envHide.split(",").map((s) => s.trim()).filter(Boolean);
  }

  return {
    endpoint: d.endpoint || DEFAULT_CONFIG.endpoint,
    position,
    theme,
    dismiss,
    envHide,
    height,
    debug: _parseBool(d.debug, DEFAULT_CONFIG.debug),
    poll,
    push: _parseBool(d.push, DEFAULT_CONFIG.push),
    token: d.token || DEFAULT_CONFIG.token,
    manual: _parseBool(d.manual, DEFAULT_CONFIG.manual),
    zIndex: DEFAULT_CONFIG.zIndex,
    hostPatterns: DEFAULT_CONFIG.hostPatterns,
  };
}

/** Merge data-attribute config with programmatic options (programmatic wins). */
export function resolveConfig(dataAttrs, programmaticOpts) {
  const base = { ...DEFAULT_CONFIG, ...dataAttrs };
  if (!programmaticOpts) return base;

  const merged = { ...base };
  for (const key of Object.keys(programmaticOpts)) {
    if (programmaticOpts[key] !== undefined) {
      merged[key] = programmaticOpts[key];
    }
  }
  return merged;
}

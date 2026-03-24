/** Cache module — read/write/validate localStorage banner cache. */

const CACHE_KEY_PREFIX = "buildbanner_cache";
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Build a storage key that includes the endpoint URL for isolation. */
function _storageKey(endpoint) {
  return `${CACHE_KEY_PREFIX}:${endpoint}`;
}

/** Check if localStorage is available. */
function _isStorageAvailable() {
  try {
    const key = "__bb_test__";
    localStorage.setItem(key, "1");
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** Validate the shape and freshness of a cache entry. */
function _isValidCache(entry, endpoint) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.endpoint !== endpoint) return false;
  if (typeof entry.sha !== "string") return false;
  if (!entry.data || typeof entry.data !== "object") return false;
  if (typeof entry.timestamp !== "number") return false;

  const age = Date.now() - entry.timestamp;
  if (age > CACHE_MAX_AGE_MS || age < 0) return false;

  return true;
}

/**
 * Read cached banner data from localStorage.
 * Returns the cache entry if valid, null otherwise.
 */
export function readCache(endpoint) {
  if (!_isStorageAvailable()) return null;

  try {
    const raw = localStorage.getItem(_storageKey(endpoint));
    if (!raw) return null;

    const entry = JSON.parse(raw);
    if (!_isValidCache(entry, endpoint)) return null;

    return entry;
  } catch {
    return null;
  }
}

/**
 * Check if a valid (non-expired) cache entry exists for the endpoint.
 * Used at script parse time to decide whether to render immediately.
 */
export function hasCacheEntry(endpoint) {
  return readCache(endpoint) !== null;
}

/**
 * Write banner data to localStorage cache.
 * Silently fails if localStorage is unavailable.
 */
export function writeCache(endpoint, data, theme) {
  if (!_isStorageAvailable()) return;

  try {
    const entry = {
      endpoint,
      sha: data.sha || "",
      data,
      theme,
      timestamp: Date.now(),
    };
    localStorage.setItem(_storageKey(endpoint), JSON.stringify(entry));
  } catch {
    // Quota exceeded or other storage error — silently degrade
  }
}

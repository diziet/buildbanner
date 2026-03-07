/** Environment-based banner hiding logic. */

/**
 * Check if the banner should be hidden based on the current environment.
 *
 * Returns false when environment is missing from the server response, even if
 * envHideList is configured — the banner renders by default when the server
 * does not report an environment.
 *
 * @param {string[]|null} envHideList - List of environments to hide in.
 * @param {string|undefined} environment - Current environment from server response.
 * @returns {boolean} True if the banner should be hidden.
 */
export function shouldHide(envHideList, environment) {
  if (!Array.isArray(envHideList) || envHideList.length === 0) return false;
  if (!environment) return false;

  const lowerEnv = String(environment).toLowerCase();
  return envHideList.some((entry) => String(entry).toLowerCase() === lowerEnv);
}

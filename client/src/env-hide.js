/** Environment-based banner hiding logic. */

/**
 * Check if the banner should be hidden based on the current environment.
 * @param {string[]|null} envHideList - List of environments to hide in.
 * @param {string|undefined} environment - Current environment from server response.
 * @returns {boolean} True if the banner should be hidden.
 */
export function shouldHide(envHideList, environment) {
  if (!envHideList || envHideList.length === 0) return false;
  if (!environment) return false;

  const lowerEnv = String(environment).toLowerCase();
  return envHideList.some((entry) => String(entry).toLowerCase() === lowerEnv);
}

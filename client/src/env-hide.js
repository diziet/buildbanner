/** Decide whether data-env-hide hides the banner for the server's environment. */

/**
 * Return true when the server's environment is in envHideList, ignoring case.
 *
 * Returns false when the server response has no environment, even if
 * envHideList is set: the banner renders when the server does not report an
 * environment.
 *
 * @param {string[]|null} envHideList - Environments in which the banner hides.
 * @param {string|undefined} environment - The `environment` field of the server response.
 * @returns {boolean} True if the banner should be hidden.
 */
export function shouldHide(envHideList, environment) {
  if (!Array.isArray(envHideList) || envHideList.length === 0) return false;
  if (!environment) return false;

  const lowerEnv = String(environment).toLowerCase();
  return envHideList.some((entry) => String(entry).toLowerCase() === lowerEnv);
}

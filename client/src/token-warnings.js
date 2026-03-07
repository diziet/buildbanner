/** Token auth client-side safety guardrails. */

const SHORT_TOKEN_THRESHOLD = 16;

const SAFE_SUFFIXES = [".local", ".internal", ".test"];

/** Check if a hostname is a safe/internal origin. */
function _isSafeHostname(hostname) {
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  return SAFE_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

/** Emit console.warn for token misuse patterns. Bypasses logger entirely. */
export function checkTokenWarnings(config) {
  if (!config.token) return;

  if (config.token.length < SHORT_TOKEN_THRESHOLD) {
    console.warn(
      "[BuildBanner] Token is shorter than 16 characters. Short tokens offer minimal protection.",
    );
  }

  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    !_isSafeHostname(window.location.hostname)
  ) {
    console.warn(
      "[BuildBanner] Token auth detected on a public-facing origin. data-token is intended for staging/internal use only.",
    );
  }
}

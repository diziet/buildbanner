/** Console warnings for a data-token that is short or used on a public origin. */

const SHORT_TOKEN_THRESHOLD = 16;

const SAFE_SUFFIXES = [".local", ".internal", ".test"];

const RFC1918_PREFIXES = ["10.", "192.168."];

/**
 * True for a local or internal hostname: localhost, the IPv4 and IPv6
 * loopback addresses, the RFC 1918 private ranges, and the .local, .internal
 * and .test TLDs.
 */
function _isSafeHostname(hostname) {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") {
    return true;
  }
  if (RFC1918_PREFIXES.some((prefix) => hostname.startsWith(prefix))) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
  return SAFE_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

/**
 * Warn about a short token or a token on a public origin. Calls console.warn directly, so data-
 * debug and the log cap do not apply.
 */
export function checkTokenWarnings(config) {
  try {
    if (config.token == null) return;

    if (config.token === "" || config.token.length < SHORT_TOKEN_THRESHOLD) {
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
  } catch {
    /* The warnings are advisory; an error here must not reach the host app. */
  }
}

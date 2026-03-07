/** Fetch module — retrieves banner data from the JSON endpoint. */

const TIMEOUT_MS = 3000;

/**
 * Fetch banner data from the endpoint.
 * Returns parsed JSON object on success, null on any failure.
 * Never throws.
 */
export async function fetchBannerData(endpoint, options = {}) {
  const { token, logger } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const headers = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers,
    });

    clearTimeout(timer);

    if (!response.ok) {
      if (logger) logger.log(`Fetch failed: HTTP ${response.status}`);
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      if (logger) logger.log("Fetch failed: received HTML instead of JSON");
      return null;
    }

    const data = await response.json();

    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      if (logger) logger.log("Fetch failed: response is not a JSON object");
      return null;
    }

    return data;
  } catch (err) {
    clearTimeout(timer);
    const message = err.name === "AbortError"
      ? "Fetch failed: timeout"
      : `Fetch failed: ${err.message}`;
    if (logger) logger.log(message);
    return null;
  }
}

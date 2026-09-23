/** Format the uptime and the deploy age shown in the banner. */

/** Format elapsed milliseconds as "2d 3h", "3h 5m", "5m" or "42s". */
function _formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

/** Parse ISO string and return elapsed ms since that time, or null. */
function _parseElapsedMs(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return null;
  const elapsed = Date.now() - date.getTime();
  if (elapsed < 0) return null;
  return elapsed;
}

/** Compute uptime from server_started ISO string. Returns "up Xh Ym" or null. */
export function formatUptime(serverStartedISO) {
  const elapsed = _parseElapsedMs(serverStartedISO);
  if (elapsed === null) return null;
  return `up ${_formatElapsed(elapsed)}`;
}

/** Compute deploy age from deployed_at ISO string. Returns "deployed Xh ago" or null. */
export function formatDeployAge(deployedAtISO) {
  const elapsed = _parseElapsedMs(deployedAtISO);
  if (elapsed === null) return null;
  return `deployed ${_formatElapsed(elapsed)} ago`;
}

/**
 * Set the element's text to the uptime now and every 60 s after.
 * The first tick after the element leaves the DOM clears the interval. Returns the interval ID.
 */
export function startUptimeTicker(element, serverStartedISO) {
  if (!element || !serverStartedISO) return null;
  const start = new Date(serverStartedISO);
  if (isNaN(start.getTime())) return null;

  const initialElapsed = Date.now() - start.getTime();
  if (initialElapsed >= 0) {
    element.textContent = `up ${_formatElapsed(initialElapsed)}`;
  }

  const timerId = setInterval(() => {
    if (!element.isConnected) {
      clearInterval(timerId);
      return;
    }
    const elapsed = Date.now() - start.getTime();
    if (elapsed >= 0) {
      element.textContent = `up ${_formatElapsed(elapsed)}`;
    }
  }, 60000);

  return timerId;
}

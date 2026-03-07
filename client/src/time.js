/** Time formatting utilities for uptime and deploy age display. */

/** Format elapsed milliseconds as a human-readable uptime string. */
function _formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 0) return null;

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
 * Start a ticker that updates element textContent with live uptime every 60s.
 * Self-cleans if element is removed from DOM. Returns timer ID for cleanup.
 */
export function startUptimeTicker(element, serverStartedISO) {
  if (!element || !serverStartedISO) return null;
  const start = new Date(serverStartedISO);
  if (isNaN(start.getTime())) return null;

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

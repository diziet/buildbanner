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

/** Compute uptime from server_started ISO string. Returns "up Xh Ym" or null. */
export function formatUptime(serverStartedISO) {
  if (!serverStartedISO) return null;
  const start = new Date(serverStartedISO);
  if (isNaN(start.getTime())) return null;
  const elapsed = Date.now() - start.getTime();
  if (elapsed < 0) return null;
  return `up ${_formatElapsed(elapsed)}`;
}

/** Compute deploy age from deployed_at ISO string. Returns "deployed Xh ago" or null. */
export function formatDeployAge(deployedAtISO) {
  if (!deployedAtISO) return null;
  const deployed = new Date(deployedAtISO);
  if (isNaN(deployed.getTime())) return null;
  const elapsed = Date.now() - deployed.getTime();
  if (elapsed < 0) return null;
  return `deployed ${_formatElapsed(elapsed)} ago`;
}

/**
 * Start a ticker that updates element textContent with live uptime every 60s.
 * Returns timer ID for cleanup.
 */
export function startUptimeTicker(element, serverStartedISO) {
  if (!element || !serverStartedISO) return null;
  const start = new Date(serverStartedISO);
  if (isNaN(start.getTime())) return null;

  const update = () => {
    const elapsed = Date.now() - start.getTime();
    if (elapsed >= 0) {
      element.textContent = `up ${_formatElapsed(elapsed)}`;
    }
  };

  return setInterval(update, 60000);
}

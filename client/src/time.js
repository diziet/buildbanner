/** Time formatting utilities for BuildBanner uptime and deploy age. */

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;

/** Format elapsed seconds into a compact human-readable string. */
function _formatElapsed(totalSeconds) {
  if (totalSeconds < 0) totalSeconds = 0;
  const seconds = Math.floor(totalSeconds);

  if (seconds < SECONDS_PER_MINUTE) {
    return `${seconds}s`;
  }
  if (seconds < SECONDS_PER_HOUR) {
    const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
    return `${minutes}m`;
  }
  if (seconds < SECONDS_PER_DAY) {
    const hours = Math.floor(seconds / SECONDS_PER_HOUR);
    const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  const days = Math.floor(seconds / SECONDS_PER_DAY);
  const hours = Math.floor((seconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

/** Compute uptime string from server_started ISO timestamp. Returns null if input is null/undefined. */
export function formatUptime(serverStartedISO) {
  if (serverStartedISO == null) return null;
  const startMs = new Date(serverStartedISO).getTime();
  if (Number.isNaN(startMs)) return null;
  const elapsedSeconds = (Date.now() - startMs) / 1000;
  return `up ${_formatElapsed(elapsedSeconds)}`;
}

/** Compute deploy age string from deployed_at ISO timestamp. Returns null if input is null/undefined. */
export function formatDeployAge(deployedAtISO) {
  if (deployedAtISO == null) return null;
  const deployMs = new Date(deployedAtISO).getTime();
  if (Number.isNaN(deployMs)) return null;
  const elapsedSeconds = (Date.now() - deployMs) / 1000;
  return `deployed ${_formatElapsed(elapsedSeconds)} ago`;
}

/** Start a ticker that updates element.textContent with uptime every 60s. Returns timer ID. */
export function startUptimeTicker(element, serverStartedISO) {
  if (element == null || serverStartedISO == null) return null;
  element.textContent = formatUptime(serverStartedISO);
  return setInterval(() => {
    element.textContent = formatUptime(serverStartedISO);
  }, SECONDS_PER_MINUTE * 1000);
}

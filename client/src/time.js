/** Time formatting utilities for BuildBanner uptime and deploy age display. */

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;

/** Compute elapsed seconds between an ISO timestamp and now. */
function _elapsedSeconds(isoString) {
  const parsed = Date.parse(isoString);
  if (Number.isNaN(parsed)) return null;
  const elapsedMs = Date.now() - parsed;
  if (elapsedMs < 0) return 0;
  return Math.floor(elapsedMs / 1000);
}

/** Format a duration in seconds as a compact human-readable string. */
function _formatDuration(totalSeconds) {
  if (totalSeconds < SECONDS_PER_MINUTE) {
    return `${totalSeconds}s`;
  }
  if (totalSeconds < SECONDS_PER_HOUR) {
    const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
    return `${minutes}m`;
  }
  if (totalSeconds < SECONDS_PER_DAY) {
    const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
    const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  const days = Math.floor(totalSeconds / SECONDS_PER_DAY);
  const hours = Math.floor((totalSeconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

/** Format uptime from server_started ISO timestamp. Returns e.g. "up 2h 15m" or null. */
export function formatUptime(serverStartedISO) {
  if (serverStartedISO == null) return null;
  const elapsed = _elapsedSeconds(serverStartedISO);
  if (elapsed === null) return null;
  return `up ${_formatDuration(elapsed)}`;
}

/** Format deploy age from deployed_at ISO timestamp. Returns e.g. "deployed 3h ago" or null. */
export function formatDeployAge(deployedAtISO) {
  if (deployedAtISO == null) return null;
  const elapsed = _elapsedSeconds(deployedAtISO);
  if (elapsed === null) return null;
  return `deployed ${_formatDuration(elapsed)} ago`;
}

/** Start a ticker that updates element textContent with uptime every 60 seconds. */
export function startUptimeTicker(element, serverStartedISO) {
  if (!element || serverStartedISO == null) return null;
  const update = () => {
    const text = formatUptime(serverStartedISO);
    if (text !== null) {
      element.textContent = text;
    }
  };
  update();
  const timerId = setInterval(update, SECONDS_PER_MINUTE * 1000);
  return timerId;
}

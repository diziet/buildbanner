/** Diagnostic logging module for BuildBanner. */

/** Maximum log calls per logger instance before silently dropping. */
export const LOG_CAP = 20;

const PREFIX = "[BuildBanner] ";

/**
 * Create a logger instance. Always emits console.debug; when debug mode
 * is active (data-debug="true"), also promotes messages to console.warn.
 * @param {boolean} debugEnabled - Maps to config.debug (data-debug attr).
 * @returns {{ log: (message: string) => void }}
 */
export function createLogger(debugEnabled) {
  let callCount = 0;

  return {
    /** Emit a diagnostic message, respecting the session cap. */
    log(message) {
      if (callCount >= LOG_CAP) {
        return;
      }
      callCount++;
      const prefixed = PREFIX + message;
      console.debug(prefixed);
      if (debugEnabled) {
        console.warn(prefixed);
      }
    },
  };
}

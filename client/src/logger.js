/** Diagnostic logging module for BuildBanner. */

/** Maximum log calls per logger instance before silently dropping. */
export const LOG_CAP = 20;

const PREFIX = "[BuildBanner] ";

/**
 * Create a logger instance with optional warn-level promotion.
 * @param {boolean} warnEnabled - When true, also emits console.warn.
 * @returns {{ log: (message: string) => void }}
 */
export function createLogger(warnEnabled) {
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
      if (warnEnabled) {
        console.warn(prefixed);
      }
    },
  };
}

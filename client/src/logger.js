/** Diagnostic logging module with session cap. */

/** Maximum log messages per logger instance. */
export const LOG_CAP = 20;

const PREFIX = "[BuildBanner] ";

/** Create a logger instance with optional debug mode. */
export function createLogger(debugEnabled) {
  let count = 0;

  return {
    /** Log a message via console.debug, and console.warn if debug enabled. */
    log(message) {
      if (count >= LOG_CAP) return;
      count++;
      const text = PREFIX + message;
      console.debug(text);
      if (debugEnabled) {
        console.warn(text);
      }
    },
  };
}

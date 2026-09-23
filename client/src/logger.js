/** Diagnostic logger: console.debug always, and console.warn too when data-debug is set. */

/** Messages one logger writes; it drops later messages without output. */
export const LOG_CAP = 20;

const PREFIX = "[BuildBanner] ";

/**
 * Create a logger. It always writes with console.debug and, when
 * data-debug="true", also with console.warn.
 * @param {boolean} debugEnabled - config.debug, from the data-debug attribute.
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

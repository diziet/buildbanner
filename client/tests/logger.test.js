/** Tests for the diagnostic logging module. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLogger, LOG_CAP } from "../src/logger.js";

describe("createLogger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("log() always calls console.debug", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const logger = createLogger(false);

    logger.log("test message");

    expect(debugSpy).toHaveBeenCalledOnce();
  });

  it("log() calls console.warn only when debugEnabled is true", () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const quietLogger = createLogger(false);
    quietLogger.log("quiet");
    expect(warnSpy).not.toHaveBeenCalled();

    const debugLogger = createLogger(true);
    debugLogger.log("loud");
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("messages are prefixed with [BuildBanner]", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const logger = createLogger(false);

    logger.log("hello");

    expect(debugSpy).toHaveBeenCalledWith("[BuildBanner] hello");
  });

  it("21st call is silently dropped (cap at 20)", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const logger = createLogger(false);

    for (let i = 0; i < LOG_CAP + 5; i++) {
      logger.log(`msg ${i}`);
    }

    expect(debugSpy).toHaveBeenCalledTimes(LOG_CAP);
  });

  it("cap is per logger instance (two instances have separate counts)", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const loggerA = createLogger(false);
    const loggerB = createLogger(false);

    for (let i = 0; i < LOG_CAP; i++) {
      loggerA.log(`a-${i}`);
    }
    expect(debugSpy).toHaveBeenCalledTimes(LOG_CAP);

    loggerB.log("b-first");
    expect(debugSpy).toHaveBeenCalledTimes(LOG_CAP + 1);
  });

  it("console.debug and console.warn receive identical message text", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logger = createLogger(true);

    logger.log("same text");

    const debugArg = debugSpy.mock.calls[0][0];
    const warnArg = warnSpy.mock.calls[0][0];
    expect(debugArg).toBe(warnArg);
  });
});

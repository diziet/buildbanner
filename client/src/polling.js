/** Polling module — periodic data refresh with exponential backoff and visibility awareness. */

const MAX_INTERVAL_SEC = 300;

/** Start polling for banner data updates. */
export function startPolling(config, fetchFn, onData, logger) {
  const baseInterval = config.poll;
  if (!baseInterval || baseInterval <= 0) return null;

  const state = {
    timerId: null,
    listenerRef: null,
    currentInterval: baseInterval,
    stopped: false,
  };

  const _tick = async () => {
    try {
      const data = await fetchFn({ isRefetch: true });
      if (data) {
        state.currentInterval = baseInterval;
        onData(data);
      } else {
        _backoff(state, baseInterval);
        if (logger) logger.log(`Poll failed, backing off to ${state.currentInterval}s`);
      }
    } catch {
      _backoff(state, baseInterval);
      if (logger) logger.log(`Poll error, backing off to ${state.currentInterval}s`);
    }

    if (!state.stopped) {
      _scheduleNext(state, _tick);
    }
  };

  const _onVisibilityChange = () => {
    if (state.stopped) return;

    if (document.hidden) {
      _clearTimer(state);
    } else {
      _clearTimer(state);
      _tick();
    }
  };

  state.listenerRef = _onVisibilityChange;
  document.addEventListener("visibilitychange", _onVisibilityChange);

  _scheduleNext(state, _tick);

  return state;
}

/** Stop polling and remove all listeners. */
export function stopPolling(state) {
  if (!state) return;
  state.stopped = true;
  _clearTimer(state);

  if (state.listenerRef) {
    document.removeEventListener("visibilitychange", state.listenerRef);
    state.listenerRef = null;
  }
}

/** Double the current interval, capped at MAX_INTERVAL_SEC. */
function _backoff(state, baseInterval) {
  const doubled = state.currentInterval * 2;
  state.currentInterval = Math.min(doubled, MAX_INTERVAL_SEC);
}

/** Schedule the next tick using setTimeout. */
function _scheduleNext(state, tickFn) {
  state.timerId = setTimeout(tickFn, state.currentInterval * 1000);
}

/** Clear the current timer. */
function _clearTimer(state) {
  if (state.timerId != null) {
    clearTimeout(state.timerId);
    state.timerId = null;
  }
}

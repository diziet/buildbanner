/** Segment rendering — builds the full banner content in canonical order. */

import { formatUptime, formatDeployAge, startUptimeTicker } from "./time.js";

const STATUS_DOTS = {
  pass: "\u{1F7E2}",
  fresh: "\u{1F7E2}",
  fail: "\u{1F534}",
  stale: "\u{1F534}",
  running: "\u{1F7E1}",
  building: "\u{1F7E1}",
  idle: "\u26AA",
};

const DEFAULT_DOT = "\u26AA";

/** Get the status dot emoji for a given status string. */
function _getStatusDot(status) {
  if (!status) return DEFAULT_DOT;
  return STATUS_DOTS[status.toLowerCase()] || DEFAULT_DOT;
}

/** Create a separator span with ' · '. */
function _createSeparator() {
  const sep = document.createElement("span");
  sep.textContent = " \u00B7 ";
  return sep;
}

/** Create a plain span segment with data-segment attribute. */
function _createSpan(segmentName, text) {
  const span = document.createElement("span");
  span.setAttribute("data-segment", segmentName);
  span.textContent = text;
  return span;
}

/** Create a status segment (span or anchor if url present). */
function _createStatusSegment(segmentName, statusObj) {
  if (!statusObj || !statusObj.status) return null;

  const dot = _getStatusDot(statusObj.status);
  const text = statusObj.summary
    ? `${dot} ${statusObj.summary}`
    : `${dot} ${statusObj.status}`;

  if (statusObj.url) {
    const anchor = document.createElement("a");
    anchor.setAttribute("data-segment", segmentName);
    anchor.href = statusObj.url;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    anchor.textContent = text;
    return anchor;
  }

  return _createSpan(segmentName, text);
}

/** Check if branch should be hidden (HEAD, null, empty). */
function _isBranchHidden(branch) {
  return !branch || branch === "HEAD";
}

/** Convert ISO 8601 UTC date to local time string. */
function _formatCommitDate(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

/** Append a segment to the wrapper with separator if needed. */
function _appendSegment(wrapper, segment, isFirst) {
  if (!isFirst) {
    wrapper.appendChild(_createSeparator());
  }
  wrapper.appendChild(segment);
}

/**
 * Render all segments into the wrapper in canonical order.
 * Returns { wrapper, tickerTimerId }.
 */
export function renderSegments(data, config, wrapper) {
  const segments = [];
  let tickerTimerId = null;

  // 1. app_name
  if (data.app_name) {
    segments.push(_createSpan("app-name", data.app_name));
  }

  // 2. environment
  if (data.environment) {
    segments.push(_createSpan("environment", data.environment));
  }

  // 3. branch (hidden if HEAD, null, or empty)
  if (!_isBranchHidden(data.branch)) {
    segments.push(_createSpan("branch", data.branch));
  }

  // 4. sha
  if (data.sha) {
    segments.push(_createSpan("sha", data.sha));
  }

  // 5. commit_date (converted to local time)
  const commitDateStr = _formatCommitDate(data.commit_date);
  if (commitDateStr) {
    segments.push(_createSpan("commit-date", commitDateStr));
  }

  // 6. uptime and/or deploy age
  const uptimeStr = formatUptime(data.server_started);
  if (uptimeStr) {
    const uptimeSpan = _createSpan("uptime", uptimeStr);
    segments.push(uptimeSpan);
    tickerTimerId = startUptimeTicker(uptimeSpan, data.server_started);
  }

  const deployAgeStr = formatDeployAge(data.deployed_at);
  if (deployAgeStr) {
    segments.push(_createSpan("deploy-age", deployAgeStr));
  }

  // 7. tests then build status
  const testsSegment = _createStatusSegment("tests", data.tests);
  if (testsSegment) {
    segments.push(testsSegment);
  }

  const buildSegment = _createStatusSegment("build", data.build);
  if (buildSegment) {
    segments.push(buildSegment);
  }

  // 8. port
  if (data.port !== null && data.port !== undefined) {
    segments.push(_createSpan("port", String(data.port)));
  }

  // 9. custom fields in alphabetical key order
  if (data.custom && typeof data.custom === "object") {
    const keys = Object.keys(data.custom).sort();
    for (const key of keys) {
      const value = data.custom[key];
      if (typeof value === "string") {
        segments.push(_createSpan(`custom-${key}`, value));
      }
    }
  }

  // Append all segments with separators
  for (let i = 0; i < segments.length; i++) {
    _appendSegment(wrapper, segments[i], i === 0);
  }

  return { wrapper, tickerTimerId };
}

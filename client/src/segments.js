/** Segment rendering — builds the full banner content in canonical order. */

import { formatUptime, formatDeployAge, startUptimeTicker } from "./time.js";
import { createLink } from "./links.js";
import { attachCopyHandler } from "./clipboard.js";
import { createLogger } from "./logger.js";
import { getShaColor } from "./sha-color.js";

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
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

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

/** Check if a URL has a safe protocol (http/https only). */
function _isSafeUrl(url) {
  try {
    const parsed = new URL(url, window.location.origin);
    return ALLOWED_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

/** Create a status segment (span or anchor if url present and safe). */
function _createStatusSegment(segmentName, statusObj) {
  if (!statusObj || !statusObj.status) return null;

  const dot = _getStatusDot(statusObj.status);
  const text = statusObj.summary
    ? `${dot} ${statusObj.summary}`
    : `${dot} ${statusObj.status}`;

  if (statusObj.url && _isSafeUrl(statusObj.url)) {
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

/** Create a segment wrapped in an anchor tag for linked content. */
function _createLinkedSpan(segmentName, text, href) {
  const anchor = document.createElement("a");
  anchor.setAttribute("data-segment", segmentName);
  anchor.href = href;
  anchor.target = "_blank";
  anchor.rel = "noopener";
  anchor.textContent = text;
  return anchor;
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

/** Create a segment, wrapping in an anchor if linkUrl is available. */
function _createMaybeLinkedSegment(segmentName, text, linkUrl) {
  return linkUrl
    ? _createLinkedSpan(segmentName, text, linkUrl)
    : _createSpan(segmentName, text);
}

/** Check if status value changed from previous, updating tracker. */
function _hasStatusChanged(field, newStatus, previousStatuses) {
  const current = newStatus && newStatus.status ? newStatus.status : null;
  const isFirstTrack = !(field in previousStatuses);
  const prev = previousStatuses[field];
  previousStatuses[field] = current;
  if (isFirstTrack) return true;
  return prev !== current;
}

/** Build the status container div, with ARIA live attrs only when isLive is true. */
function _buildStatusContainer(testsSegment, buildSegment, isLive) {
  const container = document.createElement("div");
  container.className = "bb-live-region";
  container.setAttribute("data-bb-live-region", "");
  if (isLive) {
    container.setAttribute("role", "status");
    container.setAttribute("aria-live", "polite");
  }
  let isFirst = true;
  if (testsSegment) {
    _appendSegment(container, testsSegment, isFirst);
    isFirst = false;
  }
  if (buildSegment) {
    _appendSegment(container, buildSegment, isFirst);
  }
  return container;
}

/** Resolve effective theme, handling "auto" via matchMedia. */
function _resolveEffectiveTheme(theme) {
  if (theme === "light") return "light";
  if (theme === "auto" && typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return "dark";
}

/** Render all segments into the wrapper in canonical order. Returns { tickerTimerId, shaColor }. */
export function renderSegments(data, wrapper, config = {}, previousStatuses = {}) {
  const segments = [];
  let tickerTimerId = null;
  let shaColor = null;
  const hostPatterns = config.hostPatterns || [];

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
    const branchLink = createLink(data.repo_url, "tree", data.branch, hostPatterns);
    segments.push(_createMaybeLinkedSegment("branch", data.branch, branchLink));
  }

  // 4. sha (with click-to-copy and optional color)
  if (data.sha) {
    const shaValue = data.sha_full || data.sha;
    const shaLink = createLink(data.repo_url, "commit", shaValue, hostPatterns);
    const shaEl = _createMaybeLinkedSegment("sha", data.sha, shaLink);
    shaEl.classList.add("bb-clickable");
    if (config.shaColor !== "off") {
      const effectiveTheme = _resolveEffectiveTheme(config.theme);
      const color = getShaColor(shaValue, effectiveTheme);
      if (color) {
        shaColor = color;
        shaEl.classList.add("bb-sha-color");
      }
    }
    const logger = createLogger(config.debug);
    attachCopyHandler(shaEl, shaValue, logger);
    segments.push(shaEl);
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

  // 7. tests then build status — wrapped in ARIA live region
  const testsSegment = _createStatusSegment("tests", data.tests);
  const buildSegment = _createStatusSegment("build", data.build);
  const hasStatusSegments = testsSegment || buildSegment;

  if (hasStatusSegments) {
    const testsChanged = _hasStatusChanged("tests", data.tests, previousStatuses);
    const buildChanged = _hasStatusChanged("build", data.build, previousStatuses);
    const isLive = testsChanged || buildChanged;
    segments.push(_buildStatusContainer(testsSegment, buildSegment, isLive));
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

  return { tickerTimerId, shaColor };
}

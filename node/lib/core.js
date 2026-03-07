/** BuildBanner Node.js core — git info extraction and JSON response builder. */
'use strict';

const childProcess = require('child_process');
const crypto = require('crypto');

const SHORT_SHA_LEN = 7;
const FULL_SHA_LEN = 40;
const MIN_TOKEN_LEN = 16;

// Mutable reference for testing — tests can replace _exec to mock git calls.
let _exec = childProcess.execSync;

/** Run a git command, return trimmed stdout or null on failure. */
function _runGit(command) {
  try {
    return _exec(command, {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

/** Replace the exec function (for testing). */
function _setExec(fn) {
  _exec = fn;
}

/** Restore the default exec function. */
function _resetExec() {
  _exec = childProcess.execSync;
}

/** Read git info by spawning git subprocesses. */
function _readGitInfo() {
  const logLine = _runGit('git log -1 --format="%H %h %cd" --date=iso-strict');
  let shaFull = null;
  let sha = null;
  let commitDate = null;

  if (logLine) {
    const parts = logLine.split(' ');
    shaFull = parts[0] || null;
    // Derive short SHA deterministically — git %h length varies by repo
    sha = shaFull ? shaFull.slice(0, SHORT_SHA_LEN) : null;
    commitDate = parts[2] || null;
  }

  let branch = _runGit('git rev-parse --abbrev-ref HEAD');
  if (branch === 'HEAD') {
    const tag = _runGit('git describe --tags --exact-match');
    branch = tag || null;
  }

  const repoUrl = _runGit('git remote get-url origin');

  return { sha, shaFull, branch, commitDate, repoUrl };
}

/** Sanitize a repo URL — strip userinfo, .git suffix, trailing slashes. */
function _sanitizeUrl(raw) {
  if (!raw) return null;

  let url = raw;

  // Convert SSH shorthand (git@host:org/repo.git) to HTTPS
  const sshMatch = url.match(/^[\w.-]+@([\w.-]+):(.*)/);
  if (sshMatch) {
    url = `https://${sshMatch[1]}/${sshMatch[2]}`;
  }

  // Convert ssh:// protocol to https://
  if (url.startsWith('ssh://')) {
    url = url.replace(/^ssh:\/\//, 'https://');
  }

  try {
    const parsed = new URL(url);
    parsed.username = '';
    parsed.password = '';
    url = parsed.toString();
  } catch {
    return null;
  }

  url = url.replace(/\.git$/, '');
  url = url.replace(/\/+$/, '');

  return url;
}

/** Merge source entries into target, stringifying values and omitting nulls. */
function _mergeCustomFields(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value == null) continue;
    target[key] = String(value);
  }
}

/** Read custom fields from BUILDBANNER_CUSTOM_* env vars. */
function _readCustomEnv() {
  const custom = {};
  const prefix = 'BUILDBANNER_CUSTOM_';

  for (const key of Object.keys(process.env)) {
    if (key.startsWith(prefix) && key.length > prefix.length) {
      const suffix = key.slice(prefix.length).toLowerCase();
      const value = process.env[key];
      if (value != null) {
        custom[suffix] = String(value);
      }
    }
  }

  return Object.keys(custom).length > 0 ? custom : null;
}

/** Apply env var overrides to git-derived values. */
function _applyEnvOverrides(gitInfo) {
  const info = { ...gitInfo };

  if (process.env.BUILDBANNER_SHA) {
    const envSha = process.env.BUILDBANNER_SHA;
    info.sha = envSha.slice(0, SHORT_SHA_LEN);
    if (envSha.length >= FULL_SHA_LEN) {
      info.shaFull = envSha;
    }
  }

  if (process.env.BUILDBANNER_BRANCH) {
    info.branch = process.env.BUILDBANNER_BRANCH;
  }

  if (process.env.BUILDBANNER_REPO_URL) {
    info.repoUrl = process.env.BUILDBANNER_REPO_URL;
  }

  if (process.env.BUILDBANNER_COMMIT_DATE) {
    info.commitDate = process.env.BUILDBANNER_COMMIT_DATE;
  }

  return info;
}

/** Constant-time string comparison to prevent timing attacks. */
function _safeCompare(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Create a BuildBanner handler configuration.
 * @param {object} [options] - Configuration options.
 * @param {string} [options.token] - Auth token for endpoint protection.
 * @param {Function} [options.extras] - Callback returning dynamic fields.
 * @returns {{ getBannerData: Function, checkAuth: Function }}
 */
function createBanner(options = {}) {
  // Read git info once at creation time (cached for all subsequent calls)
  const gitInfo = _readGitInfo();
  const staticInfo = _applyEnvOverrides(gitInfo);
  const customEnv = _readCustomEnv();
  const serverStarted = new Date().toISOString();

  // Snapshot env values at creation time
  const deployedAt = process.env.BUILDBANNER_DEPLOYED_AT || null;
  const appName = process.env.BUILDBANNER_APP_NAME || null;
  const environment = process.env.BUILDBANNER_ENVIRONMENT || null;
  const portStr = process.env.BUILDBANNER_PORT;
  const portParsed = portStr ? parseInt(portStr, 10) : null;
  const port = Number.isNaN(portParsed) ? null : portParsed;

  let extrasErrorLogged = false;

  // Token: programmatic wins over env var (nullish coalescing)
  const token = options.token ?? process.env.BUILDBANNER_TOKEN ?? null;
  let authEnabled = false;

  if (token) {
    if (token.length < MIN_TOKEN_LEN) {
      console.warn(
        'BuildBanner: token is shorter than 16 characters, auth check disabled'
      );
    } else {
      authEnabled = true;
      if (environment === 'production') {
        console.warn(
          'BuildBanner: token auth is enabled in production environment'
        );
      }
    }
  }

  /** Get the banner data object. */
  function getBannerData() {
    const data = {
      _buildbanner: { version: 1 },
      sha: staticInfo.sha,
      sha_full: staticInfo.shaFull,
      branch: staticInfo.branch,
      commit_date: staticInfo.commitDate || null,
      repo_url: _sanitizeUrl(staticInfo.repoUrl),
      server_started: serverStarted,
      deployed_at: deployedAt,
      app_name: appName,
      environment,
      port,
    };

    let custom = customEnv ? { ...customEnv } : null;

    if (options && typeof options.extras === 'function') {
      try {
        const extras = options.extras();
        if (extras && typeof extras === 'object') {
          for (const [key, value] of Object.entries(extras)) {
            if (key === 'custom' && value && typeof value === 'object') {
              custom = custom || {};
              _mergeCustomFields(custom, value);
            } else if (key !== '_buildbanner') {
              data[key] = value;
            }
          }
        }
      } catch (err) {
        if (!extrasErrorLogged) {
          console.error(
            `BuildBanner: extras callback threw: ${err.message}`
          );
          extrasErrorLogged = true;
        }
      }
    }

    if (custom) {
      if (Object.keys(custom).length > 0) {
        data.custom = custom;
      }
    }

    // Remove null top-level fields
    for (const key of Object.keys(data)) {
      if (data[key] === null && key !== '_buildbanner') {
        delete data[key];
      }
    }

    return data;
  }

  /** Check authorization header against configured token. */
  function checkAuth(authHeader) {
    if (!authEnabled) {
      return { authorized: true };
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { authorized: false };
    }

    const provided = authHeader.slice('Bearer '.length);
    return { authorized: _safeCompare(provided, token) };
  }

  return { getBannerData, checkAuth };
}

module.exports = {
  createBanner,
  _sanitizeUrl,
  _runGit,
  _readGitInfo,
  _setExec,
  _resetExec,
};

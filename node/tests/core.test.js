/** Tests for node/lib/core.js — BuildBanner Node core module. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  createBanner,
  _sanitizeUrl,
  _setExec,
  _resetExec,
} from '../lib/core.js';

const FIXTURES = JSON.parse(
  readFileSync(join(__dirname, '../../shared/test_fixtures.json'), 'utf8')
);

const FAKE_SHA_FULL = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
const FAKE_SHA_SHORT = 'a1b2c3d';
const FAKE_COMMIT_DATE = '2026-02-13T14:25:00+00:00';
const FAKE_BRANCH = 'main';
const FAKE_REMOTE = 'https://github.com/org/repo.git';
const FAKE_TOKEN = 'abcdefghijklmnop';

function makeGitLogOutput() {
  return `${FAKE_SHA_FULL} ${FAKE_SHA_SHORT} ${FAKE_COMMIT_DATE}`;
}

/** Create a mock execSync with configurable git responses. */
function mockGit(overrides = {}) {
  const defaults = {
    'git log': makeGitLogOutput(),
    'git rev-parse': FAKE_BRANCH,
    'git remote': FAKE_REMOTE,
    'git describe': null,
  };
  const responses = { ...defaults, ...overrides };

  _setExec((cmd) => {
    for (const [prefix, value] of Object.entries(responses)) {
      if (cmd.startsWith(prefix)) {
        if (value === null) throw new Error('git command failed');
        return value;
      }
    }
    throw new Error(`Unmocked git command: ${cmd}`);
  });
}

/** Mock git that always fails. */
function mockGitFail() {
  _setExec(() => {
    throw new Error('git not found');
  });
}

let savedBuildbannerEnv = {};

/** Clear BUILDBANNER_ env vars and set overrides. */
function setEnv(overrides = {}) {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('BUILDBANNER_')) {
      savedBuildbannerEnv[key] = process.env[key];
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value;
  }
}

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('BUILDBANNER_')) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(savedBuildbannerEnv)) {
    process.env[key] = value;
  }
  savedBuildbannerEnv = {};
}

beforeEach(() => {
  setEnv();
});

afterEach(() => {
  _resetExec();
  restoreEnv();
  vi.restoreAllMocks();
});

describe('core — happy path', () => {
  it('returns all fields with _buildbanner.version === 1', () => {
    mockGit();
    const data = createBanner().getBannerData();

    expect(data._buildbanner).toEqual({ version: 1 });
    expect(data.sha).toBe(FAKE_SHA_SHORT);
    expect(data.sha_full).toBe(FAKE_SHA_FULL);
    expect(data.branch).toBe(FAKE_BRANCH);
    expect(data.repo_url).toBe('https://github.com/org/repo');
    expect(typeof data.server_started).toBe('string');
  });

  it('sha is 7 chars and sha_full is 40 chars', () => {
    mockGit();
    const data = createBanner().getBannerData();

    expect(data.sha).toHaveLength(7);
    expect(data.sha_full).toHaveLength(40);
  });

  it('server_started is ISO 8601', () => {
    mockGit();
    const data = createBanner().getBannerData();

    const parsed = new Date(data.server_started);
    expect(parsed.toISOString()).toBe(data.server_started);
  });
});

describe('core — env var overrides', () => {
  it('env vars override git values', () => {
    mockGit();
    setEnv({
      BUILDBANNER_SHA: 'ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00',
      BUILDBANNER_BRANCH: 'env-branch',
      BUILDBANNER_REPO_URL: 'https://gitlab.com/other/project',
      BUILDBANNER_COMMIT_DATE: '2026-03-01T00:00:00Z',
    });
    const data = createBanner().getBannerData();

    expect(data.sha).toBe('ff00ff0');
    expect(data.sha_full).toBe('ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00');
    expect(data.branch).toBe('env-branch');
    expect(data.repo_url).toBe('https://gitlab.com/other/project');
    expect(data.commit_date).toBe('2026-03-01T00:00:00Z');
  });

  it('env SHA with 8+ chars also sets sha_full', () => {
    mockGitFail();
    setEnv({ BUILDBANNER_SHA: 'aabbccddee112233' });
    const data = createBanner().getBannerData();
    expect(data.sha).toBe('aabbccd');
    expect(data.sha_full).toBe('aabbccddee112233');
  });

  it('env SHA with <8 chars does not set sha_full', () => {
    mockGitFail();
    setEnv({ BUILDBANNER_SHA: 'aabbccd' });
    const data = createBanner().getBannerData();
    expect(data.sha).toBe('aabbccd');
    expect(data).not.toHaveProperty('sha_full');
  });

  it('BUILDBANNER_APP_NAME maps to app_name', () => {
    mockGit();
    setEnv({ BUILDBANNER_APP_NAME: 'my-app' });
    const data = createBanner().getBannerData();
    expect(data.app_name).toBe('my-app');
  });

  it('BUILDBANNER_ENVIRONMENT maps to environment', () => {
    mockGit();
    setEnv({ BUILDBANNER_ENVIRONMENT: 'staging' });
    const data = createBanner().getBannerData();
    expect(data.environment).toBe('staging');
  });

  it('BUILDBANNER_PORT maps to port as integer', () => {
    mockGit();
    setEnv({ BUILDBANNER_PORT: '3000' });
    const data = createBanner().getBannerData();
    expect(data.port).toBe(3000);
    expect(typeof data.port).toBe('number');
  });

  it('non-numeric BUILDBANNER_PORT is treated as null', () => {
    mockGit();
    setEnv({ BUILDBANNER_PORT: 'abc' });
    const data = createBanner().getBannerData();
    expect(data).not.toHaveProperty('port');
  });
});

describe('core — custom fields', () => {
  it('BUILDBANNER_CUSTOM_MODEL maps to custom.model', () => {
    mockGit();
    setEnv({ BUILDBANNER_CUSTOM_MODEL: 'gpt4' });
    const data = createBanner().getBannerData();
    expect(data.custom.model).toBe('gpt4');
  });

  it('multiple BUILDBANNER_CUSTOM_* vars build full custom map', () => {
    mockGit();
    setEnv({
      BUILDBANNER_CUSTOM_MODEL: 'gpt4',
      BUILDBANNER_CUSTOM_REGION: 'us-east-1',
      BUILDBANNER_CUSTOM_WORKERS: '4',
    });
    const data = createBanner().getBannerData();
    expect(data.custom).toEqual({
      model: 'gpt4',
      region: 'us-east-1',
      workers: '4',
    });
  });

  it('custom integer value is stringified', () => {
    mockGit();
    const data = createBanner({
      extras: () => ({ custom: { count: 42 } }),
    }).getBannerData();
    expect(data.custom.count).toBe('42');
  });

  it('custom null value is omitted', () => {
    mockGit();
    const data = createBanner({
      extras: () => ({ custom: { keep: 'yes', drop: null } }),
    }).getBannerData();
    expect(data.custom.keep).toBe('yes');
    expect(data.custom).not.toHaveProperty('drop');
  });
});

describe('core — extras callback', () => {
  it('extras callback merges custom (extras wins on conflict)', () => {
    mockGit();
    setEnv({
      BUILDBANNER_CUSTOM_MODEL: 'env-model',
      BUILDBANNER_CUSTOM_REGION: 'us-west-2',
    });
    const data = createBanner({
      extras: () => ({ custom: { model: 'extras-model', flavor: 'vanilla' } }),
    }).getBannerData();
    expect(data.custom.model).toBe('extras-model');
    expect(data.custom.region).toBe('us-west-2');
    expect(data.custom.flavor).toBe('vanilla');
  });

  it('extras that throws returns response without extras, logged once', () => {
    mockGit();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const banner = createBanner({
      extras: () => { throw new Error('boom'); },
    });
    const data = banner.getBannerData();
    expect(data._buildbanner).toEqual({ version: 1 });
    expect(data.sha).toBe(FAKE_SHA_SHORT);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    banner.getBannerData();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});

describe('core — URL sanitization', () => {
  it('passes all fixture cases', () => {
    for (const fixture of FIXTURES.url_sanitization) {
      const result = _sanitizeUrl(fixture.input);
      expect(result).toBe(fixture.expected);
    }
  });
});

describe('core — branch detection', () => {
  it('detached HEAD with tag uses tag as branch', () => {
    mockGit({
      'git rev-parse': 'HEAD',
      'git describe': 'v1.2.3',
    });
    const data = createBanner().getBannerData();
    expect(data.branch).toBe('v1.2.3');
  });

  it('detached HEAD without tag — branch is null', () => {
    mockGit({
      'git rev-parse': 'HEAD',
      'git describe': null,
    });
    const data = createBanner().getBannerData();
    expect(data).not.toHaveProperty('branch');
  });
});

describe('core — git fallback', () => {
  it('git not available — falls back to env vars', () => {
    mockGitFail();
    setEnv({
      BUILDBANNER_SHA: 'aabbccddee112233aabbccddee112233aabbccdd',
      BUILDBANNER_BRANCH: 'env-only',
    });
    const data = createBanner().getBannerData();
    expect(data.sha).toBe('aabbccd');
    expect(data.branch).toBe('env-only');
  });

  it('no git and no env vars — sha/branch are null', () => {
    mockGitFail();
    const data = createBanner().getBannerData();
    expect(data).not.toHaveProperty('sha');
    expect(data).not.toHaveProperty('branch');
  });
});

describe('core — token auth', () => {
  it('valid token passes', () => {
    mockGit();
    const { checkAuth } = createBanner({ token: FAKE_TOKEN });
    expect(checkAuth(`Bearer ${FAKE_TOKEN}`).authorized).toBe(true);
  });

  it('invalid token is rejected', () => {
    mockGit();
    const { checkAuth } = createBanner({ token: FAKE_TOKEN });
    expect(checkAuth('Bearer wrong-token-here').authorized).toBe(false);
  });

  it('missing header is rejected', () => {
    mockGit();
    const { checkAuth } = createBanner({ token: FAKE_TOKEN });
    expect(checkAuth(null).authorized).toBe(false);
  });

  it('no token configured — no auth check', () => {
    mockGit();
    const { checkAuth } = createBanner();
    expect(checkAuth(null).authorized).toBe(true);
    expect(checkAuth('Bearer anything').authorized).toBe(true);
  });

  it('short token (<16 chars) — auth disabled with warning', () => {
    mockGit();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { checkAuth } = createBanner({ token: 'short' });

    expect(warnSpy).toHaveBeenCalledWith(
      'BuildBanner: token is shorter than 16 characters, auth check disabled'
    );
    expect(checkAuth(null).authorized).toBe(true);
    warnSpy.mockRestore();
  });

  it('production env with token — warning logged', () => {
    mockGit();
    setEnv({ BUILDBANNER_ENVIRONMENT: 'production' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createBanner({ token: FAKE_TOKEN });

    expect(warnSpy).toHaveBeenCalledWith(
      'BuildBanner: token auth is enabled in production environment'
    );
    warnSpy.mockRestore();
  });

  it('BUILDBANNER_TOKEN env var used as fallback', () => {
    mockGit();
    setEnv({ BUILDBANNER_TOKEN: 'env-token-16chars!' });
    const { checkAuth } = createBanner();
    expect(checkAuth('Bearer env-token-16chars!').authorized).toBe(true);
    expect(checkAuth('Bearer wrong').authorized).toBe(false);
  });

  it('programmatic token wins over BUILDBANNER_TOKEN', () => {
    mockGit();
    setEnv({ BUILDBANNER_TOKEN: 'env-token-16chars!' });
    const { checkAuth } = createBanner({
      token: 'prog-token-16chars',
    });
    expect(checkAuth('Bearer prog-token-16chars').authorized).toBe(true);
    expect(checkAuth('Bearer env-token-16chars!').authorized).toBe(false);
  });

  it('empty string token disables auth (does not fall to env)', () => {
    mockGit();
    setEnv({ BUILDBANNER_TOKEN: 'env-token-16chars!' });
    const { checkAuth } = createBanner({ token: '' });
    expect(checkAuth(null).authorized).toBe(true);
  });
});

describe('core — caching', () => {
  it('getBannerData() twice returns same server_started', () => {
    mockGit();
    const { getBannerData } = createBanner();
    const first = getBannerData();
    const second = getBannerData();
    expect(first.server_started).toBe(second.server_started);
  });
});

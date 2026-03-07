/** Parity tests — verify Node server helper matches shared fixtures exactly. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  createBanner,
  _sanitizeUrl,
  _setExec,
  _resetExec,
} from '../../node/lib/core.js';

const FIXTURES = JSON.parse(
  readFileSync(join(__dirname, '../../shared/test_fixtures.json'), 'utf8')
);

const DEFAULTS = FIXTURES.defaults;

// Node's git log format is "%H %h %cd" — 3 space-separated tokens.
const GIT_LOG_OUTPUT =
  `${DEFAULTS.sha_full} ${DEFAULTS.sha_short} ${DEFAULTS.commit_date}`;

const TYPE_MAP = {
  string: 'string',
  integer: 'number',
  object: 'object',
};

let savedEnv = {};

/** Clear BUILDBANNER_ env vars and set overrides. */
function setEnv(overrides = {}) {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('BUILDBANNER_')) {
      savedEnv[key] = process.env[key];
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
  for (const [key, value] of Object.entries(savedEnv)) {
    process.env[key] = value;
  }
  savedEnv = {};
}

/** Create a mock execSync with configurable git responses. */
function mockGit(overrides = {}) {
  const defaults = {
    'git log': GIT_LOG_OUTPUT,
    'git rev-parse': DEFAULTS.branch,
    'git remote': DEFAULTS.remote_url,
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

beforeEach(() => {
  setEnv();
});

afterEach(() => {
  _resetExec();
  restoreEnv();
});

describe('parity — URL sanitization', () => {
  for (const fixture of FIXTURES.url_sanitization) {
    const label = fixture.input ?? 'null';
    it(`sanitizes ${JSON.stringify(label)} to ${JSON.stringify(fixture.expected)}`, () => {
      expect(_sanitizeUrl(fixture.input)).toBe(fixture.expected);
    });
  }
});

describe('parity — branch detection', () => {
  for (const fixture of FIXTURES.branch_detection) {
    const label = `input=${fixture.input}, tag=${fixture.tag}`;
    it(`resolves branch for ${label} to ${JSON.stringify(fixture.expected)}`, () => {
      const gitOverrides = {
        'git rev-parse': fixture.input,
      };
      if (fixture.tag) {
        gitOverrides['git describe'] = fixture.tag;
      } else {
        gitOverrides['git describe'] = null;
      }
      mockGit(gitOverrides);

      const data = createBanner().getBannerData();
      const actual = data.branch ?? null;
      expect(actual).toBe(fixture.expected);
    });
  }
});

describe('parity — _buildbanner.version', () => {
  it('is always 1', () => {
    mockGit();
    const data = createBanner().getBannerData();
    expect(data._buildbanner).toEqual({ version: 1 });
  });
});

describe('parity — sha and sha_full', () => {
  it('emits both sha (7 chars) and sha_full (40 chars)', () => {
    mockGit();
    const data = createBanner().getBannerData();

    expect(data.sha).toHaveLength(7);
    expect(data.sha_full).toHaveLength(40);
    expect(data.sha).toBe(data.sha_full.slice(0, 7));
  });
});

describe('parity — custom field stringification', () => {
  it('integer custom value is stringified', () => {
    mockGit();
    const data = createBanner({
      extras: () => ({ custom: { count: 42 } }),
    }).getBannerData();

    expect(data.custom.count).toBe('42');
    expect(typeof data.custom.count).toBe('string');
  });

  it('null custom value is omitted', () => {
    mockGit();
    const data = createBanner({
      extras: () => ({ custom: { keep: 'yes', drop: null } }),
    }).getBannerData();

    expect(data.custom.keep).toBe('yes');
    expect(data.custom).not.toHaveProperty('drop');
  });
});

describe('parity — BUILDBANNER_CUSTOM_* env vars', () => {
  it('lowercases suffix and maps to custom object', () => {
    mockGit();
    setEnv({
      BUILDBANNER_CUSTOM_MODEL: 'gpt-4',
      BUILDBANNER_CUSTOM_REGION: 'us-east-1',
      BUILDBANNER_CUSTOM_WORKERS: '4',
    });
    const data = createBanner().getBannerData();

    expect(data.custom).toEqual({
      model: 'gpt-4',
      region: 'us-east-1',
      workers: '4',
    });
  });

  it('BUILDBANNER_CUSTOM_ with uppercase suffix is lowercased', () => {
    mockGit();
    setEnv({ BUILDBANNER_CUSTOM_MY_KEY: 'value' });
    const data = createBanner().getBannerData();

    expect(data.custom).toHaveProperty('my_key');
    expect(data.custom.my_key).toBe('value');
  });
});

describe('parity — JSON structure and field names', () => {
  it('full response has expected top-level field names', () => {
    mockGit();
    setEnv({
      BUILDBANNER_APP_NAME: 'my-app',
      BUILDBANNER_ENVIRONMENT: 'development',
      BUILDBANNER_PORT: '8001',
      BUILDBANNER_DEPLOYED_AT: '2026-02-13T12:00:00Z',
      BUILDBANNER_CUSTOM_MODEL: 'gpt-4',
    });
    const data = createBanner().getBannerData();

    for (const key of FIXTURES.expected_top_level_keys) {
      expect(data).toHaveProperty(key);
    }

    // Verify types from shared field_types spec
    for (const [field, jsonType] of Object.entries(FIXTURES.field_types)) {
      if (field in data) {
        expect(typeof data[field]).toBe(TYPE_MAP[jsonType]);
      }
    }
    expect(data._buildbanner.version).toBe(1);
  });

  it('null top-level fields are omitted from response', () => {
    mockGit({
      'git log': null,
      'git rev-parse': null,
      'git remote': null,
      'git describe': null,
    });
    const data = createBanner().getBannerData();

    expect(data._buildbanner).toEqual({ version: 1 });
    expect(data).toHaveProperty('server_started');
    // Null fields should be absent, not present with null value
    if ('sha' in data) expect(data.sha).not.toBeNull();
    if ('branch' in data) expect(data.branch).not.toBeNull();
    if ('repo_url' in data) expect(data.repo_url).not.toBeNull();
  });
});

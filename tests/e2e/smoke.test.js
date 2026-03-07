/** E2E smoke tests — wires built client + Express middleware in a real browser. */
const { test, expect } = require('@playwright/test');
const { createServer, closeServer } = require('./test-server');

const BANNER_SELECTOR = '[data-testid="buildbanner"]';
const BANNER_TIMEOUT = 5000;
const DISMISS_TIMEOUT = 3000;

const FIXTURE = {
  sha: 'a1b2c3d',
  sha_full: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
  branch: 'main',
  repo_url: 'https://github.com/acme/widget',
  commit_date: '2026-01-15T10:30:00Z',
  environment: 'development',
  custom: { model: 'test', region: 'us-east-1' },
};

let server;
let baseUrl;

test.beforeAll(async () => {
  const result = await createServer(FIXTURE);
  server = result.server;
  baseUrl = result.baseUrl;
});

test.afterAll(async () => {
  if (server) await closeServer(server);
});

/** Navigate to URL and wait for banner to appear. */
async function goAndWaitForBanner(page, url) {
  await page.goto(url);
  await page.locator(BANNER_SELECTOR).waitFor({ timeout: BANNER_TIMEOUT });
}

/** Query an element inside the banner's Shadow DOM. */
async function shadowQuery(page, selector) {
  return page.evaluate(
    ({ bannerSel, innerSel }) => {
      const host = document.querySelector(bannerSel);
      if (!host || !host.shadowRoot) return null;
      const el = host.shadowRoot.querySelector(innerSel);
      if (!el) return null;
      return { tag: el.tagName, text: el.textContent, href: el.href || null };
    },
    { bannerSel: BANNER_SELECTOR, innerSel: selector },
  );
}

/** Read computed paddingTop of <html> element. */
async function getPaddingTop(page) {
  return page.evaluate(
    () => parseInt(getComputedStyle(document.documentElement).paddingTop, 10) || 0,
  );
}

test('1: banner renders inside Shadow DOM with data-testid', async ({ page }) => {
  await goAndWaitForBanner(page, baseUrl);

  const hasShadow = await page.locator(BANNER_SELECTOR).evaluate((el) => !!el.shadowRoot);
  expect(hasShadow).toBe(true);
});

test('2: JSON response includes _buildbanner.version, sha, sha_full, server_started', async ({ page }) => {
  const res = await page.request.get(`${baseUrl}/buildbanner.json`);
  expect(res.status()).toBe(200);
  const json = await res.json();

  expect(json._buildbanner).toEqual({ version: 1 });
  expect(json.sha).toBe(FIXTURE.sha);
  expect(json.sha_full).toBe(FIXTURE.sha_full);
  expect(typeof json.server_started).toBe('string');
  expect(json.server_started.length).toBeGreaterThan(0);
});

test('3: segments have correct data-segment attributes in canonical order', async ({ page }) => {
  await goAndWaitForBanner(page, baseUrl);

  const segments = await page.evaluate((sel) => {
    const host = document.querySelector(sel);
    const els = host.shadowRoot.querySelectorAll('[data-segment]');
    return Array.from(els).map((el) => el.getAttribute('data-segment'));
  }, BANNER_SELECTOR);

  const expectedOrder = [
    'environment', 'branch', 'sha', 'commit-date', 'uptime',
    'custom-model', 'custom-region',
  ];

  const filtered = segments.filter((s) => expectedOrder.includes(s));
  expect(filtered).toEqual(expectedOrder);
});

test('4: SHA links to correct GitHub commit URL', async ({ page }) => {
  await goAndWaitForBanner(page, baseUrl);

  const result = await shadowQuery(page, '[data-segment="sha"]');
  expect(result.tag).toBe('A');
  expect(result.href).toBe(
    `https://github.com/acme/widget/commit/${encodeURIComponent(FIXTURE.sha_full)}`,
  );
});

test('5: branch links to correct GitHub tree URL', async ({ page }) => {
  await goAndWaitForBanner(page, baseUrl);

  const result = await shadowQuery(page, '[data-segment="branch"]');
  expect(result.tag).toBe('A');
  expect(result.href).toBe('https://github.com/acme/widget/tree/main');
});

test('6: removing repo_url renders SHA and branch as plain text', async ({ page }) => {
  const { server: srv, baseUrl: url } = await createServer({
    ...FIXTURE,
    repo_url: undefined,
  });

  try {
    await goAndWaitForBanner(page, url);

    const sha = await shadowQuery(page, '[data-segment="sha"]');
    const branch = await shadowQuery(page, '[data-segment="branch"]');
    expect(sha.tag).toBe('SPAN');
    expect(branch.tag).toBe('SPAN');
  } finally {
    await closeServer(srv);
  }
});

test('7: custom fields render alphabetically with correct data-segment', async ({ page }) => {
  await goAndWaitForBanner(page, baseUrl);

  const customSegments = await page.evaluate((sel) => {
    const host = document.querySelector(sel);
    const els = host.shadowRoot.querySelectorAll('[data-segment^="custom-"]');
    return Array.from(els).map((el) => ({
      segment: el.getAttribute('data-segment'),
      text: el.textContent,
    }));
  }, BANNER_SELECTOR);

  expect(customSegments.length).toBe(2);
  expect(customSegments[0].segment).toBe('custom-model');
  expect(customSegments[0].text).toBe('test');
  expect(customSegments[1].segment).toBe('custom-region');
  expect(customSegments[1].text).toBe('us-east-1');
});

test('8: dismiss button removes banner and resets paddingTop to 0', async ({ page }) => {
  await goAndWaitForBanner(page, baseUrl);

  const paddingBefore = await getPaddingTop(page);
  expect(paddingBefore).toBeGreaterThan(0);

  await page.evaluate((sel) => {
    const host = document.querySelector(sel);
    const btn = host.shadowRoot.querySelector('.bb-dismiss');
    if (!btn) throw new Error('Dismiss button (.bb-dismiss) not found in Shadow DOM');
    btn.click();
  }, BANNER_SELECTOR);

  await expect(page.locator(BANNER_SELECTOR)).not.toBeAttached({ timeout: DISMISS_TIMEOUT });
  expect(await getPaddingTop(page)).toBe(0);
});

test('9: polling updates banner in-place (no flicker)', async ({ page }) => {
  const { server: srv, baseUrl: url, setFixture } = await createServer(FIXTURE, {
    poll: 1,
  });

  try {
    await goAndWaitForBanner(page, url);

    const hostIdBefore = await page.evaluate((sel) => {
      const h = document.querySelector(sel);
      h.setAttribute('data-identity-check', 'original');
      return h.getAttribute('data-identity-check');
    }, BANNER_SELECTOR);
    expect(hostIdBefore).toBe('original');

    setFixture({ ...FIXTURE, environment: 'staging' });

    await page.waitForFunction((sel) => {
      const host = document.querySelector(sel);
      if (!host || !host.shadowRoot) return false;
      const el = host.shadowRoot.querySelector('[data-segment="environment"]');
      return el && el.textContent === 'staging';
    }, BANNER_SELECTOR, { timeout: 10000 });

    const identity = await page.evaluate((sel) => {
      const host = document.querySelector(sel);
      return {
        count: document.querySelectorAll(sel).length,
        marker: host.getAttribute('data-identity-check'),
      };
    }, BANNER_SELECTOR);
    expect(identity.count).toBe(1);
    expect(identity.marker).toBe('original');
  } finally {
    await closeServer(srv);
  }
});

test('10: BuildBanner.destroy() removes banner and restores padding', async ({ page }) => {
  await goAndWaitForBanner(page, baseUrl);

  const paddingBefore = await getPaddingTop(page);
  expect(paddingBefore).toBeGreaterThan(0);

  await page.evaluate(() => window.BuildBanner.destroy());

  await expect(page.locator(BANNER_SELECTOR)).not.toBeAttached({ timeout: DISMISS_TIMEOUT });
  expect(await getPaddingTop(page)).toBe(0);
});

test('11: 500 from endpoint shows no banner and no console error', async ({ page }) => {
  const { server: srv, baseUrl: url } = await createServer(FIXTURE, {
    forceError: true,
  });

  try {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) {
        errors.push(msg.text());
      }
    });

    await page.goto(url);
    await page.waitForResponse((res) => res.url().includes('/buildbanner.json'));
    await page.waitForLoadState('networkidle');

    const bannerExists = await page.locator(BANNER_SELECTOR).count();
    expect(bannerExists).toBe(0);
    expect(errors.length).toBe(0);
  } finally {
    await closeServer(srv);
  }
});

test('12: env-hide with matching environment shows no banner', async ({ page }) => {
  const { server: srv, baseUrl: url } = await createServer(
    { ...FIXTURE, environment: 'production' },
    { envHide: 'production' },
  );

  try {
    await page.goto(url);
    await page.waitForResponse((res) => res.url().includes('/buildbanner.json'));
    await page.waitForLoadState('networkidle');

    const bannerExists = await page.locator(BANNER_SELECTOR).count();
    expect(bannerExists).toBe(0);
  } finally {
    await closeServer(srv);
  }
});

test('13: CSS isolation — host page styles do not bleed into banner', async ({ page }) => {
  await goAndWaitForBanner(page, baseUrl);

  await page.addStyleTag({
    content: '* { font-family: "Comic Sans MS" !important; color: red !important; }',
  });

  const styles = await page.evaluate((sel) => {
    const host = document.querySelector(sel);
    const wrapper = host.shadowRoot.querySelector('.bb-wrapper');
    const computed = getComputedStyle(wrapper);
    return { fontFamily: computed.fontFamily, color: computed.color };
  }, BANNER_SELECTOR);

  expect(styles.fontFamily).toMatch(/monospace/i);
  expect(styles.color).not.toBe('rgb(255, 0, 0)');
});

test('14: push mode sets paddingTop equal to banner offsetHeight', async ({ page }) => {
  await goAndWaitForBanner(page, baseUrl);

  const { paddingTop, offsetHeight } = await page.evaluate((sel) => {
    const pt = parseInt(getComputedStyle(document.documentElement).paddingTop, 10) || 0;
    const host = document.querySelector(sel);
    return { paddingTop: pt, offsetHeight: host.offsetHeight };
  }, BANNER_SELECTOR);

  expect(paddingTop).toBe(offsetHeight);
});

test('15: tests.url present renders status segment as clickable <a>', async ({ page }) => {
  const fixtureWithTests = {
    ...FIXTURE,
    tests: { status: 'pass', summary: '42 passed', url: '/test-results' },
  };
  const { server: srv, baseUrl: url } = await createServer(fixtureWithTests);

  try {
    await goAndWaitForBanner(page, url);

    const result = await shadowQuery(page, '[data-segment="tests"]');
    expect(result.tag).toBe('A');
    expect(result.href).toContain('/test-results');
  } finally {
    await closeServer(srv);
  }
});

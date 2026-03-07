/** E2E smoke tests — wires built client + Express middleware in a real browser. */
const { test, expect } = require('@playwright/test');
const { createServer } = require('./test-server');

const FIXTURE = {
  sha: 'a1b2c3d',
  sha_full: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
  branch: 'main',
  repo_url: 'https://github.com/acme/widget',
  commit_date: '2026-01-15T10:30:00Z',
  server_started: new Date().toISOString(),
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
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('1: banner renders inside Shadow DOM with data-testid', async ({ page }) => {
  await page.goto(baseUrl);
  const host = page.locator('[data-testid="buildbanner"]');
  await expect(host).toBeAttached({ timeout: 5000 });

  const hasShadow = await host.evaluate((el) => !!el.shadowRoot);
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
  await page.goto(baseUrl);
  await page.locator('[data-testid="buildbanner"]').waitFor({ timeout: 5000 });

  const segments = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="buildbanner"]');
    const shadow = host.shadowRoot;
    const els = shadow.querySelectorAll('[data-segment]');
    return Array.from(els).map((el) => el.getAttribute('data-segment'));
  });

  const expectedOrder = [
    'environment', 'branch', 'sha', 'commit-date', 'uptime',
    'custom-model', 'custom-region',
  ];

  const filtered = segments.filter((s) => expectedOrder.includes(s));
  expect(filtered).toEqual(expectedOrder);
});

test('4: SHA links to correct GitHub commit URL', async ({ page }) => {
  await page.goto(baseUrl);
  await page.locator('[data-testid="buildbanner"]').waitFor({ timeout: 5000 });

  const href = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="buildbanner"]');
    const el = host.shadowRoot.querySelector('[data-segment="sha"]');
    return el.tagName === 'A' ? el.href : null;
  });

  expect(href).toBe(
    `https://github.com/acme/widget/commit/${encodeURIComponent(FIXTURE.sha_full)}`
  );
});

test('5: branch links to correct GitHub tree URL', async ({ page }) => {
  await page.goto(baseUrl);
  await page.locator('[data-testid="buildbanner"]').waitFor({ timeout: 5000 });

  const href = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="buildbanner"]');
    const el = host.shadowRoot.querySelector('[data-segment="branch"]');
    return el.tagName === 'A' ? el.href : null;
  });

  expect(href).toBe('https://github.com/acme/widget/tree/main');
});

test('6: removing repo_url renders SHA and branch as plain text', async ({ page }) => {
  const { server: srv2, baseUrl: url2 } = await createServer({
    ...FIXTURE,
    repo_url: undefined,
  });

  try {
    await page.goto(url2);
    await page.locator('[data-testid="buildbanner"]').waitFor({ timeout: 5000 });

    const tags = await page.evaluate(() => {
      const host = document.querySelector('[data-testid="buildbanner"]');
      const shadow = host.shadowRoot;
      const shaTag = shadow.querySelector('[data-segment="sha"]')?.tagName;
      const branchTag = shadow.querySelector('[data-segment="branch"]')?.tagName;
      return { shaTag, branchTag };
    });

    expect(tags.shaTag).toBe('SPAN');
    expect(tags.branchTag).toBe('SPAN');
  } finally {
    await new Promise((resolve) => srv2.close(resolve));
  }
});

test('7: custom fields render alphabetically with correct data-segment', async ({ page }) => {
  await page.goto(baseUrl);
  await page.locator('[data-testid="buildbanner"]').waitFor({ timeout: 5000 });

  const customSegments = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="buildbanner"]');
    const shadow = host.shadowRoot;
    const els = shadow.querySelectorAll('[data-segment^="custom-"]');
    return Array.from(els).map((el) => ({
      segment: el.getAttribute('data-segment'),
      text: el.textContent,
    }));
  });

  expect(customSegments.length).toBe(2);
  expect(customSegments[0].segment).toBe('custom-model');
  expect(customSegments[0].text).toBe('test');
  expect(customSegments[1].segment).toBe('custom-region');
  expect(customSegments[1].text).toBe('us-east-1');
});

test('8: dismiss button removes banner and resets paddingTop to 0', async ({ page }) => {
  await page.goto(baseUrl);
  await page.locator('[data-testid="buildbanner"]').waitFor({ timeout: 5000 });

  const paddingBefore = await page.evaluate(
    () => parseInt(getComputedStyle(document.documentElement).paddingTop, 10) || 0
  );
  expect(paddingBefore).toBeGreaterThan(0);

  await page.evaluate(() => {
    const host = document.querySelector('[data-testid="buildbanner"]');
    const btn = host.shadowRoot.querySelector('.bb-dismiss');
    btn.click();
  });

  await expect(page.locator('[data-testid="buildbanner"]')).not.toBeAttached({ timeout: 3000 });

  const paddingAfter = await page.evaluate(
    () => parseInt(getComputedStyle(document.documentElement).paddingTop, 10) || 0
  );
  expect(paddingAfter).toBe(0);
});

test('9: polling updates banner in-place (no flicker)', async ({ page }) => {
  const { server: srv3, baseUrl: url3, setFixture } = await createServer(FIXTURE, {
    poll: 1,
  });

  try {
    await page.goto(url3);
    await page.locator('[data-testid="buildbanner"]').waitFor({ timeout: 5000 });

    const hostBefore = await page.evaluate(() => {
      const h = document.querySelector('[data-testid="buildbanner"]');
      return h ? h.outerHTML.slice(0, 30) : null;
    });
    expect(hostBefore).not.toBeNull();

    setFixture({ ...FIXTURE, environment: 'staging' });

    await page.waitForFunction(() => {
      const host = document.querySelector('[data-testid="buildbanner"]');
      if (!host || !host.shadowRoot) return false;
      const el = host.shadowRoot.querySelector('[data-segment="environment"]');
      return el && el.textContent === 'staging';
    }, { timeout: 10000 });

    const hostCount = await page.evaluate(
      () => document.querySelectorAll('[data-testid="buildbanner"]').length
    );
    expect(hostCount).toBe(1);
  } finally {
    await new Promise((resolve) => srv3.close(resolve));
  }
});

test('10: BuildBanner.destroy() removes banner and restores padding', async ({ page }) => {
  await page.goto(baseUrl);
  await page.locator('[data-testid="buildbanner"]').waitFor({ timeout: 5000 });

  const paddingBefore = await page.evaluate(
    () => parseInt(getComputedStyle(document.documentElement).paddingTop, 10) || 0
  );
  expect(paddingBefore).toBeGreaterThan(0);

  await page.evaluate(() => window.BuildBanner.destroy());

  await expect(page.locator('[data-testid="buildbanner"]')).not.toBeAttached({ timeout: 3000 });

  const paddingAfter = await page.evaluate(
    () => parseInt(getComputedStyle(document.documentElement).paddingTop, 10) || 0
  );
  expect(paddingAfter).toBe(0);
});

test('11: 500 from endpoint shows no banner and no console error', async ({ page }) => {
  const { server: srv4, baseUrl: url4 } = await createServer(FIXTURE, {
    forceError: true,
  });

  try {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(url4);
    await page.waitForTimeout(2000);

    const bannerExists = await page.locator('[data-testid="buildbanner"]').count();
    expect(bannerExists).toBe(0);
    expect(errors.length).toBe(0);
  } finally {
    await new Promise((resolve) => srv4.close(resolve));
  }
});

test('12: env-hide with matching environment shows no banner', async ({ page }) => {
  const { server: srv5, baseUrl: url5 } = await createServer(
    { ...FIXTURE, environment: 'production' },
    { envHide: 'production' },
  );

  try {
    await page.goto(url5);
    await page.waitForTimeout(2000);

    const bannerExists = await page.locator('[data-testid="buildbanner"]').count();
    expect(bannerExists).toBe(0);
  } finally {
    await new Promise((resolve) => srv5.close(resolve));
  }
});

test('13: CSS isolation — host page styles do not bleed into banner', async ({ page }) => {
  await page.goto(baseUrl);
  await page.locator('[data-testid="buildbanner"]').waitFor({ timeout: 5000 });

  await page.addStyleTag({
    content: '* { font-family: "Comic Sans MS" !important; color: red !important; }',
  });

  const styles = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="buildbanner"]');
    const wrapper = host.shadowRoot.querySelector('.bb-wrapper');
    const computed = getComputedStyle(wrapper);
    return {
      fontFamily: computed.fontFamily,
      color: computed.color,
    };
  });

  expect(styles.fontFamily).toMatch(/monospace/i);
  expect(styles.color).not.toBe('rgb(255, 0, 0)');
});

test('14: push mode sets paddingTop equal to banner offsetHeight', async ({ page }) => {
  await page.goto(baseUrl);
  await page.locator('[data-testid="buildbanner"]').waitFor({ timeout: 5000 });

  const { paddingTop, offsetHeight } = await page.evaluate(() => {
    const pt = parseInt(getComputedStyle(document.documentElement).paddingTop, 10) || 0;
    const host = document.querySelector('[data-testid="buildbanner"]');
    return { paddingTop: pt, offsetHeight: host.offsetHeight };
  });

  expect(paddingTop).toBe(offsetHeight);
});

test('15: tests.url present renders status segment as clickable <a>', async ({ page }) => {
  const fixtureWithTests = {
    ...FIXTURE,
    tests: { status: 'pass', summary: '42 passed', url: '/test-results' },
  };
  const { server: srv6, baseUrl: url6 } = await createServer(fixtureWithTests);

  try {
    await page.goto(url6);
    await page.locator('[data-testid="buildbanner"]').waitFor({ timeout: 5000 });

    const result = await page.evaluate(() => {
      const host = document.querySelector('[data-testid="buildbanner"]');
      const el = host.shadowRoot.querySelector('[data-segment="tests"]');
      return { tag: el?.tagName, href: el?.href || null };
    });

    expect(result.tag).toBe('A');
    expect(result.href).toContain('/test-results');
  } finally {
    await new Promise((resolve) => srv6.close(resolve));
  }
});

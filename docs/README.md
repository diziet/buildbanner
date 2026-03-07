# BuildBanner

A crash-proof, language-agnostic developer info banner for web apps. Drop a `<script>` tag into any app, point it at a JSON endpoint, get a GitHub-linked admin strip showing git SHA, branch, uptime, build status, and custom fields.

```
+-----------------------------------------------------------------------+
| main . a1b2c3d . Feb 13 14:30 . up 2h . pass 1.1M passed . port 8001  x |
+-----------------------------------------------------------------------+
|                                                                       |
|                         Your actual app                               |
|                                                                       |
+-----------------------------------------------------------------------+
```

<!-- TODO: Replace with actual banner screenshot -->

## Quick Start

Zero configuration if your server exposes `/buildbanner.json`:

```html
<script src="https://unpkg.com/buildbanner@latest/buildbanner.min.js"></script>
<!-- That's it. Banner appears if endpoint responds. -->
```

Or self-host the script:

```html
<script src="/static/buildbanner.min.js"></script>
```

Or install via npm:

```bash
npm install buildbanner
```

```js
import 'buildbanner';
```

## Configuration

All configuration is done via `data-*` attributes on the script tag. For example:

```html
<script
  src="buildbanner.min.js"
  data-endpoint="/api/version"
  data-position="top"
  data-theme="dark"
  data-dismiss="session"
  data-poll="30"
></script>
```

For the full list of attributes and their defaults, see [docs/configuration.md](configuration.md).

## Programmatic API

When using `data-manual` or importing as an ES module:

```js
// Initialize with options (hostPatterns for self-hosted git)
BuildBanner.init({
  endpoint: '/api/version',
  theme: 'dark',
  poll: 30,
  push: true,
  token: 'my-secret',
  hostPatterns: [
    { host: 'git.mycompany.com', kind: 'gitlab' }
  ]
});

// Destroy — removes DOM, restores padding, stops polling
BuildBanner.destroy();

// Force re-fetch from endpoint
BuildBanner.refresh();

// Push partial data update without re-fetching (for SPA frameworks)
BuildBanner.update({ custom: { model: 'new-model-v2' } });

// Check if the banner is currently visible
BuildBanner.isVisible(); // boolean
```

### `hostPatterns` Option

For self-hosted Git instances (GitLab, Gitea, etc.), pass `hostPatterns` to `init()` to enable commit/branch link generation:

```js
BuildBanner.init({
  hostPatterns: [
    { host: 'git.mycompany.com', kind: 'gitlab' },
    { host: 'code.internal', kind: 'github' }
  ]
});
```

Without this, SHA and branch are rendered as plain text for unrecognized hosts.

## Environment Variables

Server helpers read `BUILDBANNER_*` environment variables at startup, checked before git fallback. Any `BUILDBANNER_CUSTOM_*` variable becomes a `custom` field (suffix lowercased to form the key, e.g. `BUILDBANNER_CUSTOM_REGION=us-east-1` becomes `custom.region`).

For the full environment variable reference, see [docs/configuration.md](configuration.md#server-side-environment-variables).

## Server Helpers

BuildBanner provides one-liner middleware for popular frameworks. Each helper reads git info once at startup and caches it in memory.

### Flask

```python
from buildbanner import buildbanner_blueprint
app.register_blueprint(buildbanner_blueprint())

# With dynamic extras
buildbanner_blueprint(extras=lambda: {
    "tests": {"status": "pass", "summary": "1.1M passed"},
    "custom": {"model": get_active_model()}
})
```

Package: `pip install buildbanner`

### FastAPI

```python
from buildbanner import BuildBannerMiddleware
app.add_middleware(BuildBannerMiddleware)
```

Package: `pip install buildbanner`

### Django

```python
# settings.py
MIDDLEWARE = ['buildbanner.django.BuildBannerMiddleware']
```

Package: `pip install buildbanner`

### WSGI (generic)

```python
from buildbanner import buildbanner_wsgi
app = buildbanner_wsgi(app)
```

Package: `pip install buildbanner`

### Express

```js
const { buildBannerMiddleware } = require('buildbanner');
app.use(buildBannerMiddleware());

// With extras
app.use(buildBannerMiddleware({
  path: '/buildbanner.json',
  extras: () => ({
    tests: { status: 'pass', summary: '342 passed' },
    custom: { upstreams: '3 healthy' }
  })
}));
```

Package: `npm install buildbanner`

### Koa

```js
const { buildBannerKoa } = require('buildbanner');
app.use(buildBannerKoa());
```

Package: `npm install buildbanner`

### Hono

```js
const { buildBannerHono } = require('buildbanner');
app.use(buildBannerHono());
```

Package: `npm install buildbanner`

### Rack / Rails

```ruby
# Gemfile
gem 'buildbanner'

# Rails — config/application.rb
config.middleware.use BuildBanner::Middleware

# With extras
config.middleware.use BuildBanner::Middleware,
  path: '/buildbanner.json',
  extras: -> {
    { tests: { status: 'pass', summary: '342 passed' },
      custom: { workers: Sidekiq::Stats.new.workers_size.to_s } }
  }
```

Package: `gem install buildbanner`

### Static / nginx

For static sites, serve a hand-crafted `buildbanner.json` file and include the client script. See the [static/nginx example](../examples/static-html/) for a complete Dockerfile and nginx configuration.

## JSON Contract

The server endpoint (`GET /buildbanner.json`) returns a JSON object. Server helpers include `_buildbanner`, `sha`, `sha_full`, `branch`, and `server_started` in every response. The client requires only `sha` and `branch`; all other fields are optional and the client renders whatever is present.

```json
{
  "_buildbanner": { "version": 1 },
  "sha": "a1b2c3d",
  "sha_full": "a1b2c3d4e5f67890abcdef1234567890abcdef12",
  "branch": "main",
  "server_started": "2026-02-13T14:30:00Z",
  "commit_date": "2026-02-13T14:25:00Z",
  "repo_url": "https://github.com/user/repo",
  "deployed_at": "2026-02-13T12:00:00Z",
  "environment": "development",
  "app_name": "my-app",
  "tests": { "status": "pass", "summary": "1.1M passed", "url": "/api/tests" },
  "build": { "status": "fresh", "summary": "built 2m ago" },
  "custom": { "region": "us-east-1", "workers": "4 active" }
}
```

Full schema: [`shared/schema.json`](../shared/schema.json)

### Custom Fields

The `custom` object is a flat string-to-string map. Each key-value pair renders as a labeled segment in the banner, sorted alphabetically by key. Server helpers automatically stringify non-string values. Use `BUILDBANNER_CUSTOM_*` env vars or the `extras` callback to populate custom fields.

## Status Indicators

The `tests` and `build` fields drive colored status dots in the banner:

| Status | Indicator |
|--------|-----------|
| `pass` / `fresh` | Green |
| `fail` / `stale` | Red |
| `running` / `building` | Yellow |
| `idle` / unknown | Gray |

If `tests.url` or `build.url` is provided, the status segment becomes a clickable link.

## Theming

Three themes are available via `data-theme`:

- **`dark`** (default) — dark background, light text
- **`light`** — light background, dark text
- **`auto`** — follows the user's `prefers-color-scheme` setting

All styling is class-based CSS inside Shadow DOM. No inline styles are used.

## Dismiss Behavior

The dismiss button (x) behavior is controlled by `data-dismiss`:

- **`session`** (default) — dismissal persists for the browser session (sessionStorage)
- **`permanent`** — dismissal persists across sessions (localStorage)
- **`none`** — no dismiss button is shown

After `BuildBanner.destroy()`, dismiss state is reset.

## Push Mode

By default (`data-push="true"`), the banner adds `padding-top` to `<html>` to push app content down, preventing the banner from overlaying content.

If `<html>` already has non-zero padding (set by a CSS framework or another tool), push mode automatically falls back to overlay mode to avoid layout conflicts.

On destroy, padding is restored using a subtract-not-overwrite strategy that preserves padding added by other tools (cookie banners, etc.) after BuildBanner initialized.

## Polling

Set `data-poll="30"` to re-fetch the endpoint every 30 seconds. Polling is visibility-aware — it pauses when the tab is backgrounded and resumes with an immediate fetch when the tab regains focus.

On consecutive fetch failures, the interval backs off exponentially (doubles each failure, caps at 5 minutes) and resets on the next success.

## Size Budget

The client library targets **<3KB gzipped**. Zero dependencies, browser APIs only.

## CSP Compatibility

BuildBanner works under strict Content Security Policies:

- No `eval()`, no `innerHTML`, no inline styles, no inline scripts
- Shadow DOM styles require no additional CSP directives
- Non-Shadow-DOM fallback injects a `<style>` tag (may require `style-src 'self'`)

For detailed CSP header examples, see [docs/csp.md](csp.md).

## Security

The `/buildbanner.json` endpoint exposes git metadata that may be sensitive. Defense layers include:

- `data-env-hide` to suppress rendering in specific environments
- `data-token` for lightweight access control (not a security boundary)
- Same-origin fetch by default
- Endpoint renaming for reduced discoverability
- Network-level controls (recommended primary defense)

For the full security posture, see [docs/security.md](security.md).

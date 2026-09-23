# BuildBanner

BuildBanner is a developer info banner for web apps. Add a `<script>` tag to any app and point it at a JSON endpoint. The banner is a thin strip that shows the git SHA, branch, uptime, build status and custom fields, with links to GitHub. The server can be written in any language, and the client never throws an error into the host app.

```
+-------------------------------------------------------------------------+
| main . a1b2c3d . Feb 13 14:30 . up 2h . pass 1.1M passed . port 8001  x |
+-------------------------------------------------------------------------+
|                                                                         |
|                          Your actual app                                |
|                                                                         |
+-------------------------------------------------------------------------+
```

<!-- TODO: Replace with actual banner screenshot -->

## Quick Start

If your server serves `/buildbanner.json`, no configuration is needed. Copy `buildbanner.min.js` to your static assets directory and add the script tag:

```html
<script src="/static/buildbanner.min.js"></script>
<!-- That's it. Banner appears if endpoint responds. -->
```

See [docs/self-hosting.md](self-hosting.md) for the setup steps.

Or install it with npm from GitHub:

```bash
npm install github:diziet/buildbanner
```

```js
import 'buildbanner';
```

## Configuration

All configuration is set with `data-*` attributes on the script tag. For example:

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

With `data-manual`, or when you import the client as an ES module:

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

For a self-hosted Git server, such as GitLab or Gitea, pass `hostPatterns` to `init()` so that the banner links the commit and the branch:

```js
BuildBanner.init({
  hostPatterns: [
    { host: 'git.mycompany.com', kind: 'gitlab' },
    { host: 'code.internal', kind: 'github' }
  ]
});
```

Without `hostPatterns`, the SHA and branch of an unrecognized host render as plain text.

## Environment Variables

Server helpers read the `BUILDBANNER_*` environment variables at startup. A variable that is set wins over the value from git. Each `BUILDBANNER_CUSTOM_*` variable becomes a `custom` field whose key is the lowercased suffix: `BUILDBANNER_CUSTOM_REGION=us-east-1` becomes `custom.region`.

For the full environment variable reference, see [docs/configuration.md](configuration.md#server-side-environment-variables).

## Server Helper Installation

Install the server helper for your language:

| Language | Install command |
|----------|----------------|
| **Python** (Flask, FastAPI, Django, WSGI) | `pip install git+https://github.com/diziet/buildbanner.git#subdirectory=python` |
| **Node** (Express, Koa, Hono) | `npm install github:diziet/buildbanner` |
| **Ruby** (Rack, Rails) | Add `gem "buildbanner", github: "diziet/buildbanner", glob: "ruby/*.gemspec"` to your Gemfile |

## Server Helpers

BuildBanner has one-line middleware for the frameworks below. Each helper reads the git information once at startup and caches it in memory. See [installation](#server-helper-installation) for setup.

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

### FastAPI

```python
from buildbanner import BuildBannerMiddleware
app.add_middleware(BuildBannerMiddleware)
```

### Django

```python
# settings.py
MIDDLEWARE = ['buildbanner.django.BuildBannerMiddleware']
```

### WSGI (generic)

```python
from buildbanner import buildbanner_wsgi
app = buildbanner_wsgi(app)
```

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

### Koa

```js
const { buildBannerKoa } = require('buildbanner');
app.use(buildBannerKoa());
```

### Hono

```js
const { buildBannerHono } = require('buildbanner');
app.use(buildBannerHono());
```

### Rack / Rails

```ruby
# Gemfile
gem 'buildbanner', github: 'diziet/buildbanner', glob: 'ruby/*.gemspec'

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

### Static / nginx

For a static site, serve a `buildbanner.json` file that you write, and include the client script. The [static/nginx example](../examples/static-html/) has a complete Dockerfile and nginx configuration.

## JSON Contract

The server endpoint (`GET /buildbanner.json`) returns a JSON object. Server helpers include `_buildbanner`, `sha`, `sha_full`, `branch`, and `server_started` in every response. The client requires only `sha` and `branch`. Every other field is optional, and the client renders the fields that are present.

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

The `custom` object is a flat map from string to string. Each key-value pair renders as a labeled segment in the banner, in alphabetical order of key. Server helpers convert non-string values to strings. Set custom fields with `BUILDBANNER_CUSTOM_*` environment variables or the `extras` callback.

## Status Indicators

The `tests` and `build` fields set the color of a status dot in the banner:

| Status | Indicator |
|--------|-----------|
| `pass` / `fresh` | Green |
| `fail` / `stale` | Red |
| `running` / `building` | Yellow |
| `idle` / unknown | Gray |

When `tests.url` or `build.url` is set, the status segment is a link.

## Theming

`data-theme` selects one of three themes:

- **`dark`** (default) — dark background, light text
- **`light`** — light background, dark text
- **`auto`** — follows the user's `prefers-color-scheme` setting

All styles are class-based CSS inside the Shadow DOM. The client sets no inline styles.

## Dismiss Behavior

`data-dismiss` sets what the dismiss button (x) does:

- **`session`** (default) — dismissal persists for the browser session (sessionStorage)
- **`permanent`** — dismissal persists across sessions (localStorage)
- **`none`** — no dismiss button is shown

`BuildBanner.destroy()` resets the dismiss state.

## Push Mode

By default (`data-push="true"`), the banner adds `padding-top` to `<html>`. That moves the app content down, so the banner does not cover it.

If `<html>` already has a non-zero padding, set by a CSS framework or another tool, push mode falls back to overlay mode to avoid a layout conflict.

On destroy, the client subtracts its own padding instead of writing back the old value. Padding that another tool, such as a cookie banner, added after BuildBanner initialized stays in place.

## Polling

Set `data-poll="30"` to fetch the endpoint again every 30 seconds. Polling pauses while the tab is in the background. When the tab regains focus, the client fetches at once and polling resumes.

After consecutive fetch failures, the interval doubles with each failure, up to 5 minutes. The next success resets it.

## Size Budget

The client library's target size is **<3KB gzipped**. It has no dependencies and uses only browser APIs.

## CSP Compatibility

BuildBanner works under strict Content Security Policies:

- No `eval()`, no `innerHTML`, no inline styles, no inline scripts
- Shadow DOM styles need no extra CSP directive
- Without Shadow DOM, the fallback adds a `<style>` tag, which may require `style-src 'self'`

For CSP header examples, see [docs/csp.md](csp.md).

## Security

The `/buildbanner.json` endpoint exposes git metadata, which may be sensitive. The layers of defense include:

- `data-env-hide`, which stops rendering in the environments it lists
- `data-token`, a simple access control that is not a security boundary
- A same-origin fetch by default
- A renamed endpoint, which is harder to find
- Network-level controls, the recommended primary defense

For the full security posture, see [docs/security.md](security.md).

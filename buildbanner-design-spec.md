# BuildBanner — Design Spec

> A crash-proof, language-agnostic developer info banner for web apps.
> Drop a `<script>` tag into any app, point it at a JSON endpoint, get a GitHub-linked admin strip.

---

## Problem

Every web project eventually grows a "what's deployed?" bar — showing the git SHA, branch, uptime, environment. Developers copy-paste this across projects, each time reimplementing:

- Git info extraction (branch, SHA, date, remote URL)
- GitHub link generation (commit, branch, PR)
- Safe HTML injection that never breaks the host app
- Token/secret stripping from remote URLs
- Graceful degradation when the endpoint is down

This should be a 5-minute drop-in, not a weekend project.

---

## Core Concept

**Two pieces, loosely coupled:**

1. **Client** — A single `<script>` tag. Zero dependencies. Fetches a JSON endpoint, renders a thin banner. If anything fails, it silently does nothing.

2. **Server contract** — A JSON schema for a `GET /buildbanner.json` endpoint. Any backend can implement it. Optional helper libraries make it one-liner middleware for Python, Rails, and Node.

```
┌─────────────────────────────────────────────────────────────────────┐
│ main · a1b2c3d · Feb 13 14:30 · up 2h · 🟢 1.1M passed · port 8001  ✕ │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│                         Your actual app                             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Architecture

```
Browser                          Server (any language)
┌──────────────┐    GET /buildbanner.json    ┌──────────────────┐
│  buildbanner.js   │ ──────────────────────→│  Middleware or    │
│  (client)    │ ←──────────────────────│  manual endpoint  │
│              │    { JSON response }    │  (git info,       │
│  Renders     │                        │   uptime, status) │
│  banner DOM  │                        └──────────────────┘
└──────────────┘
     │
     └─→ Links to GitHub (commits, branches, PRs)
```

### Why client-side rendering?

- **Language agnostic** — server just returns JSON, no HTML templating needed
- **Cacheable** — CDN-friendly static JS, only the JSON varies
- **Safe** — banner lives in its own DOM scope, never touches app styles
- **Optional** — remove the `<script>` tag in production, zero trace

---

## JSON Contract (Server → Client)

### Endpoint: `GET /buildbanner.json`

Path is configurable on both client and server. Response:

```jsonc
{
  // Protocol version (recommended)
  "_buildbanner": { "version": 1 },       // enables future contract changes

  // Required (core git info)
  "sha": "a1b2c3d",              // short or full SHA
  "branch": "main",              // current branch name

  // Optional — enhances the banner but never required
  "server_started": "2026-02-13T14:30:00Z",  // ISO 8601 UTC — process start time
  "deployed_at": "2026-02-13T12:00:00Z",     // ISO 8601 UTC — when this version was deployed
  "sha_full": "a1b2c3d4e5f6...", // full 40-char SHA (for GitHub links)
  "commit_date": "2026-02-13T14:25:00Z",     // ISO 8601
  "repo_url": "https://github.com/user/repo", // MUST be sanitized (no tokens)
  "environment": "development",   // free-form: dev, staging, production
  "port": 8001,                   // server port
  "app_name": "my-app",          // project name

  // Status indicators (all optional, support polling)
  "tests": {
    "status": "pass",             // "pass" | "fail" | "running" | "idle"
    "summary": "1.1M passed",    // free-form human-readable
    "url": "/api/tests"          // clickable link for details
  },
  "build": {
    "status": "fresh",            // "fresh" | "stale" | "building"
    "summary": "built 2m ago"
  },

  // Extensible — client renders ALL key-value pairs here as banner segments
  // v1: flat string→string map. Server helpers stringify non-string values automatically.
  // Nested/typed values planned for v2.
  "custom": {
    "model": "low_value_weight",  // arbitrary data from your app
    "maps": "21,508 loaded",
    "workers": "4 active",
    "cache": "92% hit rate",
    "region": "us-east-1"
  }
}
```

### Schema Rules

1. **Only `sha` and `branch` are required.** All other fields including `server_started` are optional. Client renders what's present, ignores what's missing.
2. **`_buildbanner.version`** is recommended. Client uses it to adapt to future contract changes. If absent, client assumes version 1.
3. **`repo_url` MUST NOT contain tokens, passwords, or credentials.** Server helpers strip these automatically.
4. **All timestamps are ISO 8601 UTC.** Client converts to local time for display.
5. **`tests.status` and `build.status` drive indicator dots** — green/red/yellow/gray.
6. **`custom` is a flat string→string map** in v1. Supports any number of key-value pairs; each renders as a `key: value` segment in alphabetical key order. Apps use this for domain-specific info (active ML model, worker count, cache stats, region, etc.). Server helpers automatically stringify non-string values. Client ignores any value that is not a string. Nested/typed values are planned for v2.
7. **`tests.url` and `build.url` are clickable** — open a details page in new tab.
8. **`server_started` vs `deployed_at`** — These track different things. `server_started` = when the process booted (drives the "uptime" counter). `deployed_at` = when this code version was deployed (shows "deployed 3h ago"). In serverless/FaaS where process uptime is meaningless, omit `server_started` and use `deployed_at` instead. In long-running servers, use both. Client renders whichever is present: uptime from `server_started`, deploy age from `deployed_at`.

### Conceptual Field Groups

The JSON is flat, but fields fall into logical groups. This aids documentation and future refactoring:

- **Identity**: `sha`, `sha_full`, `branch`, `commit_date`, `repo_url` — what code is running
- **Runtime**: `server_started`, `deployed_at`, `port`, `environment`, `app_name` — where/how it's running
- **Status**: `tests`, `build` — live health indicators
- **Custom**: `custom` — app-specific data
- **Meta**: `_buildbanner` — protocol versioning

### Error Responses

Any non-200 or malformed JSON → client silently hides the banner. No retries on initial load. Diagnostic details are always available via `console.debug` (visible only when DevTools is open with verbose logging), and promoted to `console.warn` when `data-debug="true"`. See **Diagnostic Logging** below.

---

## Client Library

### Installation

```html
<!-- Option A: Self-hosted (copy dist/buildbanner.min.js into your static assets) -->
<script src="/static/buildbanner.min.js"></script>

<!-- Option B: npm -->
<!-- npm install buildbanner -->
<!-- import 'buildbanner'; -->
```

### Auto-initialization

Zero config if endpoint is at `/buildbanner.json`:

```html
<script src="/static/buildbanner.min.js"></script>
<!-- That's it. Banner appears if endpoint responds. -->
```

### Configuration via data attributes

```html
<script
  src="buildbanner.min.js"
  data-endpoint="/api/version"
  data-position="top"
  data-theme="dark"
  data-dismiss="session"
  data-poll="30"
  data-height="28"
  data-push="true"
  data-token="my-shared-secret"
></script>
```

| Attribute | Default | Values |
|-----------|---------|--------|
| `data-endpoint` | `/buildbanner.json` | Any URL path |
| `data-position` | `top` | `top`, `bottom` |
| `data-theme` | `dark` | `dark`, `light`, `auto` (follows prefers-color-scheme) |
| `data-dismiss` | `session` | `session` (sessionStorage), `permanent` (localStorage), `none` (no ✕) |
| `data-env-hide` | (none) | Comma-separated envs to auto-hide: `"production,staging"` |
| `data-height` | `28` | Banner height in px. Minimum 24, maximum 48. |
| `data-debug` | `false` | `true` promotes diagnostic logs to `console.warn`. Logs are always available at `console.debug` level regardless of this setting. |
| `data-poll` | `0` | Seconds between re-fetches (0 = fetch once). Enables live test status, build status, uptime. |
| `data-push` | `true` | `true` adds `padding-top` to `<html>` equal to banner height, pushing the app down. `false` floats over content (sticky). **If `<html>` already has non-zero padding, push mode automatically falls back to overlay to avoid layout conflicts.** See **Push Mode Safety** below. |
| `data-token` | (none) | Shared token sent as `Authorization: Bearer <token>` header on fetch. **Not a security boundary — intended for staging/internal use only.** See **Token Auth** below. |

### Programmatic API

```js
// Manual init (if auto-init disabled via data-manual)
BuildBanner.init({ endpoint: '/api/version', theme: 'dark', poll: 30, zIndex: 999999, push: true, token: 'my-secret' });

// Destroy — full cleanup: removes DOM, restores padding, stops polling, removes event listeners
BuildBanner.destroy();

// Push update without re-fetching (for SPA frameworks)
BuildBanner.update({ custom: { model: 'new-model-v2' } });

// Force re-fetch
BuildBanner.refresh();

// Check if visible
BuildBanner.isVisible(); // boolean
```

### Singleton & Multi-Instance Guard

Only one BuildBanner instance may exist per page. If the script is included multiple times (common in micro-frontend setups or template includes), the second initialization is a no-op and logs a `console.debug` message: `"[BuildBanner] Already initialized — skipping duplicate script."` The active instance is tracked via `window[Symbol.for("buildbanner")]` (with `window.__buildBannerInstance` as a fallback for environments without Symbol support).

After `BuildBanner.destroy()`, `window.BuildBanner` is **not deleted** — its methods become no-ops that return silently. This avoids surprising code that holds a reference to the object (common in bundler setups or framework integration). A new active instance can be created by calling `BuildBanner.init()`.

### Rendering Rules

1. **Prepended to `<body>`** as first child (or appended if `position=bottom`). When `data-push="true"` (default), injects `padding-top` on `<html>` equal to banner height so the app is pushed down rather than obscured. Removes the padding on destroy. See **Push Mode Safety** for edge cases.
2. **Default height: 28px** (configurable via `data-height`, min 24, max 48). Never wraps, never expands. Overflow: hidden + ellipsis.
3. **Shadow DOM** to isolate styles. The shadow root's top-level wrapper uses `all: initial` to prevent inherited CSS properties (`font-family`, `color`, `line-height`, etc.) from bleeding in from the host app. Falls back to namespaced classes (`.__buildbanner-*`) via `attachShadow` feature detection; if `attachShadow` is unavailable, all styles use `.__buildbanner-` prefixed selectors scoped with high specificity and include explicit resets for inheritable properties.
4. **z-index: 999999** (high but not max, avoidable by host app). Position: sticky. Configurable via `BuildBanner.init({ zIndex })` for apps that need to adjust.
5. **GitHub links open in new tab** (`target="_blank" rel="noopener"`).
6. **Click-to-copy SHA** — clicking the SHA segment copies the full SHA (`sha_full` or `sha`) to the clipboard. On success, the SHA text is briefly replaced in-place with "Copied!" for 1.5 seconds, then reverts to the SHA. This avoids tooltip clipping issues caused by the banner's `overflow: hidden` and fixed height within the Shadow DOM boundary. Falls back to selecting the text if Clipboard API is unavailable.
7. **Branch hiding** — if `branch` is `"HEAD"`, empty, or null, the branch segment is hidden entirely. Silence is better than misleading data.
8. **Uptime computed client-side** from `server_started` — always live, no polling needed. Omitted if `server_started` absent. **Deploy age** computed from `deployed_at` — shows "deployed 3h ago". If both present, both are shown. If only `deployed_at` is present (serverless), uptime is omitted.
9. **Status dots**: 🟢 pass/fresh, 🔴 fail/stale, 🟡 running/building, ⚪ idle/unknown. Implemented as text emoji for v1 (portable, zero dependencies). Internal abstraction allows swapping for CSS dots in v2 without API changes.
10. **`tests.url`** makes the test segment a clickable link to the details page.
11. **Custom value enforcement** — client ignores any `custom` value that is not a string. Server helpers stringify automatically.
12. **Polling** re-fetches every N seconds, updates banner in-place. Only mutable fields change (tests, build, custom). On consecutive fetch failures, backs off exponentially (N → 2N → 4N, capped at 5 minutes). Resets to original interval on next success. **Polling is visibility-aware** — see **Visibility-Aware Polling** below.

### Push Mode Safety

The `data-push="true"` mode adds `padding-top` (or `padding-bottom`) to the `<html>` element to displace the app content.

**Guard: existing padding detection.** Before applying padding, the client checks the computed `padding-top` of `<html>`. If it is already non-zero (set by the host app, a CSS framework, or another tool), BuildBanner **does not modify it** and silently falls back to overlay mode (`position: fixed`, no push). This prevents conflicts with apps that manipulate `<html>` styles for fullscreen layouts, mobile viewport hacks, or SPA router measurements.

**On destroy**, the client uses a **subtract-not-overwrite** strategy to avoid clobbering padding added by other tools (cookie banners, notification bars, etc.) after BuildBanner initialized:

1. Read the current computed `padding-top`.
2. If it equals `originalPadding + bannerHeight` (i.e., no one else touched it), restore to `originalPadding`.
3. If it differs (another tool added or removed padding after init), subtract `bannerHeight` from the current value. This preserves the other tool's contribution.
4. Clamp to `0` — never set negative padding.

This handles the common SPA scenario where a cookie consent banner adds 40px of padding after BuildBanner is already running. A naive restore would wipe the cookie banner's layout; the subtract approach preserves it.

**Rule of thumb: if `<html>` already has padding, don't touch it.**

### Link Generation

When `repo_url` is present:

| Field | Link |
|-------|------|
| `sha` | `{repo_url}/commit/{sha_full or sha}` |
| `branch` | `{repo_url}/tree/{branch}` |

**Safe link generation.** Links are only generated when `repo_url` matches one of these **exact host patterns**:

| Host | Commit path | Tree path |
|------|-------------|-----------|
| `github.com` | `/commit/{sha}` | `/tree/{branch}` |
| `gitlab.com` | `/-/commit/{sha}` | `/-/tree/{branch}` |
| `bitbucket.org` | `/commits/{sha}` | `/src/{branch}` |

For all other hosts — including self-hosted GitLab, Gitea, Azure DevOps, and SSH-only remotes — the client renders the SHA and branch as **plain text with no links**. This avoids generating broken links that look authoritative.

Previous drafts matched `gitlab.*` as a wildcard, which would incorrectly match unrelated domains and miss self-hosted instances at `code.company.com` or `git.internal`. The exact-match approach is narrower but never wrong.

**v2: `repo_kind` field.** To support self-hosted Git instances, v2 will add an optional `repo_kind` field to the JSON contract (`"github"` | `"gitlab"` | `"bitbucket"` | `"unknown"`). Server helpers will emit this based on the remote URL, moving host detection to the server where it belongs. The client will use `repo_kind` for link generation instead of guessing from the hostname. Until then, self-hosted users can use `BuildBanner.init({ hostPatterns: [...] })` to register custom patterns via the programmatic API.

The client never attempts to "guess" URL structures beyond the paths listed above. Silence is better than wrong links.

### Banner Layout

```
[branch-link] · [sha-link 📋] · Feb 13 14:30 · up 2h 15m · 🟢 1.1M passed · port 8001  ✕
```

- Segments separated by ` · `
- Links: subtle underline on hover, same muted color as text
- SHA: click to copy full SHA to clipboard (in-place "Copied!" text swap for 1.5s)
- Dismiss ✕ on far right
- Truncates from right if window narrow
- Status dots are text emoji (no image dependencies)

### Accessibility

BuildBanner is a dev tool, but dev tools get left on in demos, staging walkthroughs, and screenshare sessions. The banner respects basic accessibility requirements:

- **`role="status"` and `aria-live="polite"`** on the status segment container (tests, build), **not** on the banner host element. This ensures screen readers announce meaningful state changes (pass→fail, fresh→stale) without being spammed by uptime ticks, deploy-age updates, or identical poll responses. The banner host itself has `role="toolbar"` for identification. On poll updates, the live region content is only updated when a `tests.status` or `build.status` value actually changes from its previous value.
- **`aria-label="Build information banner"`** on the host for identification.
- **Keyboard-navigable close button** with visible `:focus-visible` ring.
- **All interactive elements** (close button, SHA copy, links) are reachable via Tab and activatable via Enter/Space.
- **No auto-focus** — the banner never steals focus from the host app on initial render or polling updates.
- **Sufficient contrast** — default dark theme uses WCAG AA-compliant contrast ratios for all text elements.

---

## Visibility-Aware Polling

When `data-poll` is enabled, the client uses the [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) to avoid unnecessary network activity:

- **When `document.visibilityState === 'hidden'`** (tab backgrounded, laptop lid closed): polling pauses. Scheduled fetches are skipped, not deferred.
- **When the page becomes visible again**: an immediate fetch is triggered, then normal polling resumes.
- **Backoff resets only on successful fetch while visible** — returning to a tab does not reset backoff if the endpoint is still failing.

This prevents background tabs from waking network radios, generating noise in DevTools network panels, and creating unnecessary server load. It is a small addition with a large ergonomics payoff.

---

## Token Auth

### Purpose and Limitations

`data-token` provides a lightweight shared-secret mechanism for restricting access to the `/buildbanner.json` endpoint. The token is sent as an `Authorization: Bearer <token>` header.

**⚠️ `data-token` is a speed bump, not a security boundary.**

It is intended exclusively for:

- `localhost` development
- Internal network / VPN-only staging
- Environments where the HTML source is not publicly accessible

It is **not safe** for production or any environment where page source is viewable, because:

- The token is visible in HTML source (`View Source`, browser extensions, CSP reports)
- Any user with page access can extract it
- It cannot be rotated without redeploying all clients

**Primary defense should always be network-level controls**: reverse-proxy auth, IP allowlisting, or VPN. Token auth is a secondary "are you sure?" check.

### Client-Side Guardrails

The client enforces two warnings at initialization:

1. **Short token warning**: If `data-token` is shorter than 16 characters, the client logs a `console.warn`: `"Token is shorter than 16 characters. Short tokens offer minimal protection."` This catches accidental placeholder values like `"test"` or `"secret"`.

2. **Public hostname warning**: If the page is served over HTTPS on a hostname that does not match `localhost`, `127.0.0.1`, `*.local`, `*.internal`, or `*.test`, the client logs a `console.warn`: `"Token auth detected on a public-facing origin. data-token is intended for staging/internal use only."` This is a best-effort heuristic, not a hard block.

### Server-Side Guardrails

Server helpers should:

- **Never throw on token misconfiguration.** A dev tool middleware that prevents a server from starting violates the Cardinal Rule. If the configured token is shorter than 16 characters, the server helper logs a startup warning (`"BuildBanner: token is shorter than 16 characters, auth check disabled"`) and **disables token validation** — the endpoint serves responses without requiring auth until the token is fixed. The server still starts normally.
- Log a warning if `environment=production` and token auth is enabled.
- Document that token auth is not a substitute for network-level access control.

---

## Endpoint Configuration & Discoverability

### Default Path

The default endpoint is `/buildbanner.json`. This is intentionally predictable for zero-config setup.

### Guidance for Shared Environments

For staging servers, shared test environments, or any environment accessible beyond the immediate development team, rename the endpoint to reduce discoverability:

```html
data-endpoint="/_internal/build_9f3a2.json"
```

This is not security through obscurity — it is a practical measure to avoid triggering automated scanners and satisfying organizational policies that prohibit well-known info endpoints.

### Server Helper Defaults

Server helpers should:

- Default to `/buildbanner.json` for development.
- Accept a `path` configuration parameter for custom paths.
- Optionally support a production guard: return 404 on the endpoint unless explicitly enabled via configuration. This prevents accidental exposure if the middleware is left in a production deployment.

---

## Diagnostic Logging

BuildBanner uses a two-tier logging strategy that balances debuggability with quiet default behavior.

### Always-on: `console.debug`

All diagnostic messages are logged via `console.debug()` regardless of configuration. These messages are invisible in standard DevTools unless the user explicitly enables the "Verbose" log level. This means:

- Zero noise in normal use.
- Full diagnostic trail available when needed — just open DevTools and enable verbose logging.

Messages include: fetch failures (with HTTP status), JSON parse errors (with truncated response body), push mode fallbacks, visibility state changes, and singleton guard activations.

### Opt-in: `console.warn` via `data-debug="true"`

When `data-debug="true"` is set, the same diagnostic messages are promoted to `console.warn`, making them visible by default in DevTools. This is useful during initial integration or when debugging endpoint issues.

### Session log cap

Diagnostic messages are capped at 20 per session to prevent log flooding during extended polling failures. After the cap, logging stops silently.

### Why this matters

Without this, users encounter "BuildBanner is broken" when the actual problem is their endpoint returning malformed JSON or a 403. The always-on `console.debug` approach costs nothing in normal operation but saves significant debugging time.

---

## Server Helpers

### Design Principle

Each helper is a **single-file, zero-dependency** middleware. It:

1. Reads git info **once at startup** (cached in memory)
2. **Environment variables override git**: `BUILDBANNER_SHA`, `BUILDBANNER_BRANCH`, `BUILDBANNER_REPO_URL`, `BUILDBANNER_COMMIT_DATE`, `BUILDBANNER_DEPLOYED_AT`. Checked first; git is the fallback. This makes BuildBanner usable in distroless images, stripped Docker layers, Bazel builds, Nix, and any environment without `.git/`.
3. Sanitizes remote URL (strips tokens, userinfo, `.git` suffix)
4. Serves `GET /buildbanner.json`
5. Accepts optional `extras` callback for dynamic fields (test status, build freshness, custom data)
6. **Never throws.** If both env vars and git fail, fields are null. If extras callback fails, response omits extras.
7. **Stringifies custom values.** Any non-string value in `custom` is converted via `String()` / `str()` / `.to_s`. Client ignores non-string values as a safety net.

### Repo URL Sanitization

Server helpers sanitize `repo_url` by stripping:

- Userinfo (`user:pass@`, `oauth2:token@`)
- `.git` suffix
- Trailing slashes

**Self-hosted Git edge cases.** Sanitization rules are tested against GitHub, GitLab, and Bitbucket URL formats. For self-hosted GitLab, Gitea, Azure DevOps, or SSH-only remotes with nonstandard paths:

- Stripping `.git` or userinfo may produce a URL that does not resolve to a valid web page.
- Server helpers strip what they can but make no guarantees about the resulting URL being navigable.
- The **client** is responsible for safe link generation — it will only generate clickable links for known host patterns and render plain text otherwise (see **Link Generation** above).

**Rule: helpers sanitize, clients validate. Neither guesses.**

### Python (WSGI / ASGI)

```python
# Flask
from buildbanner import buildbanner_blueprint
app.register_blueprint(buildbanner_blueprint())

# FastAPI / Starlette
from buildbanner import BuildBannerMiddleware
app.add_middleware(BuildBannerMiddleware)

# Django
MIDDLEWARE = ['buildbanner.django.BuildBannerMiddleware']

# Raw WSGI
from buildbanner import buildbanner_wsgi
app = buildbanner_wsgi(app)

# With dynamic extras
buildbanner_blueprint(extras=lambda: {
    "tests": {"status": "pass", "summary": "1.1M passed", "url": "/api/tests"},
    "custom": {
        "model": get_active_model(),
        "maps": f"{len(maps)} loaded",
        "workers": str(active_worker_count()),
        "cache": f"{cache_hit_rate():.0%} hit rate"
    }
})
```

Package: `pip install buildbanner` — single file, stdlib only.

### Ruby (Rack middleware)

```ruby
# Gemfile
gem 'buildbanner'

# Rails — config/application.rb
config.middleware.use BuildBanner::Middleware

# With extras
config.middleware.use BuildBanner::Middleware,
  path: '/buildbanner.json',
  extras: -> {
    { tests: { status: 'pass', summary: '342 passed', url: '/tests' },
      custom: { workers: Sidekiq::Stats.new.workers_size.to_s } }
  }
```

Package: `gem install buildbanner` — single file, no dependencies.

### Node (Express / Koa / Hono)

```js
// Express
const { buildbanner } = require('buildbanner');
app.use(buildbanner());

// With extras
app.use(buildbanner({
  path: '/buildbanner.json',
  extras: () => ({
    tests: { status: 'pass', summary: '342 passed', url: '/tests' },
    build: { status: 'fresh', summary: 'built 2m ago' },
    custom: { upstreams: '3 healthy' }
  })
}));
```

Package: `npm install buildbanner` — single file, no dependencies.

### Manual (Any Language, ~20 lines)

```
1. At startup:
   - Check env vars first: BUILDBANNER_SHA, BUILDBANNER_BRANCH, BUILDBANNER_REPO_URL, BUILDBANNER_COMMIT_DATE, BUILDBANNER_DEPLOYED_AT
   - If any env var is missing, fall back to git:
     - git log -1 --format="%H %h %cd" --date=iso-strict
     - git rev-parse --abbrev-ref HEAD
       → if result is "HEAD" (detached): try git describe --tags --exact-match
       → if tag found: use tag as branch. else: branch = null.
     - git remote get-url origin → strip ://user:pass@ → strip .git
   - Record start time as ISO 8601 UTC (omit for serverless)
   - Cache everything in memory
2. On GET /buildbanner.json → return cached JSON + dynamic fields
   - If Authorization header present and server has auth configured, validate token
   - Set Cache-Control: no-store (see Caching section)
```

---

## Caching & Polling

Caching and polling can conflict if not handled explicitly.

**Server helpers** set the following response headers by default:

| Header | Value | Reason |
|--------|-------|--------|
| `Cache-Control` | `no-store` | Ensures every request gets fresh data. CDNs and browsers will not serve stale responses. |
| `Content-Type` | `application/json` | Standard JSON response. |

**Client polling** sends `Cache-Control: no-cache` on re-fetch requests as an additional cache-busting signal for intermediate proxies (CDNs, service workers, reverse proxies).

**No implicit caching.** The server always responds with `no-store`. If you want CDN caching for low-traffic setups (e.g., a static deployment where the JSON changes only on deploy), configure your server helper explicitly with a cache policy: `buildbanner({ cache: { maxAge: 60 } })`. This overrides the default `no-store` with `private, max-age=60`. The client will still send `no-cache` on polling re-fetches.

If you are serving `buildbanner.json` through a CDN or reverse proxy and using polling, ensure your cache layer respects `Cache-Control: no-store` from the origin. Otherwise users will file "polling doesn't update" bugs that are actually CDN behavior.

---

## Content Security Policy (CSP) Compatibility

BuildBanner is designed to work under strict CSPs:

- **No `eval()`** — never used.
- **No `innerHTML`** — all DOM content is set via `textContent` and `createElement`.
- **No inline styles** — all styling is via class-based CSS (inside Shadow DOM or namespaced fallback classes). No `style=""` attributes.
- **No inline scripts** — BuildBanner loads as an external script file.

**If self-hosting**, no CSP changes are needed beyond allowing your own origin.

**If loading from a CDN** (requires publishing to npm first), add the CDN domain to `script-src`:

```
Content-Security-Policy: script-src 'self' https://cdn.example.com;
```

**If using Shadow DOM**, no additional CSP directives are required — Shadow DOM styles are encapsulated and do not trigger `style-src` violations.

---

## Security Posture

The `/buildbanner.json` endpoint exposes git metadata (SHA, branch, repo URL) that may be sensitive on public-facing environments. BuildBanner provides multiple layers of defense:

1. **`data-env-hide`** — auto-hides the banner for specified environments. Set `data-env-hide="production,staging"` to suppress rendering when the response's `environment` field matches. **Note:** the client must still perform the fetch to learn the environment value. `data-env-hide` suppresses rendering, not the network request.
2. **`data-token`** — sends a Bearer token on fetch. Server helpers can validate this token and return 401 for unauthorized requests. **This is a speed bump, not a security boundary.** See **Token Auth** above for full details and limitations.
3. **Same-origin by default** — the client fetches from the same origin. No CORS headers are set by server helpers, so cross-origin requests fail silently.
4. **Remove the script tag** — the simplest production defense. If `<script src="buildbanner.min.js">` is not in your production HTML, there is zero client-side footprint.
5. **Network-level controls** — for staging environments accessible on the public internet, restrict `/buildbanner.json` via IP allowlisting or VPN at the reverse proxy layer. **This is the recommended primary defense.** Token auth and `data-env-hide` are secondary layers.
6. **Endpoint renaming** — for shared or semi-public staging environments, rename the endpoint path to reduce discoverability by automated scanners. See **Endpoint Configuration** above.

---

## Canonical Render Order

The banner renders segments in this fixed order. Missing fields are skipped, not replaced with placeholders.

1. `app_name` (if present)
2. `environment` (if present)
3. `branch` (linked to repo tree — **hidden entirely if value is `"HEAD"` or null**)
4. `sha` (linked to commit for known hosts, plain text otherwise. Click-to-copy.)
5. `commit_date` (local time)
6. Uptime (from `server_started`) and/or deploy age (from `deployed_at`)
7. Status blocks: `tests`, then `build` (with indicator dots)
8. `port`
9. `custom` fields (rendered in **alphabetical key order** for stability)
10. Dismiss ✕

This ordering is not configurable in v1. Stable ordering prevents "why did this jump around?" complaints when fields appear or disappear between polls.

---

## Resilience Guarantees

### Client: "Never crash the host app"

| Scenario | Behavior |
|----------|----------|
| Endpoint 404/500 | No banner. `console.debug` logs status. |
| Invalid JSON | No banner. `console.debug` logs parse error and truncated body. |
| Slow endpoint (>3s) | Timeout. No banner. App unblocked. |
| Unknown fields in response | Ignored. Forward-compatible. |
| Missing optional fields | Shows what's available, skips the rest. |
| CSS conflict | Shadow DOM isolates + `all: initial` resets inherited properties. Fallback: namespaced classes with explicit resets. |
| JS error in BuildBanner | Top-level try/catch. Banner hides on error. |
| CSP blocks inline styles | Class-based CSS only, no inline styles. |
| Multiple script tags | Singleton guard. Second init is no-op with `console.debug` message. |
| Storage APIs blocked | Dismiss falls back to in-memory flag. |
| Clipboard API blocked | Click-to-copy falls back to text selection. |
| Called before DOM ready | Waits for DOMContentLoaded. |
| HTML instead of JSON | JSON.parse fails → no banner. Logged at `console.debug`. |
| Token in repo_url | **Server strips it.** Client never parses auth. |
| CORS blocks fetch | No banner. Should be same-origin. |
| XSS in field values | All values textContent, never innerHTML. |
| Poll error mid-session | Banner keeps last good data. No flicker. Backoff: interval doubles per consecutive failure, caps at 5min, resets on success. |
| Tab backgrounded during polling | Polling pauses via Visibility API. Resumes on tab focus. |
| `<html>` already has padding | Push mode falls back to overlay. Existing padding untouched. |
| Unknown git host in repo_url | SHA/branch rendered as plain text. No broken links generated. |
| `destroy()` called | DOM removed, padding subtract-not-overwrite restore, polling stopped, visibility listener removed, global methods no-op'd. |

### Server: "Never crash the host app"

| Scenario | Behavior |
|----------|----------|
| Not a git repo | Falls back to `BUILDBANNER_*` env vars. If those are also absent, `sha`, `branch` = null. Banner shows uptime/port. |
| `git` not installed | Falls back to `BUILDBANNER_*` env vars. If absent, all git fields null. |
| Remote URL has credentials | Stripped before caching. |
| Detached HEAD (CI/Docker) | `branch` = tag name if available, else null. `sha` still valid. |
| `extras` callback throws | Caught. Response sent without extras. Logged once. |
| `data-token` set, no server auth | Server ignores token. Client sends it; no harm if unused. |
| High traffic | Pre-serialized response from memory. |
| Token shorter than 16 chars | Server helper logs warning at startup, disables auth check. Server still starts normally. |
| Token auth enabled in production | Server helper logs warning at startup. |

### The Cardinal Rule

> **A monitoring tool that crashes the thing it monitors is worse than no monitoring.**

---

## Size Budget

### Target: <3KB gzipped

The client library targets <3KB gzipped. This budget is tight given the feature set (Shadow DOM, polling, backoff, clipboard fallback, push mode, CSP safety, diagnostic logging, visibility API), but achievable with disciplined implementation.

### Enforcement

- **CI size gate**: the build pipeline includes a gzipped size check. Builds fail if the output exceeds the budget.
- **No optional dependencies**: all features are implemented with browser APIs only. No polyfills are bundled. Clipboard API falls back to text selection; no clipboard polyfill.
- **Size reported on every PR**: the CI pipeline comments the current gzipped size on pull requests to make regressions immediately visible.

### Policy

- **v1 feature freeze**: no new client features after v1.0 ships. Bug fixes only.
- **Size regression policy**: any PR that increases gzipped size by >100 bytes requires explicit justification and sign-off.
- **The psychological advantage**: "<3KB" is the drop-in selling point. If it grows silently, the project loses its positioning.

---

## Destroy & Lifecycle

### SPA Considerations

In single-page applications, BuildBanner must clean up completely when the view changes or the app unmounts the banner. `BuildBanner.destroy()` performs the following:

1. Removes the `<build-banner>` element from the DOM.
2. Restores `<html>` padding using subtract-not-overwrite (see **Push Mode Safety**). If no other tool modified the padding, restores to original value. If another tool added padding after init, subtracts only BuildBanner's contribution.
3. Clears all polling timers.
4. Removes the `visibilitychange` event listener.
5. Marks the instance as destroyed — all methods on `window.BuildBanner` become no-ops. The global is **not deleted**, so existing references don't throw.

After `destroy()`, a new active instance can be created by calling `BuildBanner.init()`.

### Framework Integration

```js
// React
useEffect(() => {
  BuildBanner.init({ endpoint: '/buildbanner.json', poll: 30 });
  return () => BuildBanner.destroy();
}, []);

// Vue
onMounted(() => BuildBanner.init({ endpoint: '/buildbanner.json', poll: 30 }));
onUnmounted(() => BuildBanner.destroy());
```

---

## Test Strategy

### Client Tests (~230)

| Category | Count | What |
|----------|-------|------|
| Rendering | ~30 | Correct segments for each field combination |
| Links | ~20 | SHA → commit, branch → tree, new tab, rel=noopener, **unknown host → plain text**, **known host patterns** |
| Click-to-copy | ~5 | SHA click → clipboard, fallback selection, **in-place "Copied!" text swap reverts after 1.5s** |
| Missing fields | ~20 | Each optional field absent → rest still renders |
| Branch hiding | ~5 | `"HEAD"` → hidden, null → hidden, empty → hidden, valid → shown |
| Custom enforcement | ~5 | Multiple keys rendered in alpha order, non-string values ignored, empty map → no custom segments |
| Dismiss | ~10 | Session, permanent, no-dismiss, storage blocked |
| Fetch failures | ~15 | 404, 500, timeout, bad JSON, network error, CORS, **diagnostic log output verified** |
| Uptime & deploy age | ~10 | Uptime from server_started, deploy age from deployed_at, both present, neither present, serverless (deployed_at only) |
| Push mode | ~10 | `data-push="true"` adds padding-top, `"false"` floats, **destroy subtracts banner height from current padding**, **destroy preserves third-party padding changes**, bottom position, **existing padding → auto fallback to overlay** |
| Status dots | ~10 | Correct indicator per status, unknowns → gray |
| Polling | ~20 | Interval, in-place update, error during poll keeps last data, exponential backoff on failures, reset on success, **pauses when hidden**, **resumes on visible**, **backoff not reset by visibility change alone** |
| Singleton | ~5 | Double init is no-op, destroy+reinit works, console.debug message on duplicate |
| Destroy lifecycle | ~10 | DOM removed, padding restored, timers cleared, visibility listener removed, **methods become no-ops**, **global not deleted**, **re-init after destroy** |
| XSS | ~10 | Malicious branch names, custom values → escaped |
| Config | ~15 | data-attributes, programmatic API, defaults |
| Shadow DOM | ~5 | Isolation works, `all: initial` prevents inheritance, fallback works |
| Accessibility | ~10 | `aria-live="polite"` on status container only, **status change triggers announcement**, **uptime tick does not trigger announcement**, close button keyboard-navigable, focus-visible ring, tab order correct, no auto-focus on render/poll |
| Token warnings | ~5 | Short token → console.warn, public hostname → console.warn, localhost → no warning |
| Diagnostic logging | ~10 | `console.debug` always fires, `data-debug=true` promotes to warn, session cap at 20 messages |

### Server Tests (~75 per language × 3 = ~225)

| Category | Count | What |
|----------|-------|------|
| Happy path | ~5 | Valid JSON, all fields present |
| Git missing | ~5 | No git, no remote, detached HEAD, detached HEAD with tag |
| Env var overrides | ~10 | BUILDBANNER_SHA overrides git, BUILDBANNER_DEPLOYED_AT set, partial env vars + git fallback, all env vars set, no env vars no git |
| Custom stringification | ~5 | Integer → string, float → string, bool → string, null → omitted |
| URL sanitization | ~20 | Token stripping across hosts and protocols, **self-hosted GitLab**, **Gitea**, **Azure DevOps**, **SSH-only remotes**, **malformed URLs** |
| Extras callback | ~10 | Happy, throws, invalid types, slow |
| Caching | ~5 | Computed once, not per-request |
| Response format | ~5 | Content-Type, JSON validity, 200 |
| Integration | ~5 | Middleware doesn't break existing routes |
| Token validation | ~5 | **Short token logs warning and disables auth at startup**, **production environment warning logged** |

### URL Sanitization Fixtures (shared across all languages)

```
https://user:ghp_xxxx@github.com/org/repo.git    → https://github.com/org/repo
https://oauth2:gho_xxxx@github.com/org/repo      → https://github.com/org/repo
git@github.com:org/repo.git                       → https://github.com/org/repo
ssh://git@github.com/org/repo.git                 → https://github.com/org/repo
https://github.com/org/repo.git                   → https://github.com/org/repo
https://github.com/org/repo                       → https://github.com/org/repo
https://gitlab.com/org/repo.git                   → https://gitlab.com/org/repo
https://user:token@bitbucket.org/org/repo.git     → https://bitbucket.org/org/repo
https://user:pat@gitlab.mycompany.com/org/repo.git → https://gitlab.mycompany.com/org/repo
https://user:token@gitea.internal/org/repo.git    → https://gitea.internal/org/repo   (sanitized, but client won't generate links)
https://org@dev.azure.com/org/project/_git/repo   → https://dev.azure.com/org/project/_git/repo (sanitized, but client won't generate links)
(empty)                                            → null
(no remote configured)                             → null
```

### Branch Detection Fixtures (shared across all languages)

```
main                                               → "main"
feature/login                                      → "feature/login"
HEAD (detached, tag v1.2.3 exists)                 → "v1.2.3"
HEAD (detached, no tag)                            → null
```

### Cross-Language Parity

Shared `test_fixtures.json` loaded by all three language test suites. Same inputs, same expected outputs.

---

## Project Structure

```
buildbanner/
├── client/
│   ├── buildbanner.js              # Source (~250 lines)
│   ├── buildbanner.min.js          # Minified (<3KB gzipped)
│   └── buildbanner.css             # Fallback styles
├── python/
│   ├── buildbanner/__init__.py     # Flask, Django, FastAPI, WSGI
│   ├── tests/test_buildbanner.py
│   └── pyproject.toml
├── ruby/
│   ├── lib/buildbanner.rb          # Rack middleware
│   ├── spec/buildbanner_spec.rb
│   └── buildbanner.gemspec
├── node/
│   ├── index.js               # Express, Koa, Hono
│   ├── server.js              # Server helpers (separate entry)
│   ├── tests/buildbanner.test.js
│   └── package.json
├── shared/
│   ├── schema.json            # JSON Schema for response
│   └── test_fixtures.json     # Cross-language parity
├── examples/
│   ├── flask-app/
│   ├── rails-app/
│   ├── express-app/
│   └── static-html/
├── docs/
│   ├── README.md
│   ├── configuration.md
│   ├── security.md            # Token auth limitations, network-level controls
│   ├── csp.md
│   └── self-hosting.md
└── LICENSE                    # MIT
```

---

## Scope: v1.0

### In
- Client JS widget (Shadow DOM with `all: initial` reset, fallback CSS)
- JSON schema + endpoint contract with protocol versioning (`_buildbanner.version`)
- Server helpers: Python (Flask/Django/FastAPI/WSGI), Ruby (Rails/Rack), Node (Express/Koa)
- Environment variable overrides (`BUILDBANNER_SHA`, `BUILDBANNER_BRANCH`, `BUILDBANNER_DEPLOYED_AT`, etc.) for containerized/CI builds
- `deployed_at` field for deploy age (distinct from process uptime)
- GitHub/GitLab/Bitbucket link generation, **with plain-text fallback for unknown hosts**
- Click-to-copy SHA
- Branch hiding (suppress `"HEAD"` / null / empty)
- Dismiss (session/permanent)
- Status dots (tests, build) with clickable detail URLs
- Multiple custom key-value fields with string enforcement and stable alphabetical ordering
- Polling for live updates with exponential backoff **and visibility-aware pausing**
- Cache-Control headers (server: `no-store`, client polling: `no-cache`)
- `data-push` layout mode (default: push app down with `padding-top`) **with existing-padding safety guard**
- Canonical render order (fixed, not configurable)
- Cross-language test fixtures (URL sanitization, branch detection for detached HEAD)
- Dark/light/auto theme
- `data-env-hide` for production
- Lightweight `data-token` auth (Bearer header) **with client and server guardrails**
- CSP compatibility documentation
- Security posture documentation
- **Singleton guard for multi-instance safety**
- **`BuildBanner.destroy()` with full cleanup (DOM, padding, timers, listeners)**
- **`BuildBanner.refresh()` for manual re-fetch**
- **Accessibility: role="status", aria-live, keyboard navigation, focus-visible**
- **Two-tier diagnostic logging (console.debug always, console.warn opt-in)**
- **CI size budget enforcement (<3KB gzipped)**
- **Configurable endpoint path with discoverability guidance**

### Out (v1.0)
- PR detection from branch names
- WebSocket push
- Full auth/RBAC on endpoint
- Framework wrappers (React/Vue) — but `destroy()` enables clean integration (see examples above)
- Nested/typed `custom` values (planned v2)
- `links` array for arbitrary clickable links — Sentry, Datadog, Jira, internal docs (planned v2, schema: `[{"label": "Sentry", "url": "https://...", "icon": "error_log"}]`)
- CSS dot indicators replacing emoji (planned v2)
- `vscode://` local file links for development environments (planned v2)
- `repo_kind` field for server-side host detection, enabling self-hosted Git link generation (planned v2)
- Configurable render order

---

## Open Questions

1. ~~**Name**~~: → `BuildBanner`. Descriptive, unambiguous about purpose. Package names: `buildbanner` (npm, pip, gem). Endpoint: `/buildbanner.json`.
2. ~~**Monorepo or multi-repo**~~: → **Monorepo.** Shared test fixtures, shared JSON schema, and client/server helpers must stay in sync on the contract. Publish to npm/pypi/rubygems using changesets or release-please.
3. ~~**Auto-detect endpoint**~~: → **Yes.** Try `/buildbanner.json`, give up silently on failure. Zero-config is the killer feature.
4. ~~**Default poll**~~: → **0** (fetch once). Polling is opt-in for apps with live test/build status.
5. ~~**License**~~: → MIT

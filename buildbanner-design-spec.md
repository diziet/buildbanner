# BuildBanner — Design Spec

> A crash-proof, language-agnostic developer info banner for web apps.
> Drop a `<script>` tag into any app, point it at a JSON endpoint, get a GitHub-linked admin strip.

---

## Problem

Every web project eventually gets a "what's deployed?" bar that shows the git SHA, branch, uptime and environment. Developers copy it from project to project, and each time they reimplement:

- Reading the git information (branch, SHA, date, remote URL)
- Building GitHub links (commit, branch, PR)
- Inserting HTML without ever breaking the host app
- Removing tokens and secrets from remote URLs
- Showing nothing, with no error, when the endpoint is down

Adding the bar should take 5 minutes, not a weekend.

---

## Core Concept

**Two pieces, loosely coupled:**

1. **Client** — A single `<script>` tag with no dependencies. It fetches a JSON endpoint and renders a thin banner. If anything fails, it silently does nothing.

2. **Server contract** — A JSON schema for a `GET /buildbanner.json` endpoint, which any backend can implement. Optional helper libraries implement it as one-line middleware for Python, Rails and Node.

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

- **Language agnostic** — the server returns only JSON and needs no HTML templating
- **Cacheable** — the JS is a static file that a CDN can serve; only the JSON changes
- **Safe** — the banner is in its own DOM scope and never changes the app's styles
- **Optional** — remove the `<script>` tag in production, and nothing of the banner remains

---

## JSON Contract (Server → Client)

### Endpoint: `GET /buildbanner.json`

The path can be set on both the client and the server. The response:

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

1. **Only `sha` and `branch` are required.** All other fields, including `server_started`, are optional. The client renders the fields that are present and skips the missing ones.
2. **`_buildbanner.version`** is recommended. The client reads it to handle future contract changes. Without it, the client assumes version 1.
3. **`repo_url` MUST NOT contain tokens, passwords, or credentials.** Server helpers remove them.
4. **All timestamps are ISO 8601 UTC.** The client converts them to local time for display.
5. **`tests.status` and `build.status` set the indicator dots** — green, red, yellow or gray.
6. **`custom` is a flat string→string map** in v1. It holds any number of key-value pairs, and each renders as a `key: value` segment, in alphabetical order of key. Apps use it for their own information, such as the active ML model, worker count, cache statistics or region. Server helpers convert non-string values to strings. The client ignores any value that is not a string. Nested and typed values are planned for v2.
7. **`tests.url` and `build.url` are clickable** — a click opens the details page in a new tab.
8. **`server_started` vs `deployed_at`** — The two fields record different times. `server_started` is when the process started; the "uptime" counter is computed from it. `deployed_at` is when this version of the code was deployed, shown as "deployed 3h ago". In serverless or FaaS, where process uptime means nothing, omit `server_started` and set `deployed_at`. In a long-running server, set both. The client renders whichever is present: the uptime from `server_started` and the deploy age from `deployed_at`.

### Conceptual Field Groups

The JSON is flat, but the fields fall into groups. The groups help with documentation and later refactoring:

- **Identity**: `sha`, `sha_full`, `branch`, `commit_date`, `repo_url` — what code is running
- **Runtime**: `server_started`, `deployed_at`, `port`, `environment`, `app_name` — where and how it runs
- **Status**: `tests`, `build` — current health indicators
- **Custom**: `custom` — app-specific data
- **Meta**: `_buildbanner` — protocol versioning

### Error Responses

For any non-200 response or malformed JSON, the client silently hides the banner. It does not retry the initial load. The diagnostic details are always logged with `console.debug`, which DevTools shows only at the verbose log level, and also with `console.warn` when `data-debug="true"`. See **Diagnostic Logging** below.

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

No configuration is needed if the endpoint is at `/buildbanner.json`:

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
| `data-env-hide` | (none) | Comma-separated environments in which the banner hides: `"production,staging"` |
| `data-height` | `28` | Banner height in px. Minimum 24, maximum 48. |
| `data-debug` | `false` | `true` also writes the diagnostic logs with `console.warn`. They are always written with `console.debug`, whatever this setting is. |
| `data-poll` | `0` | Seconds between fetches (0 = fetch once). Keeps the test status, build status and uptime current. |
| `data-push` | `true` | `true` adds a `padding-top` equal to the banner height to `<html>`, which moves the app down. `false` places the banner over the content (sticky). **If `<html>` already has a non-zero padding, push mode falls back to the overlay to avoid a layout conflict.** See **Push Mode Safety** below. |
| `data-token` | (none) | A shared token that the client sends in an `Authorization: Bearer <token>` header with each fetch. **Not a security boundary; meant only for staging and internal use.** See **Token Auth** below. |

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

A page can have only one BuildBanner instance. If the script is included more than once, which is common with micro-frontends and template includes, the second initialization does nothing and logs a `console.debug` message: `"[BuildBanner] Already initialized — skipping duplicate script."` The active instance is stored in `window[Symbol.for("buildbanner")]`, or in `window.__buildBannerInstance` where Symbol is not supported.

After `BuildBanner.destroy()`, `window.BuildBanner` is **not deleted**: its methods do nothing and return silently. Code that holds a reference to the object, which is common with bundlers and framework integrations, therefore keeps working. Calling `BuildBanner.init()` creates a new active instance.

### Rendering Rules

1. **Prepended to `<body>`** as the first child, or appended if `position=bottom`. When `data-push="true"` (the default), the client adds a `padding-top` equal to the banner height to `<html>`, so the app moves down instead of being covered. Destroy removes the padding. See **Push Mode Safety** for the edge cases.
2. **Default height: 28px** (set with `data-height`, min 24, max 48). The banner never wraps or grows. Overflow is hidden, with an ellipsis.
3. **Shadow DOM** isolates the styles. The shadow root's top-level wrapper sets `all: initial`, so inherited CSS properties from the host app (`font-family`, `color`, `line-height`, etc.) do not apply. The client checks for `attachShadow`. If `attachShadow` is unavailable, it falls back to namespaced classes (`.__buildbanner-*`): every style then uses a `.__buildbanner-` prefixed selector with high specificity and explicit resets for the inheritable properties.
4. **z-index: 999999**, high but not the maximum, so the host app can place elements above it. Position: sticky. An app that needs another value sets it with `BuildBanner.init({ zIndex })`.
5. **GitHub links open in new tab** (`target="_blank" rel="noopener"`).
6. **Click-to-copy SHA** — a click on the SHA segment copies the full SHA (`sha_full` or `sha`) to the clipboard. On success, the segment shows "Copied!" in place of the SHA for 1.5 seconds, then shows the SHA again. A tooltip would be clipped by the banner's `overflow: hidden` and fixed height inside the Shadow DOM, so the text is swapped in place instead. Without the Clipboard API, the client selects the text.
7. **Branch hiding** — if `branch` is `"HEAD"`, empty, or null, the branch segment is not shown. No segment is better than a misleading one.
8. **Uptime computed client-side** from `server_started`, so it stays current without polling. It is omitted when `server_started` is absent. **Deploy age** is computed from `deployed_at` and shows as "deployed 3h ago". If both fields are present, both are shown. If only `deployed_at` is present (serverless), the uptime is omitted.
9. **Status dots**: 🟢 pass/fresh, 🔴 fail/stale, 🟡 running/building, ⚪ idle/unknown. v1 draws them as text emoji, which work everywhere and need no dependency. An internal abstraction lets v2 switch to CSS dots without an API change.
10. **`tests.url`** makes the test segment a link to the details page.
11. **Custom value enforcement** — the client ignores any `custom` value that is not a string. Server helpers convert values to strings.
12. **Polling** fetches again every N seconds and updates the banner in place. Only the fields that can change are updated (tests, build, custom). After consecutive fetch failures, the interval grows exponentially (N → 2N → 4N, up to 5 minutes). The next success resets it to the original interval. **Polling is visibility-aware** — see **Visibility-Aware Polling** below.

### Push Mode Safety

The `data-push="true"` mode adds `padding-top` (or `padding-bottom`) to the `<html>` element to move the app content.

**Guard: existing padding detection.** Before it adds padding, the client reads the computed `padding-top` of `<html>`. If it is already non-zero (set by the host app, a CSS framework, or another tool), BuildBanner **does not modify it** and silently falls back to overlay mode (`position: fixed`, no push). This avoids conflicts with apps that change `<html>` styles for fullscreen layouts, mobile viewport workarounds, or SPA router measurements.

**On destroy**, the client uses a **subtract-not-overwrite** strategy, so it does not overwrite padding that other tools (cookie banners, notification bars, etc.) added after BuildBanner initialized:

1. Read the current computed `padding-top`.
2. If it equals `originalPadding + bannerHeight` (no other tool changed it), restore `originalPadding`.
3. If it differs (another tool added or removed padding after init), subtract `bannerHeight` from the current value. This keeps the other tool's padding.
4. Clamp to `0`, so the padding is never negative.

This covers a common SPA case: a cookie consent banner adds 40px of padding after BuildBanner is running. Writing back the original value would remove the cookie banner's padding; subtracting keeps it.

**Rule of thumb: if `<html>` already has padding, leave it unchanged.**

### Link Generation

When `repo_url` is present:

| Field | Link |
|-------|------|
| `sha` | `{repo_url}/commit/{sha_full or sha}` |
| `branch` | `{repo_url}/tree/{branch}` |

**Safe link generation.** The client builds links only when `repo_url` matches one of these **exact host patterns**:

| Host | Commit path | Tree path |
|------|-------------|-----------|
| `github.com` | `/commit/{sha}` | `/tree/{branch}` |
| `gitlab.com` | `/-/commit/{sha}` | `/-/tree/{branch}` |
| `bitbucket.org` | `/commits/{sha}` | `/src/{branch}` |

For every other host, including self-hosted GitLab, Gitea, Azure DevOps, and SSH-only remotes, the client renders the SHA and branch as **plain text with no links**. The client therefore never shows a broken link that looks correct.

Earlier drafts matched `gitlab.*` as a wildcard. That would match unrelated domains and miss self-hosted servers at `code.company.com` or `git.internal`. Exact matching covers fewer hosts but is never wrong.

**v2: `repo_kind` field.** For self-hosted Git servers, v2 will add an optional `repo_kind` field to the JSON contract (`"github"` | `"gitlab"` | `"bitbucket"` | `"unknown"`). Server helpers will set it from the remote URL, which moves host detection to the server. The client will build links from `repo_kind` instead of guessing from the hostname. Until then, self-hosted users can register their own patterns with `BuildBanner.init({ hostPatterns: [...] })`.

The client never guesses a URL structure beyond the paths listed above. No link is better than a wrong link.

### Banner Layout

```
[branch-link] · [sha-link 📋] · Feb 13 14:30 · up 2h 15m · 🟢 1.1M passed · port 8001  ✕
```

- Segments separated by ` · `
- Links: subtle underline on hover, same muted color as text
- SHA: click to copy full SHA to clipboard (in-place "Copied!" text swap for 1.5s)
- Dismiss ✕ on far right
- Truncated from the right when the window is narrow
- Status dots are text emoji (no image dependencies)

### Accessibility

BuildBanner is a dev tool, but dev tools stay enabled in demos, staging walkthroughs and screen-sharing sessions. The banner meets these basic accessibility requirements:

- **`role="status"` and `aria-live="polite"`** on the status segment container (tests, build), **not** on the banner host element. Screen readers then announce the state changes that matter (pass→fail, fresh→stale), and not every uptime tick, deploy-age update or identical poll response. The banner host has `role="toolbar"` for identification. On a poll update, the client changes the live region only when a `tests.status` or `build.status` value differs from its previous value.
- **`aria-label="Build information banner"`** on the host for identification.
- **Keyboard-navigable close button** with visible `:focus-visible` ring.
- **All interactive elements** (close button, SHA copy, links) are reachable with Tab and activated with Enter or Space.
- **No auto-focus** — the banner never takes focus from the host app, on the first render or on a polling update.
- **Sufficient contrast** — the default dark theme meets the WCAG AA contrast ratio for all text.

---

## Visibility-Aware Polling

When `data-poll` is set, the client uses the [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) to avoid needless network requests:

- **When `document.visibilityState === 'hidden'`** (tab in the background, laptop lid closed): polling pauses. Scheduled fetches are skipped, not postponed.
- **When the page becomes visible again**: the client fetches at once, then resumes normal polling.
- **Backoff resets only on successful fetch while visible** — returning to the tab does not reset the backoff while the endpoint still fails.

Background tabs therefore do not wake network radios, add entries to the DevTools network panel, or add server load.

---

## Token Auth

### Purpose and Limitations

`data-token` is a simple shared secret that restricts access to the `/buildbanner.json` endpoint. The client sends it in an `Authorization: Bearer <token>` header.

**⚠️ `data-token` only slows a visitor down. It is not a security boundary.**

It is meant only for:

- `localhost` development
- Internal network / VPN-only staging
- Environments where the HTML source is not publicly accessible

It is **not safe** in production or in any environment where users can view the page source, because:

- The token is visible in the HTML source (`View Source`, browser extensions, CSP reports)
- Any user who can load the page can read it
- Changing it means redeploying every client

**The primary defense should always be network-level controls**: reverse-proxy auth, IP allowlisting, or VPN. Token auth is a secondary "are you sure?" check.

### Client-Side Warnings

The client logs two warnings at initialization:

1. **Short token warning**: If `data-token` is shorter than 16 characters, the client logs a `console.warn`: `"Token is shorter than 16 characters. Short tokens offer minimal protection."` This catches placeholder values left in by mistake, such as `"test"` or `"secret"`.

2. **Public hostname warning**: If the page is served over HTTPS on a hostname that does not match `localhost`, `127.0.0.1`, `*.local`, `*.internal`, or `*.test`, the client logs a `console.warn`: `"Token auth detected on a public-facing origin. data-token is intended for staging/internal use only."` The check is a heuristic and blocks nothing.

### Server-Side Checks

Server helpers should:

- **Never throw on a token misconfiguration.** Dev tool middleware that stops a server from starting breaks the Cardinal Rule. If the configured token is shorter than 16 characters, the server helper logs a startup warning (`"BuildBanner: token is shorter than 16 characters, auth check disabled"`) and **disables token validation**: the endpoint serves responses without auth until the token is fixed. The server still starts normally.
- Log a warning if `environment=production` and token auth is enabled.
- Document that token auth does not replace network-level access control.

---

## Endpoint Configuration & Discoverability

### Default Path

The default endpoint is `/buildbanner.json`. It is predictable on purpose, so the banner works with no configuration.

### Guidance for Shared Environments

For staging servers, shared test environments, or any environment that people outside the development team can reach, rename the endpoint so that it is harder to find:

```html
data-endpoint="/_internal/build_9f3a2.json"
```

Renaming is not meant as security. It keeps automated scanners from flagging the endpoint, and it satisfies organizational policies that forbid well-known info endpoints.

### Server Helper Defaults

Server helpers should:

- Default to `/buildbanner.json` for development.
- Accept a `path` parameter for another path.
- Optionally support a production guard: the endpoint returns 404 unless the configuration enables it. Middleware left in a production deployment by mistake then exposes nothing.

---

## Diagnostic Logging

BuildBanner logs at two levels, so it is quiet by default and still gives the details needed for debugging.

### Always-on: `console.debug`

Every diagnostic message is logged with `console.debug()`, whatever the configuration. DevTools hides these messages unless the user enables the "Verbose" log level. As a result:

- Normal use shows no messages.
- The full diagnostic record is there when needed: open DevTools and enable verbose logging.

The messages cover fetch failures (with the HTTP status), JSON parse errors (with the truncated response body), push mode fallbacks, visibility state changes, and duplicate initializations that the singleton guard skipped.

### Opt-in: `console.warn` via `data-debug="true"`

When `data-debug="true"` is set, the client also logs the same messages with `console.warn`, which DevTools shows by default. This helps during the first integration and when debugging endpoint problems.

### Session log cap

The client logs at most 20 diagnostic messages per session, so a long run of polling failures cannot flood the console. After the 20th message, logging stops silently.

### Why this matters

Without these logs, users conclude that "BuildBanner is broken" when their endpoint returns malformed JSON or a 403. The `console.debug` logs cost nothing in normal use and save debugging time.

---

## Server Helpers

### Design Principle

Each helper is a **single-file, zero-dependency** middleware. It:

1. Reads the git information **once at startup** and caches it in memory
2. **Environment variables override git**: `BUILDBANNER_SHA`, `BUILDBANNER_BRANCH`, `BUILDBANNER_REPO_URL`, `BUILDBANNER_COMMIT_DATE`, `BUILDBANNER_DEPLOYED_AT`. They are checked first, and git is the fallback. BuildBanner therefore works in distroless images, stripped Docker layers, Bazel builds, Nix, and any environment without `.git/`.
3. Sanitizes the remote URL (removes tokens, userinfo and the `.git` suffix)
4. Serves `GET /buildbanner.json`
5. Accepts an optional `extras` callback for dynamic fields (test status, build freshness, custom data)
6. **Never throws.** If both the environment variables and git fail, the fields are null. If the `extras` callback fails, the response omits the extras.
7. **Stringifies custom values.** Any non-string value in `custom` is converted with `String()` / `str()` / `.to_s`. The client also ignores non-string values, in case a server sends one.

### Repo URL Sanitization

Server helpers sanitize `repo_url` by removing:

- Userinfo (`user:pass@`, `oauth2:token@`)
- `.git` suffix
- Trailing slashes

**Self-hosted Git edge cases.** The sanitization rules are tested against GitHub, GitLab and Bitbucket URL formats. For self-hosted GitLab, Gitea, Azure DevOps, or SSH-only remotes with nonstandard paths:

- Removing `.git` or the userinfo may produce a URL that is not a valid web page.
- Server helpers remove what they can, but they do not guarantee that the resulting URL opens a page.
- The **client** is responsible for safe links: it builds links only for known host patterns and renders plain text otherwise (see **Link Generation** above).

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

Caching and polling can conflict unless both are handled explicitly.

**Server helpers** set the following response headers by default:

| Header | Value | Reason |
|--------|-------|--------|
| `Cache-Control` | `no-store` | Every request gets current data. CDNs and browsers do not serve stale responses. |
| `Content-Type` | `application/json` | Standard JSON response. |

**Client polling** sends `Cache-Control: no-cache` with each repeated fetch, a second signal to intermediate proxies (CDNs, service workers, reverse proxies) not to serve a cached copy.

**No implicit caching.** The server always responds with `no-store` unless you configure otherwise. For CDN caching in a low-traffic setup, such as a static deployment where the JSON changes only on deploy, give the server helper a cache policy: `buildbanner({ cache: { maxAge: 60 } })`. It replaces the default `no-store` with `private, max-age=60`. The client still sends `no-cache` with polling fetches.

If you serve `buildbanner.json` through a CDN or reverse proxy and use polling, check that the cache honors `Cache-Control: no-store` from the origin. Otherwise users will report "polling doesn't update" bugs that the CDN causes.

---

## Content Security Policy (CSP) Compatibility

BuildBanner is built to work under a strict CSP:

- **No `eval()`** — never called.
- **No `innerHTML`** — all DOM content is set with `textContent` and `createElement`.
- **No inline styles** — all styles are class-based CSS (inside the Shadow DOM, or the namespaced fallback classes). No `style=""` attributes.
- **No inline scripts** — BuildBanner loads as an external script file.

**If you self-host**, the CSP needs no change beyond allowing your own origin.

**If you load it from a CDN** (which requires publishing to npm first), add the CDN domain to `script-src`:

```
Content-Security-Policy: script-src 'self' https://cdn.example.com;
```

**With Shadow DOM**, no extra CSP directive is required: styles inside the shadow root do not trigger `style-src` violations.

---

## Security Posture

The `/buildbanner.json` endpoint exposes git metadata (SHA, branch, repo URL), which may be sensitive in a public-facing environment. BuildBanner has several layers of defense:

1. **`data-env-hide`** — hides the banner in the listed environments. Set `data-env-hide="production,staging"` so that the banner does not render when the response's `environment` field matches. The client must still fetch to read the environment value: `data-env-hide` stops the rendering, not the network request.
2. **`data-token`** — the client sends a Bearer token with each fetch. Server helpers can check the token and return 401 for unauthorized requests. **It only slows a visitor down and is not a security boundary.** See **Token Auth** above for the details and limits.
3. **Same-origin by default** — the client fetches from the same origin. Server helpers set no CORS headers, so cross-origin requests fail silently.
4. **Remove the script tag** — the simplest defense in production. If `<script src="buildbanner.min.js">` is not in your production HTML, nothing of BuildBanner runs in the browser.
5. **Network-level controls** — for a staging environment reachable from the public internet, restrict `/buildbanner.json` with IP allowlisting or a VPN at the reverse proxy. **This is the recommended primary defense.** Token auth and `data-env-hide` are secondary layers.
6. **Endpoint renaming** — in a shared or semi-public staging environment, rename the endpoint path so that automated scanners are less likely to find it. See **Endpoint Configuration** above.

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

The order cannot be changed in v1. A fixed order keeps segments from moving when fields appear or disappear between polls.

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

### Target: ~~<3KB gzipped~~ (corrected 2026-09-24; see below)

The client library's target is ~~<3KB gzipped~~. The budget is tight for the feature set (Shadow DOM, polling, backoff, clipboard fallback, push mode, CSP safety, diagnostic logging, visibility API), but it can be met if each feature is implemented with care for size. Corrected 2026-09-24: `client/dist/buildbanner.min.js` measured 8,488 bytes gzipped, under the 8,500-byte `BUDGET_BYTES` in `client/scripts/size-budget.js`.

### Enforcement

- **CI size gate**: the build pipeline checks the gzipped size, and a build fails when the output exceeds the budget.
- **No optional dependencies**: all features use only browser APIs. No polyfills are bundled. Without the Clipboard API, the client selects the text; there is no clipboard polyfill.
- **Size reported on every PR**: the CI pipeline posts the current gzipped size as a comment on each pull request, so a regression shows up at once.

### Policy

- **v1 feature freeze**: no new client features after v1.0 ships. Bug fixes only.
- **Size regression policy**: any PR that increases the gzipped size by >100 bytes needs a stated reason and sign-off.
- **Why the number matters**: ~~"<3KB"~~ is the main reason to add the script without a second thought. If the size grows unnoticed, the project loses that reason. Corrected 2026-09-24: `client/dist/buildbanner.min.js` measured 8,488 bytes gzipped (see **Target** under **Size Budget**).

---

## Destroy & Lifecycle

### SPA Considerations

In a single-page application, BuildBanner must remove everything it added when the view changes or the app unmounts the banner. `BuildBanner.destroy()` does the following:

1. Removes the `<build-banner>` element from the DOM.
2. Restores the `<html>` padding with subtract-not-overwrite (see **Push Mode Safety**). If no other tool changed the padding, it restores the original value. If another tool added padding after init, it subtracts only BuildBanner's padding.
3. Clears all polling timers.
4. Removes the `visibilitychange` event listener.
5. Marks the instance as destroyed: every method on `window.BuildBanner` then does nothing. The global is **not deleted**, so code that holds a reference does not throw.

After `destroy()`, calling `BuildBanner.init()` creates a new active instance.

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

The test suites of all three languages load the shared `test_fixtures.json`, so they share the inputs and the expected outputs.

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

Corrected 2026-09-24: the "<3KB gzipped" comment on `buildbanner.min.js` in this tree is out of date. `client/dist/buildbanner.min.js` measured 8,488 bytes gzipped (see **Target** under **Size Budget**).

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
- Lightweight `data-token` auth (Bearer header) **with client-side warnings and server-side checks**
- CSP compatibility documentation
- Security posture documentation
- **Singleton guard for multi-instance safety**
- **`BuildBanner.destroy()` with full cleanup (DOM, padding, timers, listeners)**
- **`BuildBanner.refresh()` for manual re-fetch**
- **Accessibility: role="status", aria-live, keyboard navigation, focus-visible**
- **Two-tier diagnostic logging (console.debug always, console.warn opt-in)**
- **CI size budget enforcement (~~<3KB gzipped~~)**. Corrected 2026-09-24: `client/dist/buildbanner.min.js` measured 8,488 bytes gzipped (see **Target** under **Size Budget**).
- **Configurable endpoint path with discoverability guidance**

### Out (v1.0)
- PR detection from branch names
- WebSocket push
- Full auth/RBAC on endpoint
- Framework wrappers (React/Vue) — `destroy()` lets an app integrate without them (see the examples above)
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
3. ~~**Auto-detect endpoint**~~: → **Yes.** Try `/buildbanner.json`, and give up silently on failure. Working with no configuration is the main feature.
4. ~~**Default poll**~~: → **0** (fetch once). Polling is opt-in for apps with live test/build status.
5. ~~**License**~~: → MIT

# Configuration Reference

BuildBanner supports configuration via HTML `data-*` attributes and the programmatic `init()` API. Programmatic options take precedence over data attributes.

## Configuration Precedence

```
BuildBanner.init({ ... })  >  data-* attributes  >  built-in defaults
```

## Data Attributes

All attributes are set on the `<script>` tag that loads BuildBanner:

```html
<script
  src="buildbanner.min.js"
  data-endpoint="/api/version"
  data-position="bottom"
  data-theme="auto"
  data-dismiss="permanent"
  data-env-hide="production,staging"
  data-height="32"
  data-debug="true"
  data-poll="30"
  data-push="false"
  data-token="my-secret-token"
  data-manual
></script>
```

### `data-endpoint`

- **Default:** `/buildbanner.json`
- **Type:** URL path or full URL
- **Description:** The JSON endpoint to fetch build information from. Relative paths are resolved against the page origin.

### `data-position`

- **Default:** `top`
- **Values:** `top`, `bottom`
- **Description:** Where the banner appears. `top` prepends to `<body>` as first child; `bottom` appends.

### `data-theme`

- **Default:** `dark`
- **Values:** `dark`, `light`, `auto`
- **Description:** Banner color theme. `auto` follows the user's `prefers-color-scheme` media query.

### `data-dismiss`

- **Default:** `session`
- **Values:** `session`, `permanent`, `none`
- **Description:** Controls the dismiss (x) button behavior.
  - `session` — dismissal stored in `sessionStorage`, resets on new session
  - `permanent` — dismissal stored in `localStorage`, persists across sessions
  - `none` — no dismiss button is rendered

### `data-env-hide`

- **Default:** _(none)_
- **Type:** Comma-separated string
- **Description:** Environments where the banner should not render. Compared against the `environment` field in the JSON response. The fetch still occurs (to learn the environment value), but rendering is suppressed.

```html
data-env-hide="production,staging"
```

### `data-height`

- **Default:** `28`
- **Type:** Integer (pixels)
- **Range:** 24 to 48
- **Description:** Banner height in pixels. Values outside the range are silently clamped to the nearest bound. Set `data-debug="true"` to surface diagnostic logs if you suspect misconfiguration.

### `data-debug`

- **Default:** `false`
- **Type:** Boolean
- **Description:** When `true`, diagnostic logs are promoted from `console.debug` to `console.warn`, making them visible in standard DevTools. Diagnostic logs are always available at `console.debug` level regardless of this setting.

### `data-poll`

- **Default:** `0`
- **Type:** Integer (seconds)
- **Description:** Polling interval for re-fetching the endpoint. `0` means fetch once on load. Enables live status updates for tests, build, uptime, and custom fields. Polling is visibility-aware and pauses when the tab is backgrounded.

### `data-push`

- **Default:** `true`
- **Type:** Boolean
- **Description:** When `true`, adds padding to `<html>` equal to banner height, pushing app content down. When `false`, the banner floats over content as a sticky overlay. If `<html>` already has non-zero padding, push mode automatically falls back to overlay.

### `data-token`

- **Default:** _(none)_
- **Type:** String
- **Description:** Shared secret sent as `Authorization: Bearer <token>` on every fetch. Intended for localhost/staging use only — **not a security boundary**. See [security.md](security.md) for details.

### `data-manual`

- **Default:** _(not set)_
- **Type:** Presence attribute (no value needed)
- **Description:** When present, disables auto-initialization. Use `BuildBanner.init()` to start the banner programmatically.

## Programmatic Options

All data attributes are available as `init()` options, plus additional programmatic-only options:

```js
BuildBanner.init({
  endpoint: '/api/version',
  position: 'top',
  theme: 'dark',
  dismiss: 'session',
  envHide: ['production', 'staging'],
  height: 28,
  debug: false,
  poll: 30,
  push: true,
  token: 'my-secret',
  manual: false,
  zIndex: 999999,
  hostPatterns: [
    { host: 'git.mycompany.com', kind: 'gitlab' }
  ]
});
```

### `zIndex`

- **Default:** `999999`
- **Programmatic only**
- **Description:** The CSS `z-index` of the banner element. Adjust if your app uses high z-index values.

### `hostPatterns`

- **Default:** `[]`
- **Programmatic only**
- **Description:** Array of custom host pattern objects for self-hosted Git instances. Each object has `host` (hostname string) and `kind` (`"github"`, `"gitlab"`, or `"bitbucket"`). Enables commit and branch link generation for self-hosted instances.

## Server-Side Environment Variables

Server helpers read these environment variables at startup. They take precedence over git detection:

| Variable | Description | Example |
|----------|-------------|---------|
| `BUILDBANNER_SHA` | Override git SHA | `a1b2c3d` |
| `BUILDBANNER_BRANCH` | Override git branch | `main` |
| `BUILDBANNER_REPO_URL` | Override repository URL | `https://github.com/user/repo` |
| `BUILDBANNER_COMMIT_DATE` | Override commit date | `2026-02-13T14:25:00Z` |
| `BUILDBANNER_APP_NAME` | Application name | `my-app` |
| `BUILDBANNER_ENVIRONMENT` | Deployment environment | `development` |
| `BUILDBANNER_DEPLOYED_AT` | Deployment timestamp | `2026-02-13T12:00:00Z` |
| `BUILDBANNER_PORT` | Server port number | `8001` |
| `BUILDBANNER_TOKEN` | Bearer token for auth | `my-secret-token-here` |
| `BUILDBANNER_CUSTOM_*` | Custom key-value fields | See below |

### Custom Environment Variables

Any `BUILDBANNER_CUSTOM_*` variable is included in the `custom` object. The suffix after `BUILDBANNER_CUSTOM_` is lowercased to form the key:

```bash
export BUILDBANNER_CUSTOM_REGION=us-east-1      # custom.region
export BUILDBANNER_CUSTOM_BUILD_ID=abc123        # custom.build_id
export BUILDBANNER_CUSTOM_CLUSTER_NAME=prod-01   # custom.cluster_name
```

# Configuration Reference

BuildBanner reads its configuration from HTML `data-*` attributes and from the options passed to `init()`. An `init()` option wins over the matching data attribute.

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
- **Description:** The JSON endpoint that the client fetches build information from. A relative path is resolved against the page origin.

### `data-position`

- **Default:** `top`
- **Values:** `top`, `bottom`
- **Description:** Where the banner appears. `top` inserts it as the first child of `<body>`; `bottom` appends it as the last child.

### `data-theme`

- **Default:** `dark`
- **Values:** `dark`, `light`, `auto`
- **Description:** The banner's color theme. `auto` follows the user's `prefers-color-scheme` media query.

### `data-dismiss`

- **Default:** `session`
- **Values:** `session`, `permanent`, `none`
- **Description:** Sets what the dismiss (x) button does.
  - `session` — the dismissal is stored in `sessionStorage` and is cleared in a new session
  - `permanent` — the dismissal is stored in `localStorage` and lasts across sessions
  - `none` — no dismiss button is rendered

### `data-env-hide`

- **Default:** _(none)_
- **Type:** Comma-separated string
- **Description:** The environments in which the banner does not render. The client compares each one with the `environment` field of the JSON response. The fetch still happens, because the client needs the environment value, but nothing renders.

```html
data-env-hide="production,staging"
```

### `data-height`

- **Default:** `28`
- **Type:** Integer (pixels)
- **Range:** 24 to 48
- **Description:** The banner height in pixels. A value outside the range is clamped to the nearest bound without a warning. To see the diagnostic logs when a setting seems wrong, set `data-debug="true"`.

### `data-debug`

- **Default:** `false`
- **Type:** Boolean
- **Description:** When `true`, the client writes its diagnostic logs with `console.warn` instead of `console.debug`, so DevTools shows them at its default log level. The logs are always written at the `console.debug` level, whatever this setting is.

### `data-poll`

- **Default:** `0`
- **Type:** Integer (seconds)
- **Description:** The interval between fetches of the endpoint. `0` means one fetch on load. Polling keeps the tests, build, uptime and custom fields current. It pauses while the tab is in the background.

### `data-push`

- **Default:** `true`
- **Type:** Boolean
- **Description:** When `true`, the client adds padding equal to the banner height to `<html>`, which moves the app content down. When `false`, the banner is a sticky overlay on top of the content. If `<html>` already has a non-zero padding, push mode falls back to the overlay.

### `data-token`

- **Default:** _(none)_
- **Type:** String
- **Description:** A shared secret that the client sends as `Authorization: Bearer <token>` with every fetch. It is meant only for localhost and staging, and it is **not a security boundary**. See [security.md](security.md).

### `data-manual`

- **Default:** _(not set)_
- **Type:** Presence attribute (no value needed)
- **Description:** When the attribute is present, the client does not initialize itself. Call `BuildBanner.init()` to start the banner.

## Programmatic Options

Every data attribute is also an `init()` option, and some options exist only in `init()`:

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
- **Description:** The CSS `z-index` of the banner element. Change it if your app uses higher z-index values.

### `hostPatterns`

- **Default:** `[]`
- **Programmatic only**
- **Description:** An array of host patterns for self-hosted Git servers. Each object has `host` (a hostname string) and `kind` (`"github"`, `"gitlab"`, or `"bitbucket"`). With a matching pattern, the banner links the commit and the branch on that server.

## Server-Side Environment Variables

Server helpers read these environment variables at startup. A variable that is set wins over the value detected from git:

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

Every `BUILDBANNER_CUSTOM_*` variable is added to the `custom` object. Its key is the suffix after `BUILDBANNER_CUSTOM_`, lowercased:

```bash
export BUILDBANNER_CUSTOM_REGION=us-east-1      # custom.region
export BUILDBANNER_CUSTOM_BUILD_ID=abc123        # custom.build_id
export BUILDBANNER_CUSTOM_CLUSTER_NAME=prod-01   # custom.cluster_name
```

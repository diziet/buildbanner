# Security

BuildBanner is a developer tool that exposes git metadata (SHA, branch, repo URL) through a JSON endpoint. This document covers what that exposes and the recommended controls.

## Token Auth Limitations

`data-token` is a simple shared secret. The client sends it in an `Authorization: Bearer <token>` header, and the server helpers check it.

**`data-token` only slows a visitor down. It is not a security boundary.**

It is meant only for:

- `localhost` development
- Internal network / VPN-only staging
- Environments where the HTML source is not publicly accessible

It is **not safe** in production or in any environment where users can view the page source:

- The token is visible in the HTML source (View Source, browser extensions, CSP reports)
- Any user who can load the page can read it
- Changing it means redeploying every client

### Client-Side Warnings

The client logs two warnings at initialization:

1. **Short token warning**: if `data-token` is shorter than 16 characters, the client logs a `console.warn`.
2. **Public hostname warning**: if the page is served over HTTPS on a non-local hostname, the client logs a `console.warn` that says token auth is meant only for staging and internal use.

## Network-Level Controls (Recommended)

In any environment other than localhost, restrict access to `/buildbanner.json` at the network level:

- **Reverse proxy auth** — require authentication at the proxy (nginx, Caddy, Traefik)
- **IP allowlisting** — allow the endpoint only from known IP ranges or VPN addresses
- **VPN-only access** — keep staging environments off the public internet

**Network-level controls are the recommended primary defense.** Token auth and `data-env-hide` are secondary layers.

## `data-env-hide`

Set `data-env-hide="production,staging"` so that the banner does not render when the server's `environment` field matches a listed value.

`data-env-hide` stops the rendering, not the network request. The client still fetches `/buildbanner.json` to read the environment value. If the endpoint itself must not be reachable, use network-level controls or remove the server middleware.

## Endpoint Renaming

The default endpoint, `/buildbanner.json`, is predictable on purpose, so the banner works with no configuration. In a shared or semi-public environment, rename the endpoint so that automated scanners are less likely to find it:

```html
<script src="buildbanner.min.js" data-endpoint="/_internal/build_9f3a2.json"></script>
```

Server helpers accept a `path` parameter:

```python
# Flask
app.register_blueprint(buildbanner_blueprint(path='/_internal/build_9f3a2.json'))
```

```js
// Express
app.use(buildBannerMiddleware({ path: '/_internal/build_9f3a2.json' }));
```

Renaming is not meant as security. It keeps automated scanners from flagging the endpoint, and it satisfies organizational policies that forbid well-known info endpoints.

## Same-Origin Policy

By default, the client fetches from the same origin. Server helpers set no CORS headers, so cross-origin requests fail silently. Other sites therefore cannot read your build metadata.

## Recommended Security Posture

| Layer | Control | Purpose |
|-------|---------|---------|
| 1 | Remove `<script>` tag in production | Zero client-side footprint |
| 2 | Network-level access control | Primary defense for staging |
| 3 | Endpoint renaming | Reduce scanner discoverability |
| 4 | `data-token` | Secondary "are you sure?" check |
| 5 | `data-env-hide` | Suppress rendering in specified environments |
| 6 | Same-origin fetch | Prevent cross-origin data leakage |

## What BuildBanner Does NOT Do

- Does not expose source code, only commit metadata
- Does not execute code that the server sends
- Does not use `innerHTML` — all content is set with `textContent` / `createElement` (XSS safe)
- Does not log or send data to third parties
- ~~Does not store any data beyond dismiss state (sessionStorage/localStorage)~~ Corrected 2026-09-24: since Task 50 (`cb0bcc2`, 2026-03-24), a client with `data-cache="true"` also stores the last banner response and theme for each endpoint in localStorage, under <!-- fact:cache-key -->`buildbanner_cache:<endpoint>`<!-- /fact -->, and ignores an entry older than <!-- fact:cache-max-age-hours -->24<!-- /fact --> hours (`client/src/cache.js`). `data-cache` is off by default. The dismiss state is stored as before, in sessionStorage or localStorage.

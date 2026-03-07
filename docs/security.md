# Security

BuildBanner is a developer tool that exposes git metadata (SHA, branch, repo URL) via a JSON endpoint. This document covers the security implications and recommended controls.

## Token Auth Limitations

`data-token` provides a lightweight shared-secret mechanism. The token is sent as an `Authorization: Bearer <token>` header and validated by server helpers.

**`data-token` is a speed bump, not a security boundary.**

It is intended exclusively for:

- `localhost` development
- Internal network / VPN-only staging
- Environments where the HTML source is not publicly accessible

It is **not safe** for production or any environment where page source is viewable:

- The token is visible in HTML source (View Source, browser extensions, CSP reports)
- Any user with page access can extract it
- It cannot be rotated without redeploying all clients

### Client-Side Warnings

The client enforces two warnings at initialization:

1. **Short token warning**: If `data-token` is shorter than 16 characters, a `console.warn` is logged.
2. **Public hostname warning**: If the page is served over HTTPS on a non-local hostname, a `console.warn` is logged indicating token auth is intended for staging/internal use only.

## Network-Level Controls (Recommended)

For any environment beyond localhost, restrict access to `/buildbanner.json` at the network level:

- **Reverse proxy auth** — require authentication at the proxy layer (nginx, Caddy, Traefik)
- **IP allowlisting** — restrict the endpoint to known IP ranges or VPN addresses
- **VPN-only access** — ensure staging environments are not publicly reachable

**Network-level controls are the recommended primary defense.** Token auth and `data-env-hide` are secondary layers.

## `data-env-hide`

Set `data-env-hide="production,staging"` to suppress banner rendering when the server's `environment` field matches a listed value.

**Important:** `data-env-hide` suppresses rendering, not the network request. The client still fetches `/buildbanner.json` to learn the environment value. If the endpoint itself should not be accessible, use network-level controls or remove the server middleware entirely.

## Endpoint Renaming

The default endpoint `/buildbanner.json` is intentionally predictable for zero-config setup. For shared or semi-public environments, rename the endpoint to reduce discoverability by automated scanners:

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

This is not security through obscurity — it is a practical measure to avoid triggering automated scanners and satisfying organizational policies that prohibit well-known info endpoints.

## Same-Origin Policy

By default, the client fetches from the same origin. Server helpers do not set CORS headers, so cross-origin requests fail silently. This prevents external sites from reading your build metadata.

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
- Does not execute any server-supplied code
- Does not use `innerHTML` — all content is set via `textContent` / `createElement` (XSS safe)
- Does not log or transmit data to third parties
- Does not store any data beyond dismiss state (sessionStorage/localStorage)

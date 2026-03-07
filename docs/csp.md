# Content Security Policy (CSP)

BuildBanner is designed to work under strict CSPs. This document provides header examples for common deployment scenarios.

## How BuildBanner Works with CSP

BuildBanner avoids all common CSP pitfalls:

- **No `eval()`** — never used
- **No `innerHTML`** — all DOM content via `textContent` and `createElement`
- **No inline styles** — all styling is class-based CSS
- **No inline scripts** — loads as an external script file

## Shadow DOM Path (Default)

When Shadow DOM is available (all modern browsers), BuildBanner encapsulates its styles inside the shadow root. **No additional CSP directives are required** beyond allowing the script source.

Shadow DOM styles are encapsulated and do not trigger `style-src` violations.

## Non-Shadow-DOM Fallback Path

In environments where `attachShadow` is unavailable, BuildBanner falls back to namespaced CSS classes. This fallback path injects a `<style>` tag into the document head with `.__buildbanner-` prefixed selectors.

This requires `style-src 'self'` (or equivalent) in your CSP if not already present.

## Self-Hosted Examples

When serving `buildbanner.min.js` from your own origin:

```
Content-Security-Policy: script-src 'self'; style-src 'self'; connect-src 'self';
```

Breakdown:

- `script-src 'self'` — allows loading the script from your origin
- `style-src 'self'` — allows the fallback `<style>` tag (not needed if Shadow DOM is used)
- `connect-src 'self'` — allows the `fetch()` call to `/buildbanner.json`

## CDN-Hosted Examples

When loading from unpkg or another CDN:

```
Content-Security-Policy: script-src 'self' https://unpkg.com; style-src 'self'; connect-src 'self';
```

Only the `script-src` directive needs the CDN domain. The JSON endpoint fetch is same-origin, so `connect-src 'self'` is sufficient.

## Cross-Origin Endpoint

If your JSON endpoint is on a different origin (not typical):

```
Content-Security-Policy: script-src 'self'; connect-src 'self' https://api.example.com;
```

## Strict CSP with Nonces

BuildBanner does not require nonces for its operation. However, if your CSP uses nonces for script loading:

```
Content-Security-Policy: script-src 'nonce-abc123';
```

```html
<script nonce="abc123" src="/static/buildbanner.min.js"></script>
```

The `<style>` tag injected by the non-Shadow-DOM fallback does not carry a nonce. If you use nonce-based `style-src` and cannot rely on Shadow DOM, add `'unsafe-inline'` to `style-src` or use a hash-based approach.

## Summary

| Scenario | CSP Changes Needed |
|----------|-------------------|
| Self-hosted + Shadow DOM | None (if `script-src 'self'` already set) |
| Self-hosted + fallback | `style-src 'self'` |
| CDN + Shadow DOM | `script-src https://unpkg.com` |
| CDN + fallback | `script-src https://unpkg.com; style-src 'self'` |

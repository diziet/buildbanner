# Content Security Policy (CSP)

BuildBanner is built to work under a strict Content Security Policy. This document gives header examples for common deployments.

## How BuildBanner Works with CSP

BuildBanner avoids the common causes of CSP violations:

- **No `eval()`** — never called
- **No `innerHTML`** — all DOM content is set with `textContent` and `createElement`
- **No inline styles** — all styles are class-based CSS
- **No inline scripts** — the client loads as an external script file

## Shadow DOM Path (Default)

When Shadow DOM is available, as it is in all modern browsers, BuildBanner puts its styles inside the shadow root. **No CSP directive is required** beyond the one that allows the script source.

Styles inside the shadow root do not trigger `style-src` violations.

## Non-Shadow-DOM Fallback Path

Where `attachShadow` is unavailable, BuildBanner falls back to namespaced CSS classes. The fallback adds a `<style>` tag to the document head, with selectors prefixed `.__buildbanner-`.

Your CSP then needs `style-src 'self'` or an equivalent, if it does not have one.

## Self-Hosted Examples

When serving `buildbanner.min.js` from your own origin:

```
Content-Security-Policy: script-src 'self'; style-src 'self'; connect-src 'self';
```

What each directive allows:

- `script-src 'self'` — loading the script from your origin
- `style-src 'self'` — the fallback `<style>` tag (not needed when Shadow DOM is used)
- `connect-src 'self'` — the `fetch()` call to `/buildbanner.json`

## Cross-Origin Endpoint

If your JSON endpoint is on another origin, which is unusual:

```
Content-Security-Policy: script-src 'self'; connect-src 'self' https://api.example.com;
```

## Strict CSP with Nonces

BuildBanner needs no nonce. If your CSP uses nonces for scripts, add one to the script tag:

```
Content-Security-Policy: script-src 'nonce-abc123';
```

```html
<script nonce="abc123" src="/static/buildbanner.min.js"></script>
```

The `<style>` tag that the fallback adds has no nonce. If your `style-src` uses nonces and you cannot rely on Shadow DOM, add `'unsafe-inline'` to `style-src` or allow the style by its hash.

## Summary

| Scenario | CSP Changes Needed |
|----------|-------------------|
| Self-hosted + Shadow DOM | None (if `script-src 'self'` already set) |
| Self-hosted + fallback | `style-src 'self'` |

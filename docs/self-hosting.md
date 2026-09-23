# Self-Hosting

Serve `buildbanner.min.js` from your own servers instead of a CDN. You then control its availability, its version and your CSP.

## Getting the File

### From npm (via GitHub)

```bash
npm install github:diziet/buildbanner
cp node_modules/buildbanner/dist/buildbanner.min.js /path/to/your/static/
```

### From the Release

Download `buildbanner.min.js` from the latest GitHub release and put it in your static assets directory.

## Serving

Put `buildbanner.min.js` in your static file directory and load it from your HTML:

```html
<script src="/static/buildbanner.min.js"></script>
```

### nginx

```nginx
location /static/buildbanner.min.js {
    root /var/www/html;
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

### Express

```js
app.use('/static', express.static('public'));
```

### Flask

Flask serves static files from the `static/` directory by default:

```html
<script src="{{ url_for('static', filename='buildbanner.min.js') }}"></script>
```

### Rails

Put the file in `public/` or use the asset pipeline:

```erb
<%= javascript_include_tag 'buildbanner.min' %>
```

## Versioning

Pin a specific version, so the banner changes only when you update it. To update:

1. Download the new version
2. Replace the file in your static directory
3. Clear CDN and proxy caches, if you use them
4. Check that the banner still renders

## CSP Configuration

A self-hosted script needs no external domain in the CSP:

```
Content-Security-Policy: script-src 'self'; connect-src 'self';
```

See [csp.md](csp.md) for more CSP examples.

## Size

~~The client script's target size is <3KB gzipped.~~ Corrected 2026-09-24: `client/scripts/size-budget.js` sets the budget to 8,500 bytes gzipped. It was 3,072 bytes until Task 11 (`302048d`, 2026-03-07) raised it, and later tasks raised it further. `client/dist/buildbanner.min.js` measured 8,488 bytes gzipped on 2026-09-24. The client has no runtime dependencies and uses only browser APIs.

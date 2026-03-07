# Self-Hosting

Serve `buildbanner.min.js` from your own infrastructure instead of a CDN for full control over availability, versioning, and CSP compliance.

## Getting the File

### From npm

```bash
npm install buildbanner
cp node_modules/buildbanner/dist/buildbanner.min.js /path/to/your/static/
```

### From the Release

Download `buildbanner.min.js` from the latest GitHub release and place it in your static assets directory.

## Serving

Place `buildbanner.min.js` in your static file directory and reference it in your HTML:

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

Place in `public/` or use the asset pipeline:

```erb
<%= javascript_include_tag 'buildbanner.min' %>
```

## Versioning

Pin to a specific version to avoid unexpected changes. When updating:

1. Download the new version
2. Replace the file in your static directory
3. Clear CDN/proxy caches if applicable
4. Verify the banner still renders correctly

## CSP Configuration

Self-hosting simplifies CSP — no external domains needed:

```
Content-Security-Policy: script-src 'self'; connect-src 'self';
```

See [csp.md](csp.md) for detailed CSP guidance.

## Size

The client script targets <3KB gzipped. It has zero runtime dependencies and uses only browser APIs.

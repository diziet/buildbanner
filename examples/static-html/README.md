# Static / nginx Example

This example serves a static `buildbanner.json` file with nginx. It needs no backend server.

## Files

- `index.html` — a sample page with the BuildBanner script tag
- `nginx.conf` — the nginx configuration that serves the static files
- `Dockerfile` — the container image, with nginx and the entrypoint
- `entrypoint.sh` — writes `buildbanner.json` from environment variables when the container starts

## Usage

```bash
docker build -t buildbanner-static .
docker run -p 8080:80 \
  -e BUILDBANNER_SHA=a1b2c3d \
  -e BUILDBANNER_BRANCH=main \
  buildbanner-static
```

Then open `http://localhost:8080` to see the banner.

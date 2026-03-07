# Static / nginx Example

Serves a static `buildbanner.json` file via nginx, with no backend server required.

## Files

- `index.html` — Sample page with BuildBanner script tag
- `nginx.conf` — nginx configuration serving static files
- `Dockerfile` — Container image with nginx and entrypoint
- `entrypoint.sh` — Generates `buildbanner.json` from environment variables at container startup

## Usage

```bash
docker build -t buildbanner-static .
docker run -p 8080:80 \
  -e BUILDBANNER_SHA=a1b2c3d \
  -e BUILDBANNER_BRANCH=main \
  buildbanner-static
```

Then open `http://localhost:8080` to see the banner.

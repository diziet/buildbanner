# BuildBanner — Python Server Helpers

Drop-in server helpers that serve a `/buildbanner.json` endpoint with git info, deploy metadata, and custom fields. Works with Flask, FastAPI, Django, and any WSGI app.

## Installation

```bash
pip install buildbanner
```

## Usage

### Flask

```python
from flask import Flask
from buildbanner import buildbanner_blueprint

app = Flask(__name__)
app.register_blueprint(buildbanner_blueprint)
```

The blueprint registers a `GET /buildbanner.json` route automatically.

### FastAPI

```python
from fastapi import FastAPI
from buildbanner import BuildBannerMiddleware

app = FastAPI()
app.add_middleware(BuildBannerMiddleware)
```

### Django

Add the middleware to your `MIDDLEWARE` list in `settings.py`:

```python
MIDDLEWARE = [
    # ...
    "buildbanner.django.BuildBannerMiddleware",
    # ...
]
```

Or import via the top-level package:

```python
from buildbanner import DjangoBuildBannerMiddleware
```

### WSGI

Wrap any WSGI application:

```python
from buildbanner import buildbanner_wsgi

app = buildbanner_wsgi(your_wsgi_app)
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BUILDBANNER_SHA` | Override git SHA |
| `BUILDBANNER_BRANCH` | Override git branch |
| `BUILDBANNER_REPO_URL` | Override repository URL |
| `BUILDBANNER_COMMIT_DATE` | Override commit date |
| `BUILDBANNER_APP_NAME` | Application name |
| `BUILDBANNER_ENVIRONMENT` | Deployment environment |
| `BUILDBANNER_DEPLOYED_AT` | Deployment timestamp |
| `BUILDBANNER_TOKEN` | Bearer token for auth |
| `BUILDBANNER_CUSTOM_*` | Custom fields (suffix lowercased) |

## License

MIT

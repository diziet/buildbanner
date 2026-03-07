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

See [shared/env-vars.md](../shared/env-vars.md) for the full list of supported environment variables.

## License

MIT

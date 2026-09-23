# BuildBanner — Python Server Helpers

Server helpers that serve a `/buildbanner.json` endpoint with the git information, deploy metadata and custom fields. They work with Flask, FastAPI, Django and any WSGI app.

## Installation

```bash
pip install git+https://github.com/diziet/buildbanner.git#subdirectory=python
```

## Usage

### Flask

```python
from flask import Flask
from buildbanner import buildbanner_blueprint

app = Flask(__name__)
app.register_blueprint(buildbanner_blueprint)
```

The blueprint registers a `GET /buildbanner.json` route.

Corrected 2026-09-24: `buildbanner_blueprint` is a function that returns the blueprint, so the call is `app.register_blueprint(buildbanner_blueprint())`, as in [docs/README.md](../docs/README.md). With Flask 3.1.3, the line above raises `AttributeError: 'function' object has no attribute 'register'`.

### FastAPI

```python
from fastapi import FastAPI
from buildbanner import BuildBannerMiddleware

app = FastAPI()
app.add_middleware(BuildBannerMiddleware)
```

### Django

Add the middleware to the `MIDDLEWARE` list in `settings.py`:

```python
MIDDLEWARE = [
    # ...
    "buildbanner.django.BuildBannerMiddleware",
    # ...
]
```

Or import it from the top-level package:

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

See [shared/env-vars.md](../shared/env-vars.md) for ~~the full list of~~ the supported environment variables. Corrected 2026-09-24: that table omits `BUILDBANNER_PORT`, which these helpers also read (`buildbanner/core.py`). [docs/configuration.md](../docs/configuration.md#server-side-environment-variables) lists every variable.

## License

MIT

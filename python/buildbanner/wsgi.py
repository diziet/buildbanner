"""BuildBanner WSGI wrapper — intercepts requests to serve build info."""

import json
import logging
from typing import Any, Callable, Dict, List, Optional, Tuple

from buildbanner.core import get_banner_data, resolve_token, validate_token

logger = logging.getLogger(__name__)

DEFAULT_PATH = '/buildbanner.json'


def buildbanner_wsgi(
    app: Callable,
    path: str = DEFAULT_PATH,
    extras: Optional[Callable[[], Dict[str, Any]]] = None,
    token: Optional[str] = None,
) -> Callable:
    """Wrap a WSGI app to serve BuildBanner JSON on a configured path."""
    configured_token = resolve_token(token)

    def wrapper(environ: Dict[str, Any], start_response: Callable) -> Any:
        """WSGI wrapper that intercepts GET on the banner path."""
        request_method = environ.get('REQUEST_METHOD', '')
        path_info = environ.get('PATH_INFO', '')

        if request_method == 'GET' and path_info == path:
            return _handle_banner(
                environ, start_response, configured_token, extras,
            )
        return app(environ, start_response)

    return wrapper


def _handle_banner(
    environ: Dict[str, Any],
    start_response: Callable,
    configured_token: Optional[str],
    extras: Optional[Callable[[], Dict[str, Any]]],
) -> List[bytes]:
    """Build and return the banner JSON response via WSGI."""
    auth_header = environ.get('HTTP_AUTHORIZATION')
    if not validate_token(auth_header, configured_token):
        body = json.dumps({'error': 'Unauthorized'}).encode('utf-8')
        start_response('401 Unauthorized', [
            ('Content-Type', 'application/json'),
            ('Content-Length', str(len(body))),
        ])
        return [body]

    data = get_banner_data(extras=extras)
    body = json.dumps(data).encode('utf-8')
    start_response('200 OK', [
        ('Content-Type', 'application/json'),
        ('Cache-Control', 'no-store'),
        ('Content-Length', str(len(body))),
    ])
    return [body]

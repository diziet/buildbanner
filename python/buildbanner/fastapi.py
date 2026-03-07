"""BuildBanner FastAPI/Starlette adapter — ASGI middleware serving build info."""

import json
import logging
import os
from typing import Any, Callable, Dict, Optional

from buildbanner.core import get_banner_data, validate_token

logger = logging.getLogger(__name__)

SCOPE_TYPE_HTTP = 'http'
METHOD_GET = 'GET'
DEFAULT_PATH = '/buildbanner.json'


async def _send_json_response(
    send: Callable, body: Dict[str, Any], status: int,
) -> None:
    """Send a JSON HTTP response via ASGI send callable."""
    payload = json.dumps(body).encode('utf-8')
    headers = [
        [b'content-type', b'application/json'],
        [b'cache-control', b'no-store'],
    ]
    await send({
        'type': 'http.response.start',
        'status': status,
        'headers': headers,
    })
    await send({
        'type': 'http.response.body',
        'body': payload,
    })


class BuildBannerMiddleware:
    """ASGI middleware that serves BuildBanner JSON on a configured path."""

    def __init__(
        self,
        app: Callable,
        path: str = DEFAULT_PATH,
        extras: Optional[Callable[[], Dict[str, Any]]] = None,
        token: Optional[str] = None,
    ) -> None:
        """Initialize middleware with ASGI app and options."""
        self.app = app
        self.path = path
        self.extras = extras
        self.token = token if token is not None else os.environ.get(
            'BUILDBANNER_TOKEN',
        )

    async def __call__(
        self, scope: Dict[str, Any], receive: Callable, send: Callable,
    ) -> None:
        """Handle ASGI request — intercept matching path or pass through."""
        if not self._is_banner_request(scope):
            await self.app(scope, receive, send)
            return

        auth_header = self._get_authorization_header(scope)
        if not validate_token(auth_header, self.token):
            await _send_json_response(
                send, {'error': 'Unauthorized'}, status=401,
            )
            return

        data = get_banner_data(extras=self.extras)
        await _send_json_response(send, data, status=200)

    def _is_banner_request(self, scope: Dict[str, Any]) -> bool:
        """Check if scope matches a GET request on the configured path."""
        if scope.get('type') != SCOPE_TYPE_HTTP:
            return False
        if scope.get('method') != METHOD_GET:
            return False
        return scope.get('path') == self.path

    def _get_authorization_header(
        self, scope: Dict[str, Any],
    ) -> Optional[str]:
        """Extract Authorization header value from ASGI scope."""
        headers = scope.get('headers', [])
        for name, value in headers:
            if name == b'authorization':
                return value.decode('utf-8')
        return None

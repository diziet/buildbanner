"""BuildBanner Django adapter — middleware serving build info as JSON."""

import json
import logging
from typing import Any, Callable, Dict, Optional

from buildbanner.core import get_banner_data, resolve_token, validate_token

logger = logging.getLogger(__name__)

DEFAULT_PATH = '/buildbanner.json'


class BuildBannerMiddleware:
    """Django middleware that serves BuildBanner JSON on a configured path."""

    def __init__(
        self,
        get_response: Callable,
        path: str = DEFAULT_PATH,
        extras: Optional[Callable[[], Dict[str, Any]]] = None,
        token: Optional[str] = None,
    ) -> None:
        """Initialize middleware with Django's get_response and options."""
        self.get_response = get_response
        self.path = path
        self.extras = extras
        self.token = resolve_token(token)

    def __call__(self, request: Any) -> Any:
        """Handle request — intercept matching path or pass through."""
        if request.method == 'GET' and request.path == self.path:
            return self._handle_banner_request(request)
        return self.get_response(request)

    def _handle_banner_request(self, request: Any) -> Any:
        """Build and return the banner JSON response."""
        from django.http import JsonResponse

        auth_header = request.META.get('HTTP_AUTHORIZATION')
        if not validate_token(auth_header, self.token):
            return JsonResponse(
                {'error': 'Unauthorized'},
                status=401,
            )

        data = get_banner_data(extras=self.extras)
        response = JsonResponse(data, status=200)
        response['Cache-Control'] = 'no-store'
        return response

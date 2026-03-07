"""BuildBanner Django adapter — middleware serving build info as JSON."""

from typing import Any, Callable, Dict, Optional

from buildbanner.core import (
    DEFAULT_PATH, get_banner_data, resolve_token, validate_token,
)


def _get_setting(name: str, default: Any = None) -> Any:
    """Read a Django setting, returning default if not configured."""
    try:
        from django.conf import settings
        return getattr(settings, name, default)
    except ImportError:
        return default


class BuildBannerMiddleware:
    """Django middleware that serves BuildBanner JSON on a configured path."""

    def __init__(self, get_response: Callable) -> None:
        """Initialize middleware with Django's get_response callable."""
        self.get_response = get_response
        self.path = _get_setting('BUILDBANNER_PATH', DEFAULT_PATH)
        self.extras = _get_setting('BUILDBANNER_EXTRAS')
        self.token = resolve_token(
            _get_setting('BUILDBANNER_TOKEN'),
        )

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
            response = JsonResponse(
                {'error': 'Unauthorized'},
                status=401,
            )
            response['Cache-Control'] = 'no-store'
            return response

        data = get_banner_data(extras=self.extras)
        response = JsonResponse(data, status=200)
        response['Cache-Control'] = 'no-store'
        return response

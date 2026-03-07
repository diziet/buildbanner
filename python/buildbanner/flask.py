"""BuildBanner Flask adapter — Blueprint serving build info as JSON."""

import json
import logging
from typing import Any, Callable, Dict, Optional

from flask import Blueprint, Response, request

from buildbanner.core import get_banner_data, validate_token

logger = logging.getLogger(__name__)


def buildbanner_blueprint(
    path: str = '/buildbanner.json',
    extras: Optional[Callable[[], Dict[str, Any]]] = None,
    token: Optional[str] = None,
) -> Blueprint:
    """Create a Flask Blueprint that serves BuildBanner JSON."""
    import os

    configured_token = token if token is not None else os.environ.get(
        'BUILDBANNER_TOKEN',
    )

    bp = Blueprint('buildbanner', __name__)

    @bp.route(path, methods=['GET'])
    def buildbanner_endpoint() -> Response:
        """Serve BuildBanner JSON data."""
        if not validate_token(request.headers.get('Authorization'),
                              configured_token):
            return Response(
                json.dumps({'error': 'Unauthorized'}),
                status=401,
                content_type='application/json',
            )

        data = get_banner_data(extras=extras)
        return Response(
            json.dumps(data),
            status=200,
            content_type='application/json',
            headers={'Cache-Control': 'no-store'},
        )

    return bp

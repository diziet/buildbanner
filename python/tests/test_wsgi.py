"""WSGI wrapper tests for buildbanner.wsgi module."""

import json
import logging
from io import BytesIO
from typing import Any, Dict, List, Optional, Tuple
from unittest.mock import patch

from tests.conftest import (
    VALID_TEST_TOKEN, header_to_meta_key,
    make_git_side_effect, reload_adapter,
)


def _reload_wsgi(**env_overrides):
    """Reload core and wsgi modules, return buildbanner_wsgi function."""
    return reload_adapter(
        'buildbanner.wsgi', 'buildbanner_wsgi', **env_overrides,
    )


def _dummy_wsgi_app(environ: Dict, start_response: Any) -> List[bytes]:
    """Dummy WSGI app that returns 200 OK."""
    body = b'ok'
    start_response('200 OK', [
        ('Content-Type', 'text/plain'),
        ('Content-Length', str(len(body))),
    ])
    return [body]


def _make_environ(
    path: str = '/buildbanner.json',
    method: str = 'GET',
    headers: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """Create a minimal WSGI environ dict."""
    environ: Dict[str, Any] = {
        'REQUEST_METHOD': method,
        'PATH_INFO': path,
        'SERVER_NAME': 'localhost',
        'SERVER_PORT': '80',
        'wsgi.input': BytesIO(),
        'wsgi.errors': BytesIO(),
    }
    if headers:
        for key, value in headers.items():
            environ[header_to_meta_key(key)] = value
    return environ


class _ResponseCapture:
    """Capture WSGI start_response calls."""

    def __init__(self) -> None:
        """Initialize capture state."""
        self.status: Optional[str] = None
        self.headers: List[Tuple[str, str]] = []

    def __call__(
        self, status: str, headers: List[Tuple[str, str]],
    ) -> None:
        """Record status and headers."""
        self.status = status
        self.headers = headers

    def get_header(self, name: str) -> Optional[str]:
        """Get a response header by name (case-insensitive)."""
        lower_name = name.lower()
        for header_name, header_value in self.headers:
            if header_name.lower() == lower_name:
                return header_value
        return None


class TestHappyPath:
    """Happy-path WSGI tests."""

    def test_returns_200_with_json(self):
        """GET /buildbanner.json returns 200 with JSON body."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            factory = _reload_wsgi()
            app = factory(_dummy_wsgi_app)

        capture = _ResponseCapture()
        body_parts = app(_make_environ(), capture)
        body = b''.join(body_parts)

        assert capture.status == '200 OK'
        data = json.loads(body)
        assert '_buildbanner' in data
        assert data['_buildbanner']['version'] == 1

    def test_sha_and_sha_full_present(self):
        """Response includes both sha (7-char) and sha_full (40-char)."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            factory = _reload_wsgi()
            app = factory(_dummy_wsgi_app)

        capture = _ResponseCapture()
        body_parts = app(_make_environ(), capture)
        data = json.loads(b''.join(body_parts))

        assert data['sha'] == 'a1b2c3d'
        assert len(data['sha_full']) == 40


class TestHeaders:
    """Response header tests."""

    def test_content_type_json(self):
        """Response Content-Type is application/json."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            factory = _reload_wsgi()
            app = factory(_dummy_wsgi_app)

        capture = _ResponseCapture()
        app(_make_environ(), capture)

        assert capture.get_header('Content-Type') == 'application/json'

    def test_cache_control_no_store(self):
        """Response includes Cache-Control: no-store."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            factory = _reload_wsgi()
            app = factory(_dummy_wsgi_app)

        capture = _ResponseCapture()
        app(_make_environ(), capture)

        assert capture.get_header('Cache-Control') == 'no-store'

    def test_content_length_present(self):
        """Response includes Content-Length header."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            factory = _reload_wsgi()
            app = factory(_dummy_wsgi_app)

        capture = _ResponseCapture()
        body_parts = app(_make_environ(), capture)
        body = b''.join(body_parts)

        assert capture.get_header('Content-Length') == str(len(body))


class TestInterception:
    """Path interception and pass-through tests."""

    def test_intercepts_default_path(self):
        """Middleware intercepts GET on default /buildbanner.json."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            factory = _reload_wsgi()
            app = factory(_dummy_wsgi_app)

        capture = _ResponseCapture()
        body_parts = app(_make_environ(), capture)
        data = json.loads(b''.join(body_parts))

        assert capture.status == '200 OK'
        assert '_buildbanner' in data

    def test_non_matching_path_passes_through(self):
        """Requests to other paths pass through to wrapped app."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            factory = _reload_wsgi()
            app = factory(_dummy_wsgi_app)

        capture = _ResponseCapture()
        body_parts = app(_make_environ('/health'), capture)
        body = b''.join(body_parts)

        assert capture.status == '200 OK'
        assert body == b'ok'

    def test_post_to_banner_path_passes_through(self):
        """POST to the banner path passes through (only GET intercepted)."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            factory = _reload_wsgi()
            app = factory(_dummy_wsgi_app)

        capture = _ResponseCapture()
        body_parts = app(
            _make_environ('/buildbanner.json', method='POST'), capture,
        )
        body = b''.join(body_parts)

        assert body == b'ok'

    def test_custom_path_works(self):
        """Custom path serves the endpoint correctly."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            factory = _reload_wsgi()
            app = factory(_dummy_wsgi_app, path='/custom/info.json')

        capture = _ResponseCapture()
        body_parts = app(_make_environ('/custom/info.json'), capture)
        data = json.loads(b''.join(body_parts))

        assert capture.status == '200 OK'
        assert '_buildbanner' in data


class TestTokenAuth:
    """Token authentication tests."""

    def test_valid_token_returns_200(self):
        """Valid Bearer token returns 200."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            factory = _reload_wsgi()
            app = factory(_dummy_wsgi_app, token=VALID_TEST_TOKEN)

        capture = _ResponseCapture()
        environ = _make_environ(
            headers={'Authorization': f'Bearer {VALID_TEST_TOKEN}'},
        )
        app(environ, capture)

        assert capture.status == '200 OK'

    def test_invalid_token_returns_401(self):
        """Invalid Bearer token returns 401."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            factory = _reload_wsgi()
            app = factory(_dummy_wsgi_app, token=VALID_TEST_TOKEN)

        capture = _ResponseCapture()
        environ = _make_environ(
            headers={'Authorization': 'Bearer wrong-token-xxxxxxx'},
        )
        app(environ, capture)

        assert capture.status == '401 Unauthorized'

    def test_missing_token_returns_401(self):
        """Missing token header returns 401."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            factory = _reload_wsgi()
            app = factory(_dummy_wsgi_app, token=VALID_TEST_TOKEN)

        capture = _ResponseCapture()
        app(_make_environ(), capture)

        assert capture.status == '401 Unauthorized'

    def test_short_token_disables_auth(self, caplog):
        """Short token (<16 chars) disables auth with warning."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            factory = _reload_wsgi()
            app = factory(_dummy_wsgi_app, token='short')

        capture = _ResponseCapture()
        with caplog.at_level(logging.WARNING):
            app(_make_environ(), capture)

        assert capture.status == '200 OK'
        assert any('shorter than 16' in r.message for r in caplog.records)

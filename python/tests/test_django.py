"""Django integration tests for buildbanner.django module."""

import json
import logging
from unittest.mock import patch

import django
from django.conf import settings
from django.http import HttpRequest, HttpResponse
from django.test import RequestFactory

from tests.conftest import (
    VALID_TEST_TOKEN, make_git_side_effect, reload_adapter,
)

# Configure Django settings before any Django imports that need it
if not settings.configured:
    settings.configure(
        DEBUG=True,
        SECRET_KEY='test-secret-key-for-buildbanner',
        ROOT_URLCONF=[],
    )
    django.setup()


def _reload_django(**env_overrides):
    """Reload core and django modules, return BuildBannerMiddleware class."""
    return reload_adapter(
        'buildbanner.django', 'BuildBannerMiddleware', **env_overrides,
    )


def _dummy_get_response(request: HttpRequest) -> HttpResponse:
    """Dummy get_response that returns a simple 200 OK."""
    return HttpResponse('ok', content_type='text/plain')


def _make_request(
    path: str = '/buildbanner.json',
    method: str = 'GET',
    headers: dict = None,
) -> HttpRequest:
    """Create a Django HttpRequest using RequestFactory."""
    factory = RequestFactory()
    if method == 'GET':
        request = factory.get(path)
    elif method == 'POST':
        request = factory.post(path)
    else:
        request = factory.get(path)

    if headers:
        for key, value in headers.items():
            meta_key = f'HTTP_{key.upper().replace("-", "_")}'
            request.META[meta_key] = value

    return request


class TestHappyPath:
    """Happy-path Django tests."""

    def test_returns_200_with_json(self):
        """GET /buildbanner.json returns 200 with JSON body."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            cls = _reload_django()
            middleware = cls(_dummy_get_response)

        request = _make_request()
        resp = middleware(request)

        assert resp.status_code == 200
        data = json.loads(resp.content)
        assert '_buildbanner' in data
        assert data['_buildbanner']['version'] == 1

    def test_cache_control_no_store(self):
        """Response includes Cache-Control: no-store."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            cls = _reload_django()
            middleware = cls(_dummy_get_response)

        request = _make_request()
        resp = middleware(request)

        assert resp['Cache-Control'] == 'no-store'

    def test_content_type_json(self):
        """Response Content-Type is application/json."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            cls = _reload_django()
            middleware = cls(_dummy_get_response)

        request = _make_request()
        resp = middleware(request)

        assert 'application/json' in resp['Content-Type']

    def test_sha_and_sha_full_present(self):
        """Response includes both sha (7-char) and sha_full (40-char)."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            cls = _reload_django()
            middleware = cls(_dummy_get_response)

        request = _make_request()
        resp = middleware(request)
        data = json.loads(resp.content)

        assert data['sha'] == 'a1b2c3d'
        assert len(data['sha_full']) == 40


class TestPathInterception:
    """Path interception tests."""

    def test_intercepts_configured_path(self):
        """Middleware intercepts GET on the configured path."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            cls = _reload_django()
            middleware = cls(_dummy_get_response)

        request = _make_request('/buildbanner.json')
        resp = middleware(request)

        assert resp.status_code == 200
        data = json.loads(resp.content)
        assert '_buildbanner' in data

    def test_custom_path_works(self):
        """Custom path serves the endpoint correctly."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            cls = _reload_django()
            middleware = cls(_dummy_get_response, path='/custom/info.json')

        request = _make_request('/custom/info.json')
        resp = middleware(request)

        assert resp.status_code == 200
        data = json.loads(resp.content)
        assert '_buildbanner' in data


class TestPassThrough:
    """Non-matching requests pass through to underlying app."""

    def test_non_matching_path_passes_through(self):
        """Requests to other paths pass through to get_response."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            cls = _reload_django()
            middleware = cls(_dummy_get_response)

        request = _make_request('/health')
        resp = middleware(request)

        assert resp.status_code == 200
        assert resp.content == b'ok'

    def test_post_to_banner_path_passes_through(self):
        """POST to the banner path passes through (only GET intercepted)."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            cls = _reload_django()
            middleware = cls(_dummy_get_response)

        request = _make_request('/buildbanner.json', method='POST')
        resp = middleware(request)

        assert resp.status_code == 200
        assert resp.content == b'ok'


class TestTokenAuth:
    """Token authentication tests."""

    def test_valid_token_returns_200(self):
        """Valid Bearer token returns 200."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            cls = _reload_django()
            middleware = cls(
                _dummy_get_response, token=VALID_TEST_TOKEN,
            )

        request = _make_request(
            headers={'Authorization': f'Bearer {VALID_TEST_TOKEN}'},
        )
        resp = middleware(request)

        assert resp.status_code == 200

    def test_invalid_token_returns_401(self):
        """Invalid Bearer token returns 401."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            cls = _reload_django()
            middleware = cls(
                _dummy_get_response, token=VALID_TEST_TOKEN,
            )

        request = _make_request(
            headers={'Authorization': 'Bearer wrong-token-xxxxxxx'},
        )
        resp = middleware(request)

        assert resp.status_code == 401

    def test_missing_token_returns_401(self):
        """Missing token header returns 401."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            cls = _reload_django()
            middleware = cls(
                _dummy_get_response, token=VALID_TEST_TOKEN,
            )

        request = _make_request()
        resp = middleware(request)

        assert resp.status_code == 401

    def test_short_token_disables_auth(self, caplog):
        """Short token (<16 chars) disables auth with warning."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            cls = _reload_django()
            middleware = cls(
                _dummy_get_response, token='short',
            )

        request = _make_request()
        with caplog.at_level(logging.WARNING):
            resp = middleware(request)

        assert resp.status_code == 200
        assert any('shorter than 16' in r.message for r in caplog.records)

"""FastAPI/Starlette integration tests for buildbanner.fastapi module."""

import json
import logging
from unittest.mock import patch

import pytest
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import PlainTextResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from tests.conftest import VALID_TEST_TOKEN, make_git_side_effect, reload_modules


def _reload_fastapi(**env_overrides):
    """Reload core and fastapi modules, return BuildBannerMiddleware class."""
    mods = reload_modules(
        'buildbanner.core', 'buildbanner.fastapi', **env_overrides,
    )
    return mods['buildbanner.fastapi'].BuildBannerMiddleware


def _health(request: Request) -> PlainTextResponse:
    """Simple health endpoint for testing pass-through."""
    return PlainTextResponse('ok')


def _create_app(middleware_cls, **kwargs):
    """Create a Starlette app with BuildBannerMiddleware."""
    app = Starlette(routes=[Route('/health', _health)])
    return middleware_cls(app, **kwargs)


class TestHappyPath:
    """Happy-path FastAPI/Starlette tests."""

    def test_returns_200_with_json(self):
        """GET /buildbanner.json returns 200 with JSON body."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            cls = _reload_fastapi()
            app = _create_app(cls)

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get('/buildbanner.json')

        assert resp.status_code == 200
        data = resp.json()
        assert '_buildbanner' in data
        assert data['_buildbanner']['version'] == 1

    def test_cache_control_no_store(self):
        """Response includes Cache-Control: no-store."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            cls = _reload_fastapi()
            app = _create_app(cls)

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get('/buildbanner.json')

        assert resp.headers.get('cache-control') == 'no-store'

    def test_content_type_json(self):
        """Response Content-Type is application/json."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            cls = _reload_fastapi()
            app = _create_app(cls)

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get('/buildbanner.json')

        assert 'application/json' in resp.headers.get('content-type', '')

    def test_sha_and_sha_full_present(self):
        """Response includes both sha (7-char) and sha_full (40-char)."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            cls = _reload_fastapi()
            app = _create_app(cls)

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get('/buildbanner.json')
        data = resp.json()

        assert data['sha'] == 'a1b2c3d'
        assert len(data['sha_full']) == 40


class TestExtras:
    """Extras callback tests."""

    def test_extras_with_tests_build_custom(self):
        """Extras callback merges tests, build, and custom fields."""
        def extras_fn():
            return {
                'tests': {'status': 'pass', 'count': 42},
                'build': {'tool': 'webpack'},
                'custom': {'model': 'gpt-4'},
            }

        with patch('subprocess.run', side_effect=make_git_side_effect()):
            cls = _reload_fastapi()
            app = _create_app(cls, extras=extras_fn)

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get('/buildbanner.json')
        data = resp.json()

        assert data['tests'] == {'status': 'pass', 'count': 42}
        assert data['build'] == {'tool': 'webpack'}
        assert data['custom']['model'] == 'gpt-4'

    def test_extras_failure_omits_extras(self):
        """Extras callback that raises is caught; response still valid."""
        def bad_extras():
            raise RuntimeError('extras boom')

        with patch('subprocess.run', side_effect=make_git_side_effect()):
            cls = _reload_fastapi()
            app = _create_app(cls, extras=bad_extras)

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get('/buildbanner.json')
        data = resp.json()

        assert resp.status_code == 200
        assert data['_buildbanner']['version'] == 1
        assert 'tests' not in data


class TestTokenAuth:
    """Token authentication tests."""

    def test_valid_token_returns_200(self):
        """Valid Bearer token returns 200."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            cls = _reload_fastapi()
            app = _create_app(cls, token=VALID_TEST_TOKEN)

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get(
            '/buildbanner.json',
            headers={'Authorization': f'Bearer {VALID_TEST_TOKEN}'},
        )

        assert resp.status_code == 200

    def test_invalid_token_returns_401(self):
        """Invalid Bearer token returns 401."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            cls = _reload_fastapi()
            app = _create_app(cls, token=VALID_TEST_TOKEN)

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get(
            '/buildbanner.json',
            headers={'Authorization': 'Bearer wrong-token-xxxxxxx'},
        )

        assert resp.status_code == 401

    def test_missing_token_returns_401(self):
        """Missing token header returns 401."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            cls = _reload_fastapi()
            app = _create_app(cls, token=VALID_TEST_TOKEN)

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get('/buildbanner.json')

        assert resp.status_code == 401


class TestCustomEnvVars:
    """BUILDBANNER_CUSTOM_* env var tests."""

    def test_custom_env_vars_appear_in_response(self):
        """BUILDBANNER_CUSTOM_MODEL env var appears as custom.model."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            cls = _reload_fastapi(BUILDBANNER_CUSTOM_MODEL='gpt-4o')
            app = _create_app(cls)

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get('/buildbanner.json')
        data = resp.json()

        assert data['custom']['model'] == 'gpt-4o'


class TestPassThrough:
    """Non-matching requests pass through to underlying app."""

    def test_non_matching_path_passes_through(self):
        """Requests to other paths reach the underlying app."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            cls = _reload_fastapi()
            app = _create_app(cls)

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get('/health')

        assert resp.status_code == 200
        assert resp.text == 'ok'

    def test_post_to_banner_path_passes_through(self):
        """POST to the banner path passes through (only GET intercepted)."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            cls = _reload_fastapi()
            app = _create_app(cls)

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post('/buildbanner.json')

        # POST passes through to underlying app which has no POST route
        assert resp.status_code in (404, 405)


class TestDetachedHead:
    """Detached HEAD fixture tests."""

    def test_detached_head_with_tag(self):
        """Detached HEAD falls back to tag name."""
        with patch('subprocess.run', side_effect=make_git_side_effect(
            branch_output='HEAD', tag_output='v1.0.0',
        )):
            cls = _reload_fastapi()
            app = _create_app(cls)

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get('/buildbanner.json')
        data = resp.json()

        assert data['branch'] == 'v1.0.0'

    def test_detached_head_without_tag(self):
        """Detached HEAD without tag omits branch field."""
        with patch('subprocess.run', side_effect=make_git_side_effect(
            branch_output='HEAD', tag_output=None,
        )):
            cls = _reload_fastapi()
            app = _create_app(cls)

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get('/buildbanner.json')
        data = resp.json()

        assert 'branch' not in data

"""Flask integration tests for buildbanner.flask module."""

import json
import logging
import os
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask


def _make_git_side_effect(
    log_output='a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 a1b2c3d 2026-01-15T10:30:00+00:00',
    branch_output='main',
    remote_output='https://github.com/org/repo.git',
):
    """Create a side_effect for subprocess.run that mocks git commands."""
    def side_effect(cmd, **kwargs):
        command = ' '.join(cmd) if isinstance(cmd, list) else cmd
        mock_result = MagicMock()

        if 'git log' in command:
            mock_result.returncode = 0
            mock_result.stdout = log_output
        elif 'git describe' in command:
            mock_result.returncode = 128
            mock_result.stdout = ''
        elif 'git rev-parse' in command:
            mock_result.returncode = 0
            mock_result.stdout = branch_output
        elif 'git remote' in command:
            mock_result.returncode = 0
            mock_result.stdout = remote_output
        else:
            mock_result.returncode = 128
            mock_result.stdout = ''

        return mock_result

    return side_effect


def _reload_core_and_flask(**env_overrides):
    """Reload core and flask modules with fresh state."""
    import importlib
    import sys

    for mod_name in list(sys.modules):
        if mod_name.startswith('buildbanner'):
            del sys.modules[mod_name]

    clean_env = {
        k: v for k, v in os.environ.items()
        if not k.startswith('BUILDBANNER_')
    }
    clean_env.update(env_overrides)

    with patch.dict(os.environ, clean_env, clear=True):
        from buildbanner.flask import buildbanner_blueprint
        return buildbanner_blueprint


def _create_app(blueprint_factory, **kwargs):
    """Create a Flask app with the buildbanner blueprint."""
    app = Flask(__name__)
    bp = blueprint_factory(**kwargs)
    app.register_blueprint(bp)

    @app.route('/health')
    def health():
        return 'ok'

    return app


class TestHappyPath:
    """Happy-path Flask tests."""

    def test_returns_200_with_json(self):
        """GET /buildbanner.json returns 200 with JSON body."""
        with patch('subprocess.run', side_effect=_make_git_side_effect()):
            factory = _reload_core_and_flask()
            app = _create_app(factory)

        with app.test_client() as client:
            resp = client.get('/buildbanner.json')

        assert resp.status_code == 200
        data = json.loads(resp.data)
        assert '_buildbanner' in data
        assert data['_buildbanner']['version'] == 1

    def test_cache_control_no_store(self):
        """Response includes Cache-Control: no-store."""
        with patch('subprocess.run', side_effect=_make_git_side_effect()):
            factory = _reload_core_and_flask()
            app = _create_app(factory)

        with app.test_client() as client:
            resp = client.get('/buildbanner.json')

        assert resp.headers.get('Cache-Control') == 'no-store'

    def test_content_type_json(self):
        """Response Content-Type is application/json."""
        with patch('subprocess.run', side_effect=_make_git_side_effect()):
            factory = _reload_core_and_flask()
            app = _create_app(factory)

        with app.test_client() as client:
            resp = client.get('/buildbanner.json')

        assert 'application/json' in resp.content_type


class TestCustomPath:
    """Custom path tests."""

    def test_custom_path_works(self):
        """Custom path serves the endpoint correctly."""
        with patch('subprocess.run', side_effect=_make_git_side_effect()):
            factory = _reload_core_and_flask()
            app = _create_app(factory, path='/custom/info.json')

        with app.test_client() as client:
            resp = client.get('/custom/info.json')

        assert resp.status_code == 200
        data = json.loads(resp.data)
        assert '_buildbanner' in data


class TestTokenAuth:
    """Token authentication tests."""

    def test_valid_token_returns_200(self):
        """Valid Bearer token returns 200."""
        token = 'a-secure-token-that-is-long-enough'
        with patch('subprocess.run', side_effect=_make_git_side_effect()):
            factory = _reload_core_and_flask()
            app = _create_app(factory, token=token)

        with app.test_client() as client:
            resp = client.get(
                '/buildbanner.json',
                headers={'Authorization': f'Bearer {token}'},
            )

        assert resp.status_code == 200

    def test_invalid_token_returns_401(self):
        """Invalid Bearer token returns 401."""
        token = 'a-secure-token-that-is-long-enough'
        with patch('subprocess.run', side_effect=_make_git_side_effect()):
            factory = _reload_core_and_flask()
            app = _create_app(factory, token=token)

        with app.test_client() as client:
            resp = client.get(
                '/buildbanner.json',
                headers={'Authorization': 'Bearer wrong-token-xxxxxxx'},
            )

        assert resp.status_code == 401

    def test_missing_token_returns_401(self):
        """Missing token header returns 401."""
        token = 'a-secure-token-that-is-long-enough'
        with patch('subprocess.run', side_effect=_make_git_side_effect()):
            factory = _reload_core_and_flask()
            app = _create_app(factory, token=token)

        with app.test_client() as client:
            resp = client.get('/buildbanner.json')

        assert resp.status_code == 401

    def test_short_token_disables_auth(self, caplog):
        """Short token (<16 chars) disables auth with warning."""
        with patch('subprocess.run', side_effect=_make_git_side_effect()):
            factory = _reload_core_and_flask()
            app = _create_app(factory, token='short')

        with app.test_client() as client:
            with caplog.at_level(logging.WARNING):
                resp = client.get('/buildbanner.json')

        assert resp.status_code == 200
        assert any('shorter than 16' in r.message for r in caplog.records)


class TestOtherRoutes:
    """Tests that middleware doesn't break other routes."""

    def test_other_routes_still_work(self):
        """Other routes on the app are unaffected by the blueprint."""
        with patch('subprocess.run', side_effect=_make_git_side_effect()):
            factory = _reload_core_and_flask()
            app = _create_app(factory)

        with app.test_client() as client:
            resp = client.get('/health')

        assert resp.status_code == 200
        assert resp.data == b'ok'

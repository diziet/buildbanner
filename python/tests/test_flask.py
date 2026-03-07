"""Flask integration tests for buildbanner.flask module."""

import json
import logging
from unittest.mock import patch

import pytest
from flask import Flask

from tests.conftest import (
    VALID_TEST_TOKEN, make_git_side_effect, reload_adapter,
)


def _reload_flask(**env_overrides):
    """Reload core and flask modules, return buildbanner_blueprint factory."""
    return reload_adapter(
        'buildbanner.flask', 'buildbanner_blueprint', **env_overrides,
    )


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
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            factory = _reload_flask()
            app = _create_app(factory)

        with app.test_client() as client:
            resp = client.get('/buildbanner.json')

        assert resp.status_code == 200
        data = json.loads(resp.data)
        assert '_buildbanner' in data
        assert data['_buildbanner']['version'] == 1

    def test_cache_control_no_store(self):
        """Response includes Cache-Control: no-store."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            factory = _reload_flask()
            app = _create_app(factory)

        with app.test_client() as client:
            resp = client.get('/buildbanner.json')

        assert resp.headers.get('Cache-Control') == 'no-store'

    def test_content_type_json(self):
        """Response Content-Type is application/json."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            factory = _reload_flask()
            app = _create_app(factory)

        with app.test_client() as client:
            resp = client.get('/buildbanner.json')

        assert 'application/json' in resp.content_type


class TestCustomPath:
    """Custom path tests."""

    def test_custom_path_works(self):
        """Custom path serves the endpoint correctly."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            factory = _reload_flask()
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
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            factory = _reload_flask()
            app = _create_app(factory, token=VALID_TEST_TOKEN)

        with app.test_client() as client:
            resp = client.get(
                '/buildbanner.json',
                headers={'Authorization': f'Bearer {VALID_TEST_TOKEN}'},
            )

        assert resp.status_code == 200

    def test_invalid_token_returns_401(self):
        """Invalid Bearer token returns 401."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            factory = _reload_flask()
            app = _create_app(factory, token=VALID_TEST_TOKEN)

        with app.test_client() as client:
            resp = client.get(
                '/buildbanner.json',
                headers={'Authorization': 'Bearer wrong-token-xxxxxxx'},
            )

        assert resp.status_code == 401

    def test_missing_token_returns_401(self):
        """Missing token header returns 401."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            factory = _reload_flask()
            app = _create_app(factory, token=VALID_TEST_TOKEN)

        with app.test_client() as client:
            resp = client.get('/buildbanner.json')

        assert resp.status_code == 401

    def test_short_token_disables_auth(self, caplog):
        """Short token (<16 chars) disables auth with warning."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            factory = _reload_flask()
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
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            factory = _reload_flask()
            app = _create_app(factory)

        with app.test_client() as client:
            resp = client.get('/health')

        assert resp.status_code == 200
        assert resp.data == b'ok'

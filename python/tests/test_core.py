"""Unit tests for buildbanner.core module."""

import json
import logging
import os
from unittest.mock import patch

import pytest

from tests.conftest import VALID_TEST_TOKEN, make_git_side_effect, reload_modules

# Fixtures path
FIXTURES_PATH = os.path.join(
    os.path.dirname(__file__), '..', '..', 'shared', 'test_fixtures.json',
)


def _load_fixtures():
    """Load shared test fixtures."""
    with open(FIXTURES_PATH) as f:
        return json.load(f)


FIXTURES = _load_fixtures()


def _reload_core(**env_overrides):
    """Reload core module with fresh state."""
    return reload_modules('buildbanner.core', **env_overrides)


class TestGetBannerDataHappyPath:
    """Happy-path tests for get_banner_data."""

    def test_returns_dict_with_required_fields(self):
        """Happy path: returns dict with sha, sha_full, branch, etc."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            core = _reload_core()

        data = core.get_banner_data()
        assert isinstance(data, dict)
        assert 'sha' in data
        assert 'sha_full' in data
        assert 'branch' in data
        assert 'server_started' in data

    def test_buildbanner_version_is_1(self):
        """_buildbanner.version == 1."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            core = _reload_core()

        data = core.get_banner_data()
        assert data['_buildbanner'] == {'version': 1}

    def test_sha_is_7_chars(self):
        """sha is 7 characters (short SHA)."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            core = _reload_core()

        data = core.get_banner_data()
        assert len(data['sha']) == 7

    def test_sha_full_is_40_chars(self):
        """sha_full is 40 characters (full SHA)."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            core = _reload_core()

        data = core.get_banner_data()
        assert len(data['sha_full']) == 40

    def test_server_started_is_iso_string(self):
        """server_started is a valid ISO 8601 string."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            core = _reload_core()

        data = core.get_banner_data()
        assert 'T' in data['server_started']


class TestEnvVarOverrides:
    """Tests for environment variable overrides."""

    def test_env_vars_override_git(self):
        """Env vars override git-derived values."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            core = _reload_core(
                BUILDBANNER_SHA='fedcba1234567890fedcba1234567890fedcba12',
                BUILDBANNER_BRANCH='deploy/prod',
            )

        data = core.get_banner_data()
        assert data['sha'] == 'fedcba1'
        assert data['branch'] == 'deploy/prod'

    def test_app_name_from_env(self):
        """BUILDBANNER_APP_NAME maps to app_name."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            core = _reload_core(BUILDBANNER_APP_NAME='my-app')

        data = core.get_banner_data()
        assert data['app_name'] == 'my-app'

    def test_port_is_int(self):
        """BUILDBANNER_PORT is converted to int."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            core = _reload_core(BUILDBANNER_PORT='8080')

        data = core.get_banner_data()
        assert data['port'] == 8080
        assert isinstance(data['port'], int)

    def test_custom_model_from_env(self):
        """BUILDBANNER_CUSTOM_MODEL maps to custom.model."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            core = _reload_core(BUILDBANNER_CUSTOM_MODEL='gpt-4')

        data = core.get_banner_data()
        assert data['custom']['model'] == 'gpt-4'

    def test_short_sha_override_keeps_git_sha_full(self):
        """SHA override shorter than 40 chars sets sha but keeps git sha_full."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            core = _reload_core(BUILDBANNER_SHA='abcdef1234')

        data = core.get_banner_data()
        assert data['sha'] == 'abcdef1'
        # sha_full retains the git-derived 40-char value
        assert len(data['sha_full']) == 40


class TestUrlSanitization:
    """URL sanitization tests using shared fixtures."""

    @pytest.mark.parametrize(
        'fixture',
        FIXTURES['url_sanitization'],
        ids=[f.get('input', 'null') for f in FIXTURES['url_sanitization']],
    )
    def test_sanitize_repo_url(self, fixture):
        """URL sanitization matches expected output from fixtures."""
        from buildbanner.core import sanitize_repo_url

        result = sanitize_repo_url(fixture['input'])
        assert result == fixture['expected']

    def test_malformed_url_with_no_hostname_returns_none(self):
        """URL with no hostname returns None."""
        from buildbanner.core import sanitize_repo_url

        assert sanitize_repo_url('https:///path') is None


class TestDetachedHead:
    """Detached HEAD tests."""

    def test_detached_head_with_tag(self):
        """Detached HEAD with a tag uses the tag as branch."""
        with patch('subprocess.run', side_effect=make_git_side_effect(
            branch_output='HEAD',
            tag_output='v1.2.3',
        )):
            core = _reload_core()

        data = core.get_banner_data()
        assert data['branch'] == 'v1.2.3'

    def test_detached_head_without_tag(self):
        """Detached HEAD without tag results in no branch."""
        with patch('subprocess.run', side_effect=make_git_side_effect(
            branch_output='HEAD',
            tag_output=None,
        )):
            core = _reload_core()

        data = core.get_banner_data()
        assert 'branch' not in data or data.get('branch') is None


class TestExtras:
    """Tests for extras callback."""

    def test_extras_merge(self):
        """Extras values merge into response."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            core = _reload_core()

        def my_extras():
            return {'custom': {'region': 'us-east-1'}}

        data = core.get_banner_data(extras=my_extras)
        assert data['custom']['region'] == 'us-east-1'

    def test_extras_custom_wins_over_env(self):
        """Extras custom values win over env var custom values."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            core = _reload_core(BUILDBANNER_CUSTOM_REGION='eu-west-1')

        def my_extras():
            return {'custom': {'region': 'us-east-1'}}

        data = core.get_banner_data(extras=my_extras)
        assert data['custom']['region'] == 'us-east-1'

    def test_extras_raises_omits_extras(self):
        """If extras raises, extras are omitted but response is still valid."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            core = _reload_core()

        def bad_extras():
            raise RuntimeError('boom')

        data = core.get_banner_data(extras=bad_extras)
        assert '_buildbanner' in data
        assert data['_buildbanner']['version'] == 1


class TestCustomFieldEdgeCases:
    """Edge cases for custom fields."""

    def test_custom_int_stringified(self):
        """Custom int values are stringified."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            core = _reload_core()

        def my_extras():
            return {'custom': {'workers': 4}}

        data = core.get_banner_data(extras=my_extras)
        assert data['custom']['workers'] == '4'

    def test_custom_none_omitted(self):
        """Custom None values are omitted."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            core = _reload_core()

        def my_extras():
            return {'custom': {'key': None, 'valid': 'yes'}}

        data = core.get_banner_data(extras=my_extras)
        assert 'key' not in data.get('custom', {})
        assert data['custom']['valid'] == 'yes'


class TestNoGitNoEnv:
    """Tests for missing git and environment."""

    def test_no_git_no_env_returns_null_fields(self):
        """No git, no env -> null/missing fields but still valid response."""
        with patch('subprocess.run', side_effect=make_git_side_effect(
            log_output=None,
            branch_output=None,
            remote_output=None,
        )):
            core = _reload_core()

        data = core.get_banner_data()
        assert data['_buildbanner'] == {'version': 1}
        assert 'server_started' in data
        # null fields should be omitted
        assert data.get('sha') is None or 'sha' not in data
        assert data.get('branch') is None or 'branch' not in data


class TestProductionTokenWarning:
    """Production environment token warning tests."""

    def test_production_env_with_token_logs_info(self, caplog):
        """Production env with token logs an info message."""
        with caplog.at_level(logging.INFO):
            with patch('subprocess.run',
                       side_effect=make_git_side_effect()):
                _reload_core(
                    BUILDBANNER_ENVIRONMENT='production',
                    BUILDBANNER_TOKEN=VALID_TEST_TOKEN,
                )

        assert any(
            'production' in record.message.lower()
            for record in caplog.records
        )


class TestServerStartedCached:
    """Tests for server_started caching."""

    def test_calling_twice_returns_same_server_started(self):
        """Calling get_banner_data() twice returns same server_started."""
        with patch('subprocess.run', side_effect=make_git_side_effect()):
            core = _reload_core()

        data1 = core.get_banner_data()
        data2 = core.get_banner_data()
        assert data1['server_started'] == data2['server_started']


class TestValidateToken:
    """Tests for validate_token function."""

    def test_no_token_configured_returns_true(self):
        """No configured token means auth is disabled."""
        from buildbanner.core import validate_token
        assert validate_token(None, None) is True

    def test_valid_token_returns_true(self):
        """Valid Bearer token returns True."""
        from buildbanner.core import validate_token
        assert validate_token(
            f'Bearer {VALID_TEST_TOKEN}', VALID_TEST_TOKEN,
        ) is True

    def test_invalid_token_returns_false(self):
        """Invalid Bearer token returns False."""
        from buildbanner.core import validate_token
        assert validate_token(
            'Bearer wrong-token-value-xx', VALID_TEST_TOKEN,
        ) is False

    def test_short_token_disables_auth(self, caplog):
        """Short token (<16 chars) disables auth with warning."""
        from buildbanner.core import validate_token
        with caplog.at_level(logging.WARNING):
            result = validate_token(None, 'short')
        assert result is True
        assert any('shorter than 16' in r.message for r in caplog.records)

    def test_missing_bearer_prefix_returns_false(self):
        """Missing Bearer prefix returns False."""
        from buildbanner.core import validate_token
        assert validate_token(
            'Token something', VALID_TEST_TOKEN,
        ) is False

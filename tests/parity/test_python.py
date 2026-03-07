"""Parity tests — verify Python server helper matches shared fixtures exactly."""

import json
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

FIXTURES_PATH = Path(__file__).parent.parent.parent / 'shared' / 'test_fixtures.json'
FIXTURES = json.loads(FIXTURES_PATH.read_text())
DEFAULTS = FIXTURES['defaults']

# Python's git log format is "%H %cd" — 2 space-separated tokens.
GIT_LOG_OUTPUT = f"{DEFAULTS['sha_full']} {DEFAULTS['commit_date']}"

TYPE_MAP = {
    'string': str,
    'integer': int,
    'object': dict,
}

# Add python/ to sys.path so buildbanner is importable
PYTHON_ROOT = Path(__file__).parent.parent.parent / 'python'
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))


def _make_git_side_effect(
    log_output=GIT_LOG_OUTPUT,
    branch_output=None,
    tag_output=None,
    remote_output=None,
):
    """Create a side_effect for subprocess.run that mocks git commands."""
    if branch_output is None:
        branch_output = DEFAULTS['branch']
    if remote_output is None:
        remote_output = DEFAULTS['remote_url']

    def side_effect(cmd, **kwargs):
        command = ' '.join(cmd) if isinstance(cmd, list) else cmd
        mock_result = MagicMock()

        if 'git log' in command:
            if log_output is None:
                mock_result.returncode = 128
                mock_result.stdout = ''
            else:
                mock_result.returncode = 0
                mock_result.stdout = log_output
        elif 'git describe' in command:
            if tag_output is None:
                mock_result.returncode = 128
                mock_result.stdout = ''
            else:
                mock_result.returncode = 0
                mock_result.stdout = tag_output
        elif 'git rev-parse' in command:
            if branch_output is None:
                mock_result.returncode = 128
                mock_result.stdout = ''
            else:
                mock_result.returncode = 0
                mock_result.stdout = branch_output
        elif 'git remote' in command:
            if remote_output is None:
                mock_result.returncode = 128
                mock_result.stdout = ''
            else:
                mock_result.returncode = 0
                mock_result.stdout = remote_output
        else:
            mock_result.returncode = 128
            mock_result.stdout = ''

        return mock_result

    return side_effect


def _load_core(git_kwargs=None, **env_overrides):
    """Reload buildbanner.core with mocked git and clean env, returning (core, patch_ctx).

    Returns a context manager that keeps subprocess.run and os.environ patched.
    Usage:
        with _load_core(BUILDBANNER_APP_NAME='x') as core:
            data = core.get_banner_data()
    """
    import contextlib

    @contextlib.contextmanager
    def _ctx():
        for mod_name in list(sys.modules):
            if mod_name.startswith('buildbanner'):
                del sys.modules[mod_name]

        clean_env = {
            k: v for k, v in os.environ.items()
            if not k.startswith('BUILDBANNER_')
        }
        clean_env.update(env_overrides)

        side_effect = _make_git_side_effect(**(git_kwargs or {}))
        with patch.dict(os.environ, clean_env, clear=True), \
             patch('subprocess.run', side_effect=side_effect):
            from buildbanner import core
            yield core

    return _ctx()


class TestUrlSanitization:
    """URL sanitization must match shared fixtures exactly."""

    @pytest.mark.parametrize(
        'fixture',
        FIXTURES['url_sanitization'],
        ids=[str(f.get('input', 'null')) for f in FIXTURES['url_sanitization']],
    )
    def test_sanitize_url(self, fixture):
        """Each URL sanitization fixture produces identical output."""
        from buildbanner.core import sanitize_repo_url

        result = sanitize_repo_url(fixture['input'])
        assert result == fixture['expected']


class TestBranchDetection:
    """Branch detection must match shared fixtures exactly."""

    @pytest.mark.parametrize(
        'fixture',
        FIXTURES['branch_detection'],
        ids=[
            f"input={f['input']}_tag={f['tag']}"
            for f in FIXTURES['branch_detection']
        ],
    )
    def test_branch_detection(self, fixture):
        """Each branch detection fixture produces identical output."""
        with _load_core(git_kwargs={
            'branch_output': fixture['input'],
            'tag_output': fixture['tag'],
        }) as core:
            data = core.get_banner_data()

        actual = data.get('branch')
        assert actual == fixture['expected']


class TestBuildbannerVersion:
    """_buildbanner.version must be 1."""

    def test_version_is_1(self):
        """_buildbanner.version is always 1."""
        with _load_core() as core:
            data = core.get_banner_data()

        assert data['_buildbanner'] == {'version': 1}


class TestShaFields:
    """Both sha (7 chars) and sha_full (40 chars) must be emitted."""

    def test_sha_and_sha_full_emitted(self):
        """sha is 7 chars, sha_full is 40 chars, sha == sha_full[:7]."""
        with _load_core() as core:
            data = core.get_banner_data()

        assert len(data['sha']) == 7
        assert len(data['sha_full']) == 40
        assert data['sha'] == data['sha_full'][:7]


class TestCustomStringification:
    """Custom field stringification must be consistent."""

    def test_integer_is_stringified(self):
        """Integer custom values become strings."""
        with _load_core() as core:
            data = core.get_banner_data(
                extras=lambda: {'custom': {'count': 42}},
            )

        assert data['custom']['count'] == '42'
        assert isinstance(data['custom']['count'], str)

    def test_null_is_omitted(self):
        """None/null custom values are omitted."""
        with _load_core() as core:
            data = core.get_banner_data(
                extras=lambda: {'custom': {'keep': 'yes', 'drop': None}},
            )

        assert data['custom']['keep'] == 'yes'
        assert 'drop' not in data['custom']


class TestCustomEnvVars:
    """BUILDBANNER_CUSTOM_* env vars must produce identical custom maps."""

    def test_lowercased_suffix_maps_to_custom(self):
        """Suffix is lowercased and mapped to custom object."""
        with _load_core(
            BUILDBANNER_CUSTOM_MODEL='gpt-4',
            BUILDBANNER_CUSTOM_REGION='us-east-1',
            BUILDBANNER_CUSTOM_WORKERS='4',
        ) as core:
            data = core.get_banner_data()

        assert data['custom'] == {
            'model': 'gpt-4',
            'region': 'us-east-1',
            'workers': '4',
        }

    def test_uppercase_suffix_is_lowercased(self):
        """BUILDBANNER_CUSTOM_MY_KEY becomes custom.my_key."""
        with _load_core(BUILDBANNER_CUSTOM_MY_KEY='value') as core:
            data = core.get_banner_data()

        assert 'my_key' in data['custom']
        assert data['custom']['my_key'] == 'value'


class TestJsonStructure:
    """JSON structure and field names must match across languages."""

    def test_full_response_field_names(self):
        """Full response has all expected top-level field names."""
        with _load_core(
            BUILDBANNER_APP_NAME='my-app',
            BUILDBANNER_ENVIRONMENT='development',
            BUILDBANNER_PORT='8001',
            BUILDBANNER_DEPLOYED_AT='2026-02-13T12:00:00Z',
            BUILDBANNER_CUSTOM_MODEL='gpt-4',
        ) as core:
            data = core.get_banner_data()

        for key in FIXTURES['expected_top_level_keys']:
            assert key in data, f'Missing key: {key}'

        # Verify types from shared field_types spec
        for field, json_type in FIXTURES['field_types'].items():
            if field in data:
                assert isinstance(data[field], TYPE_MAP[json_type]), \
                    f'{field} should be {json_type}'
        assert data['_buildbanner']['version'] == 1

    def test_null_fields_omitted(self):
        """Null top-level fields are absent, not present with None."""
        with _load_core(git_kwargs={
            'log_output': None,
            'branch_output': None,
            'remote_output': None,
        }) as core:
            data = core.get_banner_data()

        assert data['_buildbanner'] == {'version': 1}
        assert 'server_started' in data

        for key in ('sha', 'branch', 'repo_url'):
            if key in data:
                assert data[key] is not None

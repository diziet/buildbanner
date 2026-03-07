"""Parity tests — verify Python server helper matches shared fixtures exactly."""

import json
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

FIXTURES_PATH = Path(__file__).parent.parent.parent / 'shared' / 'test_fixtures.json'
FIXTURES = json.loads(FIXTURES_PATH.read_text())

# Add python/ to sys.path so buildbanner is importable
PYTHON_ROOT = Path(__file__).parent.parent.parent / 'python'
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))


def _make_git_side_effect(
    log_output='a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 2026-02-13T14:25:00+00:00',
    branch_output='main',
    tag_output=None,
    remote_output='https://github.com/org/repo.git',
):
    """Create a side_effect for subprocess.run that mocks git commands."""
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


def _reload_core(**env_overrides):
    """Reload buildbanner.core with fresh state and clean env."""
    for mod_name in list(sys.modules):
        if mod_name.startswith('buildbanner'):
            del sys.modules[mod_name]

    clean_env = {
        k: v for k, v in os.environ.items()
        if not k.startswith('BUILDBANNER_')
    }
    clean_env.update(env_overrides)

    with patch.dict(os.environ, clean_env, clear=True):
        from buildbanner import core
        return core


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
        with patch(
            'subprocess.run',
            side_effect=_make_git_side_effect(
                branch_output=fixture['input'],
                tag_output=fixture['tag'],
            ),
        ):
            core = _reload_core()

        data = core.get_banner_data()
        actual = data.get('branch')
        assert actual == fixture['expected']


class TestBuildbannerVersion:
    """_buildbanner.version must be 1."""

    def test_version_is_1(self):
        """_buildbanner.version is always 1."""
        with patch(
            'subprocess.run',
            side_effect=_make_git_side_effect(),
        ):
            core = _reload_core()

        data = core.get_banner_data()
        assert data['_buildbanner'] == {'version': 1}


class TestShaFields:
    """Both sha (7 chars) and sha_full (40 chars) must be emitted."""

    def test_sha_and_sha_full_emitted(self):
        """sha is 7 chars, sha_full is 40 chars, sha == sha_full[:7]."""
        with patch(
            'subprocess.run',
            side_effect=_make_git_side_effect(),
        ):
            core = _reload_core()

        data = core.get_banner_data()
        assert len(data['sha']) == 7
        assert len(data['sha_full']) == 40
        assert data['sha'] == data['sha_full'][:7]


class TestCustomStringification:
    """Custom field stringification must be consistent."""

    def test_integer_is_stringified(self):
        """Integer custom values become strings."""
        with patch(
            'subprocess.run',
            side_effect=_make_git_side_effect(),
        ):
            core = _reload_core()

        data = core.get_banner_data(
            extras=lambda: {'custom': {'count': 42}},
        )
        assert data['custom']['count'] == '42'
        assert isinstance(data['custom']['count'], str)

    def test_null_is_omitted(self):
        """None/null custom values are omitted."""
        with patch(
            'subprocess.run',
            side_effect=_make_git_side_effect(),
        ):
            core = _reload_core()

        data = core.get_banner_data(
            extras=lambda: {'custom': {'keep': 'yes', 'drop': None}},
        )
        assert data['custom']['keep'] == 'yes'
        assert 'drop' not in data['custom']


class TestCustomEnvVars:
    """BUILDBANNER_CUSTOM_* env vars must produce identical custom maps."""

    def test_lowercased_suffix_maps_to_custom(self):
        """Suffix is lowercased and mapped to custom object."""
        with patch(
            'subprocess.run',
            side_effect=_make_git_side_effect(),
        ):
            core = _reload_core(
                BUILDBANNER_CUSTOM_MODEL='gpt-4',
                BUILDBANNER_CUSTOM_REGION='us-east-1',
                BUILDBANNER_CUSTOM_WORKERS='4',
            )

        data = core.get_banner_data()
        assert data['custom'] == {
            'model': 'gpt-4',
            'region': 'us-east-1',
            'workers': '4',
        }

    def test_uppercase_suffix_is_lowercased(self):
        """BUILDBANNER_CUSTOM_MY_KEY becomes custom.my_key."""
        with patch(
            'subprocess.run',
            side_effect=_make_git_side_effect(),
        ):
            core = _reload_core(BUILDBANNER_CUSTOM_MY_KEY='value')

        data = core.get_banner_data()
        assert 'my_key' in data['custom']
        assert data['custom']['my_key'] == 'value'


class TestJsonStructure:
    """JSON structure and field names must match across languages."""

    def test_full_response_field_names(self):
        """Full response has all expected top-level field names."""
        with patch(
            'subprocess.run',
            side_effect=_make_git_side_effect(),
        ):
            core = _reload_core(
                BUILDBANNER_APP_NAME='my-app',
                BUILDBANNER_ENVIRONMENT='development',
                BUILDBANNER_PORT='8001',
                BUILDBANNER_DEPLOYED_AT='2026-02-13T12:00:00Z',
                BUILDBANNER_CUSTOM_MODEL='gpt-4',
            )

        data = core.get_banner_data()

        expected_keys = [
            '_buildbanner', 'sha', 'sha_full', 'branch',
            'commit_date', 'repo_url', 'server_started',
            'deployed_at', 'app_name', 'environment', 'port', 'custom',
        ]
        for key in expected_keys:
            assert key in data, f'Missing key: {key}'

        assert isinstance(data['sha'], str)
        assert isinstance(data['sha_full'], str)
        assert isinstance(data['branch'], str)
        assert isinstance(data['server_started'], str)
        assert isinstance(data['port'], int)
        assert isinstance(data['custom'], dict)
        assert data['_buildbanner']['version'] == 1

    def test_null_fields_omitted(self):
        """Null top-level fields are absent, not present with None."""
        with patch(
            'subprocess.run',
            side_effect=_make_git_side_effect(
                log_output=None,
                branch_output=None,
                remote_output=None,
            ),
        ):
            core = _reload_core()

        data = core.get_banner_data()
        assert data['_buildbanner'] == {'version': 1}
        assert 'server_started' in data

        for key in ('sha', 'branch', 'repo_url'):
            if key in data:
                assert data[key] is not None

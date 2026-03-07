"""Shared test helpers and fixtures for buildbanner tests."""

import os
import sys
from unittest.mock import MagicMock, patch

DEFAULT_LOG_OUTPUT = (
    'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'
    ' 2026-01-15T10:30:00+00:00'
)
VALID_TEST_TOKEN = 'a-secure-token-that-is-long-enough'


def make_git_side_effect(
    log_output=DEFAULT_LOG_OUTPUT,
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


def reload_modules(*module_names, **env_overrides):
    """Reload buildbanner modules with fresh state and clean env."""
    for mod_name in list(sys.modules):
        if mod_name.startswith('buildbanner'):
            del sys.modules[mod_name]

    clean_env = {
        k: v for k, v in os.environ.items()
        if not k.startswith('BUILDBANNER_')
    }
    clean_env.update(env_overrides)

    with patch.dict(os.environ, clean_env, clear=True):
        imported = {}
        for name in module_names:
            mod = __import__(name)
            # Handle dotted names
            for part in name.split('.')[1:]:
                mod = getattr(mod, part)
            imported[name] = mod
        return imported if len(imported) > 1 else imported[module_names[0]]

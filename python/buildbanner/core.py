"""BuildBanner core — git info extraction and JSON response builder."""

import hmac
import logging
import os
import re
import shlex
import subprocess
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import urlparse, urlunparse

logger = logging.getLogger(__name__)

SHORT_SHA_LEN = 7
MIN_SHA_FULL_LEN = 40
MIN_TOKEN_LEN = 16


def _run_git(command: List[str]) -> Optional[str]:
    """Run a git command, return trimmed stdout or None on failure."""
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode != 0:
            return None
        return result.stdout.strip()
    except (subprocess.SubprocessError, OSError):
        return None


def _read_git_info() -> Dict[str, Optional[str]]:
    """Read git info by spawning git subprocesses."""
    sha_full = None
    sha = None
    commit_date = None

    log_line = _run_git([
        'git', 'log', '-1', '--format=%H %cd', '--date=iso-strict',
    ])
    if log_line:
        parts = log_line.split(' ', 1)
        sha_full = parts[0] if parts else None
        sha = sha_full[:SHORT_SHA_LEN] if sha_full else None
        commit_date = parts[1] if len(parts) > 1 else None

    branch = _run_git(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])
    if branch == 'HEAD':
        tag = _run_git(['git', 'describe', '--tags', '--exact-match'])
        branch = tag

    repo_url = _run_git(['git', 'remote', 'get-url', 'origin'])

    return {
        'sha': sha,
        'sha_full': sha_full,
        'branch': branch,
        'commit_date': commit_date,
        'repo_url': repo_url,
    }


def sanitize_repo_url(raw_url: Optional[str]) -> Optional[str]:
    """Sanitize a repo URL — strip userinfo, .git suffix, convert SSH."""
    if not raw_url:
        return None

    url = raw_url

    # Convert SSH shorthand (git@host:org/repo.git) to HTTPS
    ssh_match = re.match(r'^[\w.-]+@([\w.-]+):(.*)', url)
    if ssh_match:
        url = f'https://{ssh_match.group(1)}/{ssh_match.group(2)}'

    # Convert ssh:// protocol to https://
    if url.startswith('ssh://'):
        url = url.replace('ssh://', 'https://', 1)

    try:
        parsed = urlparse(url)
        if not parsed.hostname:
            return None
        # Strip userinfo
        clean = urlunparse((
            parsed.scheme,
            parsed.hostname + (f':{parsed.port}' if parsed.port else ''),
            parsed.path,
            parsed.params,
            parsed.query,
            parsed.fragment,
        ))
    except (ValueError, AttributeError, TypeError):
        return None

    # Remove .git suffix and trailing slashes
    clean = re.sub(r'\.git$', '', clean)
    clean = clean.rstrip('/')

    return clean


def _read_custom_env() -> Optional[Dict[str, str]]:
    """Read custom fields from BUILDBANNER_CUSTOM_* env vars."""
    prefix = 'BUILDBANNER_CUSTOM_'
    custom: Dict[str, str] = {}

    for key, value in os.environ.items():
        if key.startswith(prefix) and len(key) > len(prefix):
            suffix = key[len(prefix):].lower()
            if value is not None:
                custom[suffix] = str(value)

    return custom if custom else None


def _apply_env_overrides(
    git_info: Dict[str, Optional[str]],
) -> Dict[str, Optional[str]]:
    """Apply env var overrides to git-derived values."""
    info = dict(git_info)

    env_sha = os.environ.get('BUILDBANNER_SHA')
    if env_sha:
        info['sha'] = env_sha[:SHORT_SHA_LEN]
        if len(env_sha) >= MIN_SHA_FULL_LEN:
            info['sha_full'] = env_sha

    if os.environ.get('BUILDBANNER_BRANCH'):
        info['branch'] = os.environ['BUILDBANNER_BRANCH']

    if os.environ.get('BUILDBANNER_REPO_URL'):
        info['repo_url'] = os.environ['BUILDBANNER_REPO_URL']

    if os.environ.get('BUILDBANNER_COMMIT_DATE'):
        info['commit_date'] = os.environ['BUILDBANNER_COMMIT_DATE']

    return info


def _read_env_config() -> Dict[str, Any]:
    """Snapshot env-based config values at module load time."""
    port_str = os.environ.get('BUILDBANNER_PORT')
    port = None
    if port_str:
        try:
            port = int(port_str)
        except ValueError:
            port = None

    return {
        'deployed_at': os.environ.get('BUILDBANNER_DEPLOYED_AT'),
        'app_name': os.environ.get('BUILDBANNER_APP_NAME'),
        'environment': os.environ.get('BUILDBANNER_ENVIRONMENT'),
        'port': port,
    }


# Module-level cached state — computed once at import time
_git_info = _read_git_info()
_static_info = _apply_env_overrides(_git_info)
_custom_env = _read_custom_env()
_env_config = _read_env_config()
_server_started = datetime.now(timezone.utc).isoformat()


def validate_token(
    request_header: Optional[str], configured_token: Optional[str],
) -> bool:
    """Validate a Bearer token from request header against configured token."""
    if not configured_token:
        return True

    if len(configured_token) < MIN_TOKEN_LEN:
        logger.warning(
            'BuildBanner: token is shorter than 16 characters, '
            'auth check disabled',
        )
        return True

    if not request_header or not request_header.startswith('Bearer '):
        return False

    provided = request_header[len('Bearer '):]
    return hmac.compare_digest(provided, configured_token)


def get_banner_data(
    extras: Optional[Callable[[], Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Build the banner data dict. Never raises."""
    try:
        return _build_banner_data(extras)
    except Exception as err:
        logger.error(f'BuildBanner: get_banner_data failed: {err}')
        return {'_buildbanner': {'version': 1}}


def _build_banner_data(
    extras: Optional[Callable[[], Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Internal builder for banner data."""
    data: Dict[str, Any] = {
        '_buildbanner': {'version': 1},
        'sha': _static_info.get('sha'),
        'sha_full': _static_info.get('sha_full'),
        'branch': _static_info.get('branch'),
        'commit_date': _static_info.get('commit_date'),
        'repo_url': sanitize_repo_url(_static_info.get('repo_url')),
        'server_started': _server_started,
        'deployed_at': _env_config.get('deployed_at'),
        'app_name': _env_config.get('app_name'),
        'environment': _env_config.get('environment'),
        'port': _env_config.get('port'),
    }

    custom = dict(_custom_env) if _custom_env else None

    if extras is not None and callable(extras):
        try:
            extras_result = extras()
            if extras_result and isinstance(extras_result, dict):
                for key, value in extras_result.items():
                    if key == 'custom' and isinstance(value, dict):
                        custom = custom or {}
                        for ck, cv in value.items():
                            if cv is None:
                                continue
                            custom[ck] = str(cv)
                    elif key != '_buildbanner':
                        data[key] = value
        except Exception as err:
            logger.error(f'BuildBanner: extras callback threw: {err}')

    if custom:
        # Stringify non-string values, omit None
        clean_custom: Dict[str, str] = {}
        for ck, cv in custom.items():
            if cv is None:
                continue
            clean_custom[ck] = str(cv)
        if clean_custom:
            data['custom'] = clean_custom

    # Remove null top-level fields (except _buildbanner)
    keys_to_remove = [
        k for k, v in data.items()
        if v is None and k != '_buildbanner'
    ]
    for k in keys_to_remove:
        del data[k]

    return data


def _warn_production_token() -> None:
    """Log info if environment is production and token is configured."""
    environment = os.environ.get('BUILDBANNER_ENVIRONMENT')
    token = os.environ.get('BUILDBANNER_TOKEN')
    if environment == 'production' and token and len(token) >= MIN_TOKEN_LEN:
        logger.info(
            'BuildBanner: token auth is enabled in production environment',
        )


# Emit production token info at module load
_warn_production_token()

"""Fixtures for the repo-tooling tests: throwaway git repos with the hooks installed."""

from __future__ import annotations

import os
import shutil
import stat
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = REPO_ROOT / "scripts"
HOOKS_DIR = REPO_ROOT / ".githooks"
NO_HOOKS = ["-c", "core.hooksPath=/dev/null"]
# One fake `gh` serves the whole session. macOS scans each newly created executable on
# its first run, 0.6 to 1 s per file on the Studio (measured 2026-09-23), so a stub
# written per test costs more than the test. Tests set its output with the FAKE_GH_*
# variables.
FAKE_GH = """#!/usr/bin/env bash
case "$1 $2" in
  "pr view") cat "$FAKE_GH_VIEW_JSON" ;;
  "pr merge") printf '%s\\n' "$*" >> "$FAKE_GH_MERGE_LOG" ;;
  "pr list") cat "$FAKE_GH_LIST_JSON" ;;
  *) echo "fake gh: unsupported: $*" >&2; exit 1 ;;
esac
"""

if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))


@dataclass
class GitFixture:
    """A bare origin, a clone with the repo's hooks, and a hook-less second clone."""

    origin: Path
    clone: Path
    other: Path
    env: dict[str, str] = field(default_factory=dict)

    def git(
        self, *args: str, cwd: Path | None = None, check: bool = True
    ) -> subprocess.CompletedProcess[str]:
        """Run git in the clone (or `cwd`) with the isolated environment."""
        return subprocess.run(
            ["git", *args],
            cwd=cwd or self.clone,
            env=self.env,
            capture_output=True,
            text=True,
            check=check,
        )

    def head(self, ref: str = "HEAD", cwd: Path | None = None) -> str:
        """Resolve a ref to a sha."""
        return self.git("rev-parse", ref, cwd=cwd).stdout.strip()

    def commit_file(
        self, name: str, content: str, message: str, cwd: Path | None = None
    ) -> str:
        """Write, stage and commit a file; return the new sha."""
        cwd = cwd or self.clone
        (cwd / name).write_text(content)
        self.git("add", name, cwd=cwd)
        self.git("commit", "-q", "-m", message, cwd=cwd)
        return self.head(cwd=cwd)

    def push_from_other(self, branch: str, message: str) -> str:
        """Commit on `branch` in the hook-less clone and push it to origin."""
        self.git("fetch", "-q", "origin", cwd=self.other)
        if self.git(
            "show-ref",
            "--verify",
            "--quiet",
            f"refs/heads/{branch}",
            cwd=self.other,
            check=False,
        ).returncode:
            self.git("switch", "-q", "-c", branch, f"origin/{branch}", cwd=self.other)
        else:
            self.git("switch", "-q", branch, cwd=self.other)
            self.git("merge", "-q", "--ff-only", f"origin/{branch}", cwd=self.other)
        sha = self.commit_file(f"{message}.txt", message, message, cwd=self.other)
        self.git("push", "-q", "origin", branch, cwd=self.other)
        return sha


def _isolated_git_env(tmp_path: Path) -> dict[str, str]:
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    env.update(
        {
            "GIT_CONFIG_GLOBAL": str(tmp_path / "gitconfig"),
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_AUTHOR_NAME": "tooling-test",
            "GIT_AUTHOR_EMAIL": "tooling@example.invalid",
            "GIT_COMMITTER_NAME": "tooling-test",
            "GIT_COMMITTER_EMAIL": "tooling@example.invalid",
            "BB_GATE_LOCK": str(tmp_path / "gate.lock"),
        }
    )
    env.pop("BB_GATE_LOCK_HELD", None)
    return env


def install_tooling(clone: Path) -> None:
    """Link the hooks and copy the guard library, sync script and Makefile into a clone.

    The hooks are symlinks to this repo's hook files, so no fixture creates a new
    executable for macOS to scan (see FAKE_GH). A hook locates scripts/guard_main.sh
    from the path git runs it by, which is inside the clone.
    """
    hooks = clone / ".githooks"
    hooks.mkdir()
    for hook in sorted(HOOKS_DIR.iterdir()):
        (hooks / hook.name).symlink_to(hook)
    (clone / "scripts").mkdir(exist_ok=True)
    for name in ("guard_main.sh", "sync.sh"):
        shutil.copy(SCRIPTS_DIR / name, clone / "scripts" / name)
    shutil.copy(REPO_ROOT / "Makefile", clone / "Makefile")
    (clone / "package.json").write_text('{"name": "fixture", "private": true}\n')


@pytest.fixture(scope="session")
def fake_gh_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """A directory whose only file is the FAKE_GH stub, created once per session."""
    bin_dir = tmp_path_factory.mktemp("fake-gh")
    gh = bin_dir / "gh"
    gh.write_text(FAKE_GH)
    gh.chmod(gh.stat().st_mode | stat.S_IXUSR)
    return bin_dir


@pytest.fixture
def git_repo(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> GitFixture:
    """Bare origin + clone (hooks on, main pushed) + hook-less second clone."""
    env = _isolated_git_env(tmp_path)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    monkeypatch.delenv("BB_GATE_LOCK_HELD", raising=False)
    origin = tmp_path / "origin.git"
    clone = tmp_path / "clone"
    other = tmp_path / "other"
    fixture = GitFixture(origin=origin, clone=clone, other=other, env=env)
    subprocess.run(
        ["git", "init", "-q", "--bare", "-b", "main", str(origin)], env=env, check=True
    )
    subprocess.run(["git", "clone", "-q", str(origin), str(clone)], env=env, check=True)
    fixture.git("switch", "-q", "-c", "main", check=False)
    install_tooling(clone)
    (clone / "README.md").write_text("# fixture\n")
    fixture.git("add", "-A")
    fixture.git("commit", "-q", "-m", "init")
    fixture.git("push", "-q", "-u", "origin", "main")
    fixture.git("config", "core.hooksPath", ".githooks")
    subprocess.run(["git", "clone", "-q", str(origin), str(other)], env=env, check=True)
    return fixture

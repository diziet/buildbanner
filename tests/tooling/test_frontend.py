"""scripts/frontend.sh: the worktree-local Node fails closed and runs commands under the pin."""

import os
import re
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
FRONTEND = str(ROOT / "scripts/frontend.sh")
NODE_PIN = re.search(
    r"^NODE_VERSION\s*:=\s*(\S+)", (ROOT / "Makefile").read_text(), re.MULTILINE
)


def _frontend(*args: str, node_version: str | None) -> subprocess.CompletedProcess[str]:
    environment = {key: value for key, value in os.environ.items() if key != "NODE_VERSION"}
    if node_version is not None:
        environment["NODE_VERSION"] = node_version
    return subprocess.run(
        ["bash", FRONTEND, *args],
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )


def test_frontend_requires_make_pin() -> None:
    """A direct invocation without the Makefile pin fails with "set by Makefile"."""
    result = _frontend("doctor", node_version=None)
    assert result.returncode != 0
    assert "set by Makefile" in result.stderr


def test_frontend_doctor_never_installs_missing_runtime() -> None:
    """Without the pinned Node, `doctor` reports its sanctioned repair, `make node-install`.

    No `.tools/node-v0.0.0-test-*` path exists after the run.
    """
    result = _frontend("doctor", node_version="0.0.0-test")
    assert result.returncode == 1
    assert "make node-install" in result.stderr
    assert not list((ROOT / ".tools").glob("node-v0.0.0-test-*"))


def test_frontend_rejects_unknown_command() -> None:
    """Unsupported operations cannot silently succeed."""
    result = _frontend("unknown", node_version="0.0.0-test")
    assert result.returncode == 2
    assert "unknown command" in result.stderr


def test_exec_refuses_without_the_pinned_node() -> None:
    result = _frontend("exec", ".", "true", node_version="0.0.0-test")
    assert result.returncode == 1
    assert "make node-install" in result.stderr


def test_exec_runs_the_command_in_the_directory_under_the_pinned_node() -> None:
    """make deps installs the pinned Node in every tree that runs this suite."""
    assert NODE_PIN is not None
    pin = NODE_PIN.group(1)
    script = "console.log(process.version + ' ' + process.cwd())"
    result = _frontend("exec", "client", "node", "-e", script, node_version=pin)
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == f"v{pin} {ROOT / 'client'}"


def test_exec_requires_a_command_after_the_directory() -> None:
    assert NODE_PIN is not None
    result = _frontend("exec", "client", node_version=NODE_PIN.group(1))
    assert result.returncode == 2
    assert "exec needs a command" in result.stderr


@pytest.mark.parametrize(
    "command",
    ["scripts/frontend.sh install", "uv venv", "uv pip install", "bundle install"],
)
def test_deps_installs_node_python_and_ruby_dependencies(command: str) -> None:
    """make worktree and make merge run `make deps` to prepare a new tree."""
    result = subprocess.run(
        ["make", "-n", "deps"], cwd=ROOT, capture_output=True, text=True, check=True
    )
    assert command in result.stdout

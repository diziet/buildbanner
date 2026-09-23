"""Checks that check themselves: assert the repo's gates are all wired.

(a) every test file is run by exactly one gate suite. Each suite's runner lists
    the files it would run (vitest list, pytest --collect-only, rspec --dry-run),
    and every test file in the tree must be in exactly one list or in
    EXEMPT_TEST_FILES. A named minimum set must be listed, so a broken glob
    cannot pass on an empty set, and an exemption fails once its file is gone
    or a suite runs it;
(b) every script under scripts/ is referenced from the Makefile, a hook, or
    another script (no orphan tooling);
(c) the Makefile `gate` recipe runs scripts/gate.sh, and every Makefile target
    whose `## ` comment says `Blocking gate` is in that script's full
    `stages="..."` list. The list is parsed rather than searched as text,
    because a target name inside a message string is not a stage.
The verdict is the exit code, never parsed output.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TEST_FILE_PATTERN = re.compile(
    r"(^|/)test_[^/]*\.py$|_test\.py$|\.(test|spec)\.[cm]?js$|_spec\.rb$"
)
BLOCKING_TARGET_PATTERN = re.compile(
    r"^([A-Za-z0-9_-]+):.*## Blocking gate", re.MULTILINE
)
# Only the unindented full list matches, not the indented docs-only subset.
STAGES_PATTERN = re.compile(r'^stages="([^"]*)"', re.MULTILINE)
GATE_SCRIPT = "scripts/gate.sh"
KNOWN_TEST_FILES: frozenset[str] = frozenset(
    {
        "client/tests/main.test.js",
        "node/tests/server.test.js",
        "python/tests/test_core.py",
        "ruby/spec/buildbanner_spec.rb",
        "tests/docs.test.js",
        "tests/parity/node.test.js",
        "tests/parity/ruby_parity_spec.rb",
        "tests/parity/test_python.py",
        "tests/tooling/test_check_doc_refs.py",
        "tests/tooling/test_doc_checks_repo.py",
        "tests/tooling/test_doc_common.py",
        "tests/tooling/test_doc_facts.py",
        "tests/tooling/test_hooks.py",
    }
)
# Test files no gate suite runs, with the reason. An entry fails the check once its
# file is gone or a suite runs it, so an exemption cannot outlive its reason.
EXEMPT_TEST_FILES: dict[str, str] = {
    "tests/e2e/smoke.test.js": (
        "Playwright test in a real Chromium; make deps installs no browser. Run it "
        "with: npx playwright test --config tests/e2e/playwright.config.js"
    ),
}
# Targets that are the roots of the wiring and therefore need no caller.
WIRING_ROOTS = frozenset({"gate"})


@dataclass(frozen=True)
class Suite:
    """One test command in a Makefile recipe, and its runner's list arguments.

    `recipe` is a regex for that command's line in `make -n <target>`. A tooling
    test matches each one, so this table cannot drift from the Makefile unnoticed.
    """

    target: str
    cwd: str
    runner: str
    args: tuple[str, ...]
    recipe: str

    @property
    def label(self) -> str:
        """Name the suite in problem messages: target and directory."""
        return f"{self.target} in {self.cwd}"


SUITES: tuple[Suite, ...] = (
    # The root npm test script is `vitest run tests/`, so the list repeats its filter.
    Suite("test-js", ".", "vitest", ("tests/",), r"frontend\.sh exec \. npm test$"),
    Suite("test-js", "client", "vitest", (), r"frontend\.sh exec client npm test$"),
    Suite("test-js", "node", "vitest", (), r"frontend\.sh exec node npx vitest run$"),
    Suite("test-python", "python", "pytest", (), r"^cd python && \S+/bin/pytest$"),
    Suite(
        "test-parity",
        ".",
        "pytest",
        ("--rootdir=.", "tests/parity/test_python.py"),
        r"-m pytest .*--rootdir=\. tests/parity/test_python\.py$",
    ),
    Suite(
        "test-parity",
        "ruby",
        "rspec",
        ("../tests/parity/ruby_parity_spec.rb",),
        r"^cd ruby && .*bundle exec rspec \.\./tests/parity/ruby_parity_spec\.rb$",
    ),
    Suite("test-ruby", "ruby", "rspec", (), r"^cd ruby && .*bundle exec rspec$"),
    Suite(
        "test-tooling",
        ".",
        "pytest",
        ("--rootdir=.", "tests/tooling"),
        r"-m pytest .*--rootdir=\. tests/tooling$",
    ),
)


@dataclass(frozen=True)
class Toolchain:
    """The pinned tools the runners need: Node for vitest, Ruby for rspec."""

    python: str
    node_version: str
    ruby_bin: str


def list_command(root: Path, suite: Suite, tools: Toolchain) -> list[str]:
    """Return the argv that makes `suite`'s runner print its test files."""
    if suite.runner == "vitest":
        frontend = str(root / "scripts" / "frontend.sh")
        vitest = ["npx", "vitest", "list", *suite.args, "--filesOnly", "--json"]
        return ["bash", frontend, "exec", suite.cwd, *vitest]
    if suite.runner == "pytest":
        return [
            tools.python,
            *("-m", "pytest", "--collect-only", "-q", "-p", "no:cacheprovider"),
            *suite.args,
        ]
    return ["bundle", "exec", "rspec", "--dry-run", "--format", "json", *suite.args]


def runner_env(tools: Toolchain) -> dict[str, str]:
    """Return the environment the Makefile gives the runners."""
    env = dict(os.environ)
    env["NODE_VERSION"] = tools.node_version
    env["PATH"] = f"{tools.ruby_bin}:{env.get('PATH', '')}"
    env["BUNDLE_PATH"] = "vendor/bundle"
    return env


def parse_vitest(output: str) -> list[str]:
    """Files from `vitest list --filesOnly --json`: absolute paths."""
    return [str(entry["file"]) for entry in json.loads(output)]


def parse_pytest(output: str) -> list[str]:
    """Files from `pytest --collect-only -q`: node ids relative to the rootdir."""
    return sorted(
        {line.split("::", 1)[0] for line in output.splitlines() if "::" in line}
    )


def parse_rspec(output: str) -> list[str]:
    """Files from `rspec --dry-run --format json`: paths relative to the cwd."""
    return sorted({str(example["file_path"]) for example in json.loads(output)["examples"]})


PARSERS = {"vitest": parse_vitest, "pytest": parse_pytest, "rspec": parse_rspec}
# pytest exits 5 when it collects nothing; the known minimum set catches that case.
OK_EXIT_CODES = {"vitest": {0}, "pytest": {0, 5}, "rspec": {0}}


def repo_relative(root: Path, cwd: Path, path: str) -> str:
    """Return `path` (absolute or relative to `cwd`) relative to `root` when inside it."""
    resolved = (cwd / path).resolve()
    try:
        return resolved.relative_to(root).as_posix()
    except ValueError:
        return str(resolved)


def list_suite_files(
    root: Path, suite: Suite, tools: Toolchain
) -> tuple[list[str], str | None]:
    """Return the repo-relative files `suite` runs, or a problem when listing fails."""
    command = list_command(root, suite, tools)
    cwd = root / suite.cwd
    result = subprocess.run(
        command,
        cwd=cwd,
        env=runner_env(tools),
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode not in OK_EXIT_CODES[suite.runner]:
        tail = (result.stderr or result.stdout).strip()[-1500:]
        return [], (
            f"cannot list the test files of {suite.label}: "
            f"{' '.join(command)} exited {result.returncode}:\n{tail}"
        )
    try:
        files = PARSERS[suite.runner](result.stdout)
    except (ValueError, KeyError, TypeError) as error:
        return [], f"cannot parse the {suite.runner} list for {suite.label}: {error!r}"
    return [repo_relative(root, cwd, path) for path in files], None


def listed_test_files(
    root: Path, tools: Toolchain, suites: tuple[Suite, ...] = SUITES
) -> tuple[dict[str, list[str]], list[str]]:
    """Map each listed file to the suites that run it; also return listing problems."""
    listed: dict[str, list[str]] = {}
    problems: list[str] = []
    for suite in suites:
        files, problem = list_suite_files(root, suite, tools)
        if problem:
            problems.append(problem)
        for path in files:
            listed.setdefault(path, []).append(suite.label)
    return listed, problems


def test_files_on_disk(root: Path) -> set[str]:
    """Return every tracked or unignored file whose name marks it as a test file."""
    result = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
        cwd=root,
        capture_output=True,
        text=True,
        check=True,
    )
    return {
        path
        for path in result.stdout.splitlines()
        if TEST_FILE_PATTERN.search(path) and (root / path).is_file()
    }


def check_tests_run(
    root: Path,
    listed: dict[str, list[str]],
    known: frozenset[str] | None = None,
    exempt: dict[str, str] | None = None,
) -> list[str]:
    """(a) Every test file on disk is run by exactly one suite or is exempt."""
    known = KNOWN_TEST_FILES if known is None else known
    exempt = EXEMPT_TEST_FILES if exempt is None else exempt
    on_disk = test_files_on_disk(root)
    problems = [
        f"test file not run by any gate suite: {path}"
        for path in sorted(on_disk - listed.keys() - exempt.keys())
    ]
    problems += [
        f"test file run by more than one suite: {path} ({', '.join(suites)})"
        for path, suites in sorted(listed.items())
        if len(suites) > 1
    ]
    problems += [
        f"known test file missing from the suites' lists: {path}"
        for path in sorted(known - listed.keys())
    ]
    for path in sorted(exempt):
        if path not in on_disk:
            problems.append(f"stale exemption, no such test file: {path}")
        elif path in listed:
            problems.append(f"stale exemption, a suite runs it: {path}")
    return problems


def _reference_corpus(root: Path) -> dict[Path, str]:
    """Return {file: text} for Makefile, hooks and scripts, comment lines stripped."""
    files = [
        root / "Makefile",
        *sorted((root / ".githooks").glob("*")),
        *sorted((root / "scripts").glob("*")),
    ]
    corpus: dict[Path, str] = {}
    for path in files:
        if not path.is_file():
            continue
        lines = path.read_text(errors="replace").splitlines()
        corpus[path] = "\n".join(
            line for line in lines if not line.lstrip().startswith("#")
        )
    return corpus


def check_scripts_referenced(root: Path) -> list[str]:
    """(b) Every scripts/* file is named by the Makefile, a hook, or another script."""
    corpus = _reference_corpus(root)
    problems: list[str] = []
    for script in sorted((root / "scripts").glob("*")):
        if not script.is_file() or script.name.startswith("__"):
            continue
        import_pattern = re.compile(rf"\b(from|import)\s+{re.escape(script.stem)}\b")
        referenced = any(
            script.name in text or bool(import_pattern.search(text))
            for path, text in corpus.items()
            if path != script
        )
        if not referenced:
            problems.append(
                "orphan script (not referenced by Makefile, hooks or scripts): "
                f"scripts/{script.name}"
            )
    return problems


def blocking_targets(makefile_text: str) -> list[str]:
    """Return Makefile targets whose help comment says `Blocking gate`."""
    return BLOCKING_TARGET_PATTERN.findall(makefile_text)


def recipe_text(makefile_text: str, target: str) -> str:
    """Return the tab-indented recipe lines of `target`, or '' when it has no rule."""
    lines = makefile_text.splitlines()
    for index, line in enumerate(lines):
        if re.match(rf"^{re.escape(target)}:", line):
            recipe: list[str] = []
            for body in lines[index + 1 :]:
                if not body.startswith("\t"):
                    break
                recipe.append(body)
            return "\n".join(recipe)
    return ""


def gate_stages(gate_text: str) -> list[str] | None:
    """Return the full stage list from gate.sh, or None without a `stages=` line."""
    match = STAGES_PATTERN.search(gate_text)
    return match.group(1).split() if match else None


def check_blocking_targets_wired(root: Path) -> list[str]:
    """(c) `gate` runs gate.sh and every Blocking-gate target is in its stage list."""
    makefile = root / "Makefile"
    if not makefile.is_file():
        return ["Makefile missing"]
    makefile_text = makefile.read_text()
    if GATE_SCRIPT not in recipe_text(makefile_text, "gate"):
        return [f"Makefile `gate` recipe does not run {GATE_SCRIPT}"]
    gate = root / GATE_SCRIPT
    stages = gate_stages(gate.read_text()) if gate.is_file() else None
    if stages is None:
        return [f'{GATE_SCRIPT} has no stages="..." list']
    return [
        f"blocking target '{target}' is not a stage in {GATE_SCRIPT}"
        for target in blocking_targets(makefile_text)
        if target not in WIRING_ROOTS and target not in stages
    ]


def run_all(root: Path, tools: Toolchain) -> list[str]:
    """Run every check and return the combined list of problems."""
    listed, problems = listed_test_files(root, tools)
    return [
        *problems,
        *check_tests_run(root, listed),
        *check_scripts_referenced(root),
        *check_blocking_targets_wired(root),
    ]


def main(argv: list[str] | None = None) -> int:
    """CLI: exit 1 on any problem, 2 when not run from the repo root."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=REPO_ROOT, help=argparse.SUPPRESS)
    parser.add_argument("--node-version", required=True, help="the Makefile's pin")
    parser.add_argument("--ruby-bin", required=True, help="the Makefile's RUBY_BIN")
    options = parser.parse_args(argv)
    root: Path = options.root.resolve()
    if not (root / "package.json").is_file():
        print(f"check_gate_wiring: {root} is not the repo root", file=sys.stderr)
        return 2
    tools = Toolchain(sys.executable, options.node_version, options.ruby_bin)
    problems = run_all(root, tools)
    for problem in problems:
        print(f"check_gate_wiring: FAIL {problem}", file=sys.stderr)
    if problems:
        return 1
    print("check_gate_wiring: ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())

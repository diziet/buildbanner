"""scripts/check_gate_wiring.py: inject each defect, see it fail by name, fix, pass."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

import check_gate_wiring as wiring
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
KNOWN = frozenset({"tests/alpha.test.js"})
MAKEFILE = (
    "test-js: ## Blocking gate: vitest\n\tnpm test\n"
    "gate: ## Blocking gate: everything\n\tbash scripts/gate.sh\n"
    "helper: ## Advisory: uses tool\n\tpython scripts/tool.py\n"
)
TOOLS = wiring.Toolchain(sys.executable, "0.0.0-test", "/nonexistent/ruby/bin")


def _gate_sh(stages: str, extra: str = "") -> str:
    """Return a gate.sh shaped like ours: one full `stages=` list, then a loop."""
    return (
        f'#!/bin/sh\nstages="{stages}"\n{extra}'
        'for s in $stages; do make -s "$s"; done\n'
    )


@pytest.fixture
def mini_repo(tmp_path: Path) -> Path:
    """A git repo shaped like ours: package.json, Makefile, scripts, one test file."""
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    (tmp_path / "package.json").write_text('{"name": "mini", "private": true}\n')
    (tmp_path / "Makefile").write_text(MAKEFILE)
    scripts = tmp_path / "scripts"
    scripts.mkdir()
    (scripts / "gate.sh").write_text(_gate_sh("test-js"))
    (scripts / "tool.py").write_text("print('tool')\n")
    (tmp_path / "tests").mkdir()
    (tmp_path / "tests" / "alpha.test.js").write_text("test('alpha', () => {});\n")
    return tmp_path


def _run_problems(root: Path, listed: dict[str, list[str]]) -> list[str]:
    return wiring.check_tests_run(root, listed, KNOWN, exempt={})


def test_every_test_file_listed_once_has_no_problems(mini_repo: Path) -> None:
    listed = {"tests/alpha.test.js": ["test-js in ."]}
    assert _run_problems(mini_repo, listed) == []


def test_unrun_test_file_fails_by_name_then_passes_when_listed(mini_repo: Path) -> None:
    (mini_repo / "tests" / "beta_spec.rb").write_text("describe 'beta' do; end\n")
    listed = {"tests/alpha.test.js": ["test-js in ."]}
    assert _run_problems(mini_repo, listed) == [
        "test file not run by any gate suite: tests/beta_spec.rb"
    ]
    listed["tests/beta_spec.rb"] = ["test-ruby in ruby"]
    assert _run_problems(mini_repo, listed) == []


@pytest.mark.parametrize(
    "name",
    ["test_gamma.py", "gamma_test.py", "gamma.test.js", "gamma.spec.mjs", "gamma_spec.rb"],
)
def test_each_runner_naming_convention_is_discovered(mini_repo: Path, name: str) -> None:
    (mini_repo / "tests" / name).write_text("")
    assert f"tests/{name}" in wiring.test_files_on_disk(mini_repo)


def test_helpers_and_ignored_files_are_not_test_files(mini_repo: Path) -> None:
    (mini_repo / "tests" / "helpers.js").write_text("")
    (mini_repo / "tests" / "conftest.py").write_text("")
    (mini_repo / ".gitignore").write_text("vendor/\n")
    (mini_repo / "vendor").mkdir()
    (mini_repo / "vendor" / "gem_spec.rb").write_text("")
    assert wiring.test_files_on_disk(mini_repo) == {"tests/alpha.test.js"}


def test_file_run_by_two_suites_fails_by_name(mini_repo: Path) -> None:
    """The root vitest run once also ran client/tests; this is the check for it."""
    listed = {"tests/alpha.test.js": ["test-js in .", "test-js in client"]}
    assert _run_problems(mini_repo, listed) == [
        "test file run by more than one suite: tests/alpha.test.js "
        "(test-js in ., test-js in client)"
    ]


def test_missing_known_file_fails_so_an_empty_list_cannot_pass(mini_repo: Path) -> None:
    (mini_repo / "tests" / "alpha.test.js").unlink()
    assert _run_problems(mini_repo, {}) == [
        "known test file missing from the suites' lists: tests/alpha.test.js"
    ]


def test_exempt_file_passes_while_no_suite_runs_it(mini_repo: Path) -> None:
    (mini_repo / "tests" / "e2e.test.js").write_text("")
    listed = {"tests/alpha.test.js": ["test-js in ."]}
    exempt = {"tests/e2e.test.js": "browser test"}
    assert wiring.check_tests_run(mini_repo, listed, KNOWN, exempt) == []


def test_exemption_for_a_missing_file_is_stale(mini_repo: Path) -> None:
    listed = {"tests/alpha.test.js": ["test-js in ."]}
    exempt = {"tests/gone.test.js": "browser test"}
    assert wiring.check_tests_run(mini_repo, listed, KNOWN, exempt) == [
        "stale exemption, no such test file: tests/gone.test.js"
    ]


def test_exemption_for_a_file_a_suite_runs_is_stale(mini_repo: Path) -> None:
    listed = {"tests/alpha.test.js": ["test-js in ."]}
    exempt = {"tests/alpha.test.js": "browser test"}
    assert wiring.check_tests_run(mini_repo, listed, KNOWN, exempt) == [
        "stale exemption, a suite runs it: tests/alpha.test.js"
    ]


def test_real_exemptions_name_existing_test_files() -> None:
    on_disk = wiring.test_files_on_disk(REPO_ROOT)
    assert set(wiring.EXEMPT_TEST_FILES) <= on_disk
    assert "tests/e2e/smoke.test.js" in wiring.EXEMPT_TEST_FILES


def test_pytest_suite_lists_collected_files_relative_to_the_repo(mini_repo: Path) -> None:
    (mini_repo / "tests" / "test_delta.py").write_text("def test_delta():\n    pass\n")
    suite = wiring.Suite("test-x", ".", "pytest", ("--rootdir=.", "tests"), "")
    files, problem = wiring.list_suite_files(mini_repo, suite, TOOLS)
    assert problem is None
    assert files == ["tests/test_delta.py"]


def test_pytest_suite_with_no_tests_lists_nothing_without_a_problem(
    mini_repo: Path,
) -> None:
    suite = wiring.Suite("test-x", ".", "pytest", ("--rootdir=.", "tests"), "")
    assert wiring.list_suite_files(mini_repo, suite, TOOLS) == ([], None)


def test_runner_that_fails_is_a_problem_naming_the_suite(mini_repo: Path) -> None:
    (mini_repo / "tests" / "test_broken.py").write_text("def broken(:\n")
    suite = wiring.Suite("test-x", ".", "pytest", ("--rootdir=.", "tests"), "")
    files, problem = wiring.list_suite_files(mini_repo, suite, TOOLS)
    assert files == []
    assert problem is not None
    assert problem.startswith("cannot list the test files of test-x in .:")


def test_vitest_list_output_is_parsed() -> None:
    output = json.dumps([{"file": "/repo/tests/a.test.js"}, {"file": "/repo/b.test.js"}])
    assert wiring.parse_vitest(output) == ["/repo/tests/a.test.js", "/repo/b.test.js"]


def test_pytest_collect_output_is_parsed() -> None:
    output = (
        "tests/test_a.py::test_one\ntests/test_a.py::TestB::test_two\n"
        "tests/test_c.py::test_three\n\n3 tests collected in 0.01s\n"
    )
    assert wiring.parse_pytest(output) == ["tests/test_a.py", "tests/test_c.py"]


def test_rspec_dry_run_output_is_parsed() -> None:
    output = json.dumps(
        {
            "examples": [
                {"file_path": "./spec/a_spec.rb"},
                {"file_path": "./spec/a_spec.rb"},
                {"file_path": "/repo/tests/parity/b_spec.rb"},
            ]
        }
    )
    assert wiring.parse_rspec(output) == ["./spec/a_spec.rb", "/repo/tests/parity/b_spec.rb"]


def test_unparseable_runner_output_is_a_problem(
    mini_repo: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    suite = wiring.Suite("test-x", ".", "pytest", ("--rootdir=.", "tests"), "")
    monkeypatch.setitem(wiring.PARSERS, "pytest", wiring.parse_rspec)
    (mini_repo / "tests" / "test_delta.py").write_text("def test_delta():\n    pass\n")
    files, problem = wiring.list_suite_files(mini_repo, suite, TOOLS)
    assert files == []
    assert problem is not None
    assert problem.startswith("cannot parse the pytest list for test-x in .:")


def test_paths_are_made_repo_relative(tmp_path: Path) -> None:
    root = tmp_path.resolve()
    (root / "ruby").mkdir()
    assert wiring.repo_relative(root, root / "ruby", "./spec/a_spec.rb") == (
        "ruby/spec/a_spec.rb"
    )
    assert wiring.repo_relative(root, root / "ruby", str(root / "tests" / "b.py")) == (
        "tests/b.py"
    )


@pytest.mark.parametrize("suite", wiring.SUITES, ids=lambda suite: suite.label)
def test_suites_mirror_the_makefile_recipes(suite: wiring.Suite) -> None:
    """Each SUITES entry matches a command line that its Makefile target runs."""
    printed = subprocess.run(
        ["make", "-n", "-C", str(REPO_ROOT), suite.target],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    assert any(re.search(suite.recipe, line) for line in printed.splitlines()), printed


def test_orphan_script_fails_by_name_then_passes_when_referenced(
    mini_repo: Path,
) -> None:
    (mini_repo / "scripts" / "orphan.py").write_text("print('x')\n")
    problems = wiring.check_scripts_referenced(mini_repo)
    assert problems == [
        "orphan script (not referenced by Makefile, hooks or scripts): "
        "scripts/orphan.py"
    ]
    (mini_repo / "Makefile").write_text(
        MAKEFILE + "orphan: ## Advisory\n\tpython scripts/orphan.py\n"
    )
    assert wiring.check_scripts_referenced(mini_repo) == []


def test_script_referenced_only_by_python_import_is_wired(mini_repo: Path) -> None:
    (mini_repo / "scripts" / "helpers_mod.py").write_text("X = 1\n")
    (mini_repo / "scripts" / "tool.py").write_text(
        "from helpers_mod import X\nprint(X)\n"
    )
    assert wiring.check_scripts_referenced(mini_repo) == []


def test_reference_inside_a_comment_does_not_count(mini_repo: Path) -> None:
    (mini_repo / "scripts" / "ghost.py").write_text("print('x')\n")
    (mini_repo / "Makefile").write_text(MAKEFILE + "# see scripts/ghost.py\n")
    assert len(wiring.check_scripts_referenced(mini_repo)) == 1


def test_unwired_blocking_target_fails_then_passes_when_added_to_gate(
    mini_repo: Path,
) -> None:
    (mini_repo / "Makefile").write_text(
        MAKEFILE + "test-ruby: ## Blocking gate: rspec\n\trspec\n"
    )
    problems = wiring.check_blocking_targets_wired(mini_repo)
    assert len(problems) == 1 and "'test-ruby'" in problems[0]
    (mini_repo / "scripts" / "gate.sh").write_text(_gate_sh("test-js test-ruby"))
    assert wiring.check_blocking_targets_wired(mini_repo) == []


@pytest.mark.parametrize(
    ("path", "text"),
    [
        (
            "scripts/gate.sh",
            _gate_sh("test-js", 'echo "gate: docs-only change; skipping test-ruby"\n'),
        ),
        (
            "scripts/merge_gate.py",
            'MESSAGE = "run make test-ruby before the merge"\n',
        ),
    ],
    ids=["gate-echo", "merge-script-string"],
)
def test_blocking_target_named_only_in_a_string_fails_by_name(
    mini_repo: Path, path: str, text: str
) -> None:
    """A target name inside a message is not a stage; only the stage list counts."""
    (mini_repo / "Makefile").write_text(
        MAKEFILE + "test-ruby: ## Blocking gate: rspec\n\trspec\n"
    )
    (mini_repo / path).write_text(text)
    problems = wiring.check_blocking_targets_wired(mini_repo)
    assert len(problems) == 1 and "'test-ruby'" in problems[0]


def test_gate_recipe_that_skips_gate_script_fails(mini_repo: Path) -> None:
    (mini_repo / "Makefile").write_text(
        MAKEFILE.replace("\tbash scripts/gate.sh\n", "\tmake -s test-js\n")
    )
    assert wiring.check_blocking_targets_wired(mini_repo) == [
        "Makefile `gate` recipe does not run scripts/gate.sh"
    ]


def test_gate_script_without_stage_list_fails_closed(mini_repo: Path) -> None:
    (mini_repo / "scripts" / "gate.sh").write_text("#!/bin/sh\nmake -s test-js\n")
    assert wiring.check_blocking_targets_wired(mini_repo) == [
        'scripts/gate.sh has no stages="..." list'
    ]


def test_stage_list_is_the_full_list_not_the_docs_only_subset() -> None:
    gate_text = 'stages="test-js test"\nif [ "$d" = 1 ]; then\n  stages="test-js"\nfi\n'
    assert wiring.gate_stages(gate_text) == ["test-js", "test"]


def test_blocking_targets_are_parsed_from_help_comments() -> None:
    assert wiring.blocking_targets(MAKEFILE) == ["test-js", "gate"]


def test_cli_exit_codes(
    mini_repo: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def listed(_root: Path, _tools: wiring.Toolchain) -> tuple[dict[str, list[str]], list[str]]:
        return {"tests/alpha.test.js": ["test-js in ."]}, []

    monkeypatch.setattr(wiring, "listed_test_files", listed)
    monkeypatch.setattr(wiring, "KNOWN_TEST_FILES", KNOWN)
    monkeypatch.setattr(wiring, "EXEMPT_TEST_FILES", {})
    pins = ["--node-version", "0.0.0-test", "--ruby-bin", "/nonexistent"]
    assert wiring.main(["--root", str(mini_repo), *pins]) == 0
    assert "check_gate_wiring: ok" in capsys.readouterr().out
    (mini_repo / "scripts" / "orphan.py").write_text("")
    assert wiring.main(["--root", str(mini_repo), *pins]) == 1
    assert "FAIL orphan script" in capsys.readouterr().err
    assert wiring.main(["--root", str(mini_repo / "nowhere"), *pins]) == 2


def test_real_repo_blocking_targets_are_all_wired() -> None:
    assert wiring.check_blocking_targets_wired(REPO_ROOT) == []
    assert wiring.check_scripts_referenced(REPO_ROOT) == []

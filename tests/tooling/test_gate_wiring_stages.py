"""scripts/gate_wiring_stages.py: inject each stage-list defect, see it fail by name."""

from __future__ import annotations

from pathlib import Path

import gate_wiring_stages as stages
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
DOC_TARGETS = (
    "doc-facts-check: ## Blocking gate: facts\n\tpython scripts/doc_facts.py\n"
    "doc-refs-check: ## Blocking gate: refs\n\tpython scripts/check_doc_refs.py\n"
    "test-doc-checks: ## Blocking gate: doc tests\n"
    "\tpytest tests/tooling/test_doc_checks_repo.py\n"
)
MAKEFILE = (
    "test-js: ## Blocking gate: vitest\n\tnpm test\n"
    "gate: ## Blocking gate: everything\n\tbash scripts/gate.sh\n"
    "helper: ## Advisory: uses tool\n\tpython scripts/tool.py\n"
) + DOC_TARGETS
DOC_STAGES = "doc-facts-check doc-refs-check test-doc-checks"


def gate_sh(full: str, extra: str = "", docs_only: str = DOC_STAGES) -> str:
    """Return a gate.sh shaped like ours: full and docs-only lists, then a loop."""
    return (
        f'#!/bin/sh\nstages="{DOC_STAGES} {full}"\n'
        f'if [ "$1" = --docs-only ]; then\n  stages="{docs_only}"\nfi\n{extra}'
        'for s in $stages; do make -s "$s"; done\n'
    )


@pytest.fixture
def stage_repo(tmp_path: Path) -> Path:
    """A tree with our Makefile shape and a gate.sh whose lists are complete."""
    (tmp_path / "Makefile").write_text(MAKEFILE)
    (tmp_path / "scripts").mkdir()
    (tmp_path / "scripts" / "gate.sh").write_text(gate_sh("test-js"))
    return tmp_path


def test_complete_stage_lists_have_no_problems(stage_repo: Path) -> None:
    assert stages.check_blocking_targets_wired(stage_repo) == []
    assert stages.check_doc_stages_wired(stage_repo) == []


def test_unwired_blocking_target_fails_then_passes_when_added_to_gate(
    stage_repo: Path,
) -> None:
    (stage_repo / "Makefile").write_text(
        MAKEFILE + "test-ruby: ## Blocking gate: rspec\n\trspec\n"
    )
    problems = stages.check_blocking_targets_wired(stage_repo)
    assert len(problems) == 1 and "'test-ruby'" in problems[0]
    (stage_repo / "scripts" / "gate.sh").write_text(gate_sh("test-js test-ruby"))
    assert stages.check_blocking_targets_wired(stage_repo) == []


@pytest.mark.parametrize(
    ("path", "text"),
    [
        (
            "scripts/gate.sh",
            gate_sh("test-js", 'echo "gate: docs-only change; skipping test-ruby"\n'),
        ),
        (
            "scripts/merge_gate.py",
            'MESSAGE = "run make test-ruby before the merge"\n',
        ),
    ],
    ids=["gate-echo", "merge-script-string"],
)
def test_blocking_target_named_only_in_a_string_fails_by_name(
    stage_repo: Path, path: str, text: str
) -> None:
    """A target name inside a message is not a stage; only the stage list counts."""
    (stage_repo / "Makefile").write_text(
        MAKEFILE + "test-ruby: ## Blocking gate: rspec\n\trspec\n"
    )
    (stage_repo / path).write_text(text)
    problems = stages.check_blocking_targets_wired(stage_repo)
    assert len(problems) == 1 and "'test-ruby'" in problems[0]


def test_gate_recipe_that_skips_gate_script_fails(stage_repo: Path) -> None:
    (stage_repo / "Makefile").write_text(
        MAKEFILE.replace("\tbash scripts/gate.sh\n", "\tmake -s test-js\n")
    )
    assert stages.check_blocking_targets_wired(stage_repo) == [
        "Makefile `gate` recipe does not run scripts/gate.sh"
    ]


def test_gate_script_without_stage_list_fails_closed(stage_repo: Path) -> None:
    (stage_repo / "scripts" / "gate.sh").write_text("#!/bin/sh\nmake -s test-js\n")
    assert stages.check_blocking_targets_wired(stage_repo) == [
        'scripts/gate.sh has no stages="..." list'
    ]


def test_stage_list_is_the_full_list_not_the_docs_only_subset() -> None:
    gate_text = 'stages="test-js test"\nif [ "$d" = 1 ]; then\n  stages="test-js"\nfi\n'
    assert stages.gate_stages(gate_text) == ["test-js", "test"]


def test_docs_only_list_is_the_indented_list_not_the_full_one() -> None:
    gate_text = 'stages="test-js test"\nif [ "$d" = 1 ]; then\n  stages="test-js"\nfi\n'
    assert stages.docs_only_stages(gate_text) == ["test-js"]


def test_blocking_targets_are_parsed_from_help_comments() -> None:
    assert stages.blocking_targets(MAKEFILE) == [
        "test-js",
        "gate",
        "doc-facts-check",
        "doc-refs-check",
        "test-doc-checks",
    ]


def test_doc_stage_missing_from_docs_only_list_fails_by_name_then_passes(
    stage_repo: Path,
) -> None:
    """The 2026-09-24 incident: docs-only PRs skipped the repo doc test module."""
    gate = stage_repo / "scripts" / "gate.sh"
    gate.write_text(gate_sh("test-js", docs_only="doc-facts-check doc-refs-check test-js"))
    assert stages.check_doc_stages_wired(stage_repo) == [
        "doc stage 'test-doc-checks' is not in the docs-only stage list of "
        "scripts/gate.sh"
    ]
    gate.write_text(gate_sh("test-js"))
    assert stages.check_doc_stages_wired(stage_repo) == []


def test_doc_stage_that_is_not_a_blocking_target_fails_by_name(
    stage_repo: Path,
) -> None:
    (stage_repo / "Makefile").write_text(
        MAKEFILE.replace("doc-refs-check: ## Blocking gate", "doc-refs-check: ## Advisory")
    )
    assert stages.check_doc_stages_wired(stage_repo) == [
        "doc stage 'doc-refs-check' is not a Blocking-gate target in the Makefile"
    ]


def test_doc_test_target_that_skips_the_repo_module_fails(stage_repo: Path) -> None:
    (stage_repo / "Makefile").write_text(
        MAKEFILE.replace("tests/tooling/test_doc_checks_repo.py", "tests/tooling")
    )
    assert stages.check_doc_stages_wired(stage_repo) == [
        "Makefile `test-doc-checks` recipe does not run "
        "tests/tooling/test_doc_checks_repo.py"
    ]


def test_gate_script_without_docs_only_list_fails_closed(stage_repo: Path) -> None:
    (stage_repo / "scripts" / "gate.sh").write_text(
        f'#!/bin/sh\nstages="{DOC_STAGES} test-js"\n'
    )
    assert stages.check_doc_stages_wired(stage_repo) == [
        'scripts/gate.sh has no indented docs-only stages="..." list'
    ]


def test_real_repo_stage_lists_are_wired() -> None:
    assert stages.check_blocking_targets_wired(REPO_ROOT) == []
    assert stages.check_doc_stages_wired(REPO_ROOT) == []

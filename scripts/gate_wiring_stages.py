"""Stage-list checks for check_gate_wiring.py, read from the Makefile and scripts/gate.sh.

(c) the Makefile `gate` recipe runs scripts/gate.sh, and every Makefile target
    whose `## ` comment says `Blocking gate` is in that script's full
    `stages="..."` list. The list is parsed rather than searched as text,
    because a target name inside a message string is not a stage;
(d) the doc stages are Blocking-gate targets in the indented docs-only list
    too, because a .md-only change can fail them, and `test-doc-checks` runs
    tests/tooling/test_doc_checks_repo.py.
"""

from __future__ import annotations

import re
from pathlib import Path

BLOCKING_TARGET_PATTERN = re.compile(
    r"^([A-Za-z0-9_-]+):.*## Blocking gate", re.MULTILINE
)
# Only the unindented full list matches, not the indented docs-only subset.
STAGES_PATTERN = re.compile(r'^stages="([^"]*)"', re.MULTILINE)
# Only the indented docs-only list matches.
DOCS_ONLY_STAGES_PATTERN = re.compile(r'^[ \t]+stages="([^"]*)"', re.MULTILINE)
GATE_SCRIPT = "scripts/gate.sh"
# Targets that are the roots of the wiring and therefore need no caller.
WIRING_ROOTS = frozenset({"gate"})
# A .md-only change can fail these stages, so the docs-only list must run them.
DOC_STAGES: frozenset[str] = frozenset(
    {"doc-facts-check", "doc-refs-check", "test-doc-checks"}
)
DOC_TEST_TARGET = "test-doc-checks"
DOC_TEST_MODULE = "tests/tooling/test_doc_checks_repo.py"


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


def docs_only_stages(gate_text: str) -> list[str] | None:
    """Return the docs-only stage list from gate.sh, or None without one."""
    match = DOCS_ONLY_STAGES_PATTERN.search(gate_text)
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


def check_doc_stages_wired(root: Path) -> list[str]:
    """(d) Doc stages gate docs-only PRs too; test-doc-checks runs the repo module."""
    makefile = root / "Makefile"
    if not makefile.is_file():
        return ["Makefile missing"]
    makefile_text = makefile.read_text()
    gate = root / GATE_SCRIPT
    docs_only = docs_only_stages(gate.read_text()) if gate.is_file() else None
    if docs_only is None:
        return [f'{GATE_SCRIPT} has no indented docs-only stages="..." list']
    blocking = set(blocking_targets(makefile_text))
    problems = [
        f"doc stage '{stage}' is not a Blocking-gate target in the Makefile"
        for stage in sorted(DOC_STAGES - blocking)
    ]
    problems += [
        f"doc stage '{stage}' is not in the docs-only stage list of {GATE_SCRIPT}"
        for stage in sorted(DOC_STAGES - set(docs_only))
    ]
    if DOC_TEST_MODULE not in recipe_text(makefile_text, DOC_TEST_TARGET):
        problems.append(
            f"Makefile `{DOC_TEST_TARGET}` recipe does not run {DOC_TEST_MODULE}"
        )
    return problems

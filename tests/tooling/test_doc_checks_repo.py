"""This repo's doc checks: the refs scan reaches known references, each fact computes.

Engine tests (test_check_doc_refs.py, test_doc_facts.py, test_doc_common.py) are
copied unchanged between repos. This file names references and facts that exist
only here, so a broken scanner or registry cannot pass by checking nothing.
"""

from __future__ import annotations

import re
from pathlib import Path

import check_doc_refs as refs
import pytest
from doc_facts_registry import FACTS
from doc_refs_cli import ProgramIndex

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_refs_scan_checks_a_named_minimum_set_of_references() -> None:
    checker = refs.Checker(REPO_ROOT)
    for doc in ("docs/README.md", "CLAUDE.md"):
        checker.check_doc(doc)
    assert {
        "make gate",
        "make merge",
        "make deps",
        "client/scripts/size-budget.js",
        "shared/schema.json",
        "docs/writing-style.md",
    } <= set(checker.checked)


def test_repo_python_scripts_define_their_argparse_flags() -> None:
    assert {"--node-version", "--ruby-bin", "--pr", "--docs-only"} <= ProgramIndex(
        REPO_ROOT
    ).all_flags()


@pytest.mark.parametrize(
    ("name", "shape"),
    [
        ("size-budget-bytes", r"[1-9]\d{0,2}(,\d{3})*"),
        ("cache-key", r"`[a-z_]+:<endpoint>`"),
        ("cache-max-age-hours", r"[1-9]\d*"),
    ],
)
def test_registered_fact_computes_a_well_formed_value(name: str, shape: str) -> None:
    assert re.fullmatch(shape, str(FACTS[name].compute(REPO_ROOT)))


def test_every_registered_fact_has_a_shape_test() -> None:
    assert set(FACTS) == {"size-budget-bytes", "cache-key", "cache-max-age-hours"}

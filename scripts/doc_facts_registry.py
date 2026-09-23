"""The facts this repo's docs state, and the source each value is computed from.

scripts/doc_facts.py rewrites `<!-- fact:NAME -->VALUE<!-- /fact -->` markers in
tracked .md files from these functions. To add a fact, register it here, wrap the
value in a doc with a marker, and run `make doc-facts`. The full description is
docs/doc-checks.md in the llm-reliability-benchmark repo, where these checks
come from.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from doc_facts_sources import Fact, regex_group

if TYPE_CHECKING:
    from pathlib import Path

SIZE_BUDGET = "client/scripts/size-budget.js"
CACHE = "client/src/cache.js"


def size_budget_bytes(root: Path) -> str:
    """Return BUDGET_BYTES from client/scripts/size-budget.js, with commas."""
    budget = regex_group(root, SIZE_BUDGET, r"^const BUDGET_BYTES = (\d+);$")
    return f"{int(budget):,}"


def cache_key(root: Path) -> str:
    """Return the localStorage key pattern the banner cache uses, as code."""
    prefix = regex_group(root, CACHE, r'^const CACHE_KEY_PREFIX = "([^"]+)";$')
    return f"`{prefix}:<endpoint>`"


def cache_max_age_hours(root: Path) -> int:
    """Return CACHE_MAX_AGE_MS in client/src/cache.js, in hours."""
    pattern = r"^const CACHE_MAX_AGE_MS = (\d+) \* 60 \* 60 \* 1000;$"
    return int(regex_group(root, CACHE, pattern))


FACTS: dict[str, Fact] = {
    "size-budget-bytes": Fact(f"BUDGET_BYTES in {SIZE_BUDGET}", size_budget_bytes),
    "cache-key": Fact(f"CACHE_KEY_PREFIX in {CACHE}, plus `:<endpoint>`", cache_key),
    "cache-max-age-hours": Fact(
        f"CACHE_MAX_AGE_MS in {CACHE}, written as <hours> * 60 * 60 * 1000",
        cache_max_age_hours,
    ),
}

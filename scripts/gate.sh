#!/usr/bin/env bash
# The gate stage list, in one place. `make gate` runs it under the gate lock in this tree;
# `make merge` runs it in the preview-merge worktree after `make deps`. Stages call the Makefile
# targets so the commands are never duplicated. Cheapest first. One line per passing stage; on
# failure the last 30 lines of that stage's log plus the full-log path are printed and the run
# stops (exit code is the stage's real exit code, never parsed output).
#
# Usage: scripts/gate.sh [--docs-only]
#   --docs-only  run only doc-facts-check, doc-refs-check, gate-wiring-check and test-js (the merge
#                path passes this for PRs that change only *.md files outside the code and test
#                directories). test-js stays, because tests/docs.test.js reads docs/README.md and
#                docs/security.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
[ -f "$ROOT/Makefile" ] && [ -f "$ROOT/package.json" ] || {
  echo "gate.sh: $ROOT is not the repo root (Makefile/package.json missing)" >&2
  exit 2
}

docs_only=0
[ "${1:-}" = "--docs-only" ] && docs_only=1

LOG_DIR="${GATE_LOG_DIR:-${TMPDIR:-/tmp}/buildbanner-gate-logs/$(date +%Y%m%d-%H%M%S)-$$}"
mkdir -p "$LOG_DIR"

run_stage() {
  local name="$1"
  shift
  local log="$LOG_DIR/$name.log"
  local start rc
  start=$(date +%s)
  if "$@" >"$log" 2>&1; then
    echo "gate: ✓ $name ($(( $(date +%s) - start ))s)"
    return 0
  else
    rc=$?
    echo "gate: ✗ $name (exit $rc) — last 30 lines:" >&2
    tail -n 30 "$log" >&2
    echo "gate: full log: $log" >&2
    return "$rc"
  fi
}

stages="doc-facts-check doc-refs-check gate-wiring-check test-ruby test-parity test-python test-js test-tooling"
if [ "$docs_only" = 1 ]; then
  echo "gate: docs-only change; running doc-facts-check, doc-refs-check, gate-wiring-check and test-js only"
  stages="doc-facts-check doc-refs-check gate-wiring-check test-js"
fi

for stage in $stages; do
  run_stage "$stage" make -C "$ROOT" -s "$stage"
done
echo "gate: all stages passed (logs: $LOG_DIR)"

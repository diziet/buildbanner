#!/usr/bin/env bash
# Start work: make worktree b=<type>/<name>. Creates <primary>-worktrees/<b> from the latest
# origin/main as a new branch (not tracking main), installs its own Node, npm packages, .venv and
# Ruby gems (make deps) and the hooks, then prints the `cd`. Refuses when the branch or the
# directory already exists.
#
# TODO: this repo keeps the flat layout (the git root is the primary checkout itself), so trees
# go to a sibling <primary>-worktrees/ directory. Move it to the nested layout by PR.
set -euo pipefail

branch="${1:-}"
[ -n "$branch" ] || { echo "usage: make worktree b=<type>/<name>   e.g. b=feat/my-change" >&2; exit 2; }
case "$branch" in
  main|*/main) echo "worktree: refusing to create a tree for '$branch'" >&2; exit 2 ;;
  */*) ;;
  *) echo "worktree: branch must be <type>/<name> (feat/, fix/, docs/, chore/, ...)" >&2; exit 2 ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
[ -f "$ROOT/Makefile" ] || { echo "worktree: $ROOT is not the repo root" >&2; exit 2; }
cd "$ROOT"
primary="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
target="$primary-worktrees/$branch"

if git show-ref --verify --quiet "refs/heads/$branch"; then
  echo "worktree: branch '$branch' already exists; pick another name or: git worktree add $target $branch" >&2
  exit 1
fi
if [ -e "$target" ]; then
  echo "worktree: $target already exists" >&2
  exit 1
fi

git fetch -q origin main
git worktree add --no-track -b "$branch" "$target" origin/main
make -f "$ROOT/Makefile" -C "$target" -s deps hooks-install
echo "worktree: ready at $target"
echo "cd $target"

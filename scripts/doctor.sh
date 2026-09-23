#!/usr/bin/env bash
# Preflight (seconds, no build, no side effects). Reads the pins from the environment the
# Makefile passes (NODE_VERSION, PYTHON_VERSION, RUBY_BIN, UV, VENV). npm packages are pinned by
# package-lock.json and gems by ruby/Gemfile.lock. Cheapest checks first. Every failure prints the
# fixing command. Fails CLOSED on any drift (exit 1). Probes never trigger an install.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
[ -f "$ROOT/Makefile" ] && [ -f "$ROOT/package.json" ] || {
  echo "doctor: $ROOT is not the repo root (Makefile/package.json missing)" >&2
  exit 2
}
cd "$ROOT"

NODE_VERSION="${NODE_VERSION:?set by the Makefile}"
PYTHON_VERSION="${PYTHON_VERSION:?set by the Makefile}"
RUBY_BIN="${RUBY_BIN:?set by the Makefile}"
UV="${UV:-uv}"
VENV="${VENV:-.venv}"
failures=0

ok()   { echo "doctor: ✓ $1"; }
fail() { echo "doctor: ✗ $1" >&2; echo "         fix: $2" >&2; failures=$((failures + 1)); }

# 1. uv (builds .venv) and gh (make merge, make branches-gc) on PATH.
if command -v "$UV" >/dev/null 2>&1; then
  ok "uv $("$UV" --version | awk '{print $2}') at $(command -v "$UV")"
else
  fail "uv not found on PATH" "brew install uv  (or: curl -LsSf https://astral.sh/uv/install.sh | sh)"
fi
if command -v gh >/dev/null 2>&1; then
  ok "gh at $(command -v gh)"
else
  fail "gh not found on PATH" "brew install gh"
fi

# 2. The pinned Node in .tools/, and node_modules matching package-lock.json.
if node_report="$(NODE_VERSION="$NODE_VERSION" bash scripts/frontend.sh doctor 2>&1)"; then
  ok "Node $NODE_VERSION in .tools/ and the locked npm packages"
else
  fail "Node or npm packages: $(printf '%s' "$node_report" | tail -n 1)" "make node-install"
fi

# 3. The venv's python is the pinned minor version, and it imports buildbanner from this tree.
if [ -x "$VENV/bin/python" ]; then
  actual="$("$VENV/bin/python" -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
  if [ "$actual" = "$PYTHON_VERSION" ]; then
    ok "$VENV/bin/python is $("$VENV/bin/python" --version | awk '{print $2}')"
  else
    fail "$VENV/bin/python is $actual, pin is $PYTHON_VERSION" "rm -rf $VENV && make venv"
  fi
  origin="$("$VENV/bin/python" -c 'import importlib.util as u; s = u.find_spec("buildbanner"); print(s.origin if s else "")')"
  if [ "$origin" = "$ROOT/python/buildbanner/__init__.py" ]; then
    ok "buildbanner in $VENV is this tree's python/ (editable)"
  else
    fail "buildbanner in $VENV resolves to '${origin:-nothing}', not $ROOT/python" "make venv"
  fi
else
  fail "$VENV/bin/python missing" "make venv"
fi

# 4. RUBY_BIN's Ruby satisfies ruby/buildbanner.gemspec, and ruby/vendor/bundle has every gem in
# ruby/Gemfile.lock. `bundle check` only reads; it does not install the locked Bundler.
if [ -x "$RUBY_BIN/ruby" ] && [ -x "$RUBY_BIN/bundle" ]; then
  ruby_version="$("$RUBY_BIN/ruby" -e 'print RUBY_VERSION')"
  if "$RUBY_BIN/ruby" -e 'spec = Gem::Specification.load("ruby/buildbanner.gemspec")
                         exit(spec.required_ruby_version.satisfied_by?(Gem::Version.new(RUBY_VERSION)))'; then
    ok "Ruby $ruby_version at $RUBY_BIN satisfies ruby/buildbanner.gemspec"
  else
    fail "Ruby $ruby_version at $RUBY_BIN is below ruby/buildbanner.gemspec's required_ruby_version" \
      "brew upgrade ruby  (the devops Brewfile installs it)"
  fi
  if (cd ruby && PATH="$RUBY_BIN:$PATH" BUNDLE_PATH=vendor/bundle "$RUBY_BIN/bundle" check >/dev/null 2>&1); then
    ok "ruby/vendor/bundle has the gems in ruby/Gemfile.lock"
  else
    fail "ruby/vendor/bundle is missing gems from ruby/Gemfile.lock" "make bundle"
  fi
else
  fail "no ruby and bundle in $RUBY_BIN" "brew install ruby  (the devops Brewfile installs it)"
fi

# 5. Hooks installed.
hooks_path="$(git config core.hooksPath || true)"
if [ "$hooks_path" = ".githooks" ]; then
  ok "core.hooksPath=.githooks"
else
  fail "core.hooksPath is '${hooks_path:-unset}', expected .githooks" "make hooks-install"
fi

if [ "$failures" -gt 0 ]; then
  echo "doctor: $failures problem(s); fix commands above" >&2
  exit 1
fi
echo "doctor: healthy"

#!/usr/bin/env bash
# Preflight check for BuildBanner Ruby development environment.
# Verifies Ruby >= 3.1 and Bundler >= 2.4 are installed.

set -euo pipefail

MIN_RUBY_MAJOR=3
MIN_RUBY_MINOR=1
MIN_BUNDLER_MAJOR=2
MIN_BUNDLER_MINOR=4

check_ruby() {
  if ! command -v ruby &>/dev/null; then
    echo "ERROR: Ruby is not installed. Install Ruby >= ${MIN_RUBY_MAJOR}.${MIN_RUBY_MINOR}."
    exit 1
  fi

  local version
  version=$(ruby -e 'puts RUBY_VERSION')
  local major minor
  major=$(echo "$version" | cut -d. -f1)
  minor=$(echo "$version" | cut -d. -f2)

  if (( major < MIN_RUBY_MAJOR || (major == MIN_RUBY_MAJOR && minor < MIN_RUBY_MINOR) )); then
    echo "ERROR: Ruby ${version} is too old. Minimum required: ${MIN_RUBY_MAJOR}.${MIN_RUBY_MINOR}."
    echo "  Install a newer Ruby via rbenv, rvm, or your package manager."
    exit 1
  fi

  echo "OK: Ruby ${version}"
}

check_bundler() {
  if ! command -v bundle &>/dev/null; then
    echo "ERROR: Bundler is not installed. Run: gem install bundler"
    exit 1
  fi

  local version
  version=$(bundle --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
  local major minor
  major=$(echo "$version" | cut -d. -f1)
  minor=$(echo "$version" | cut -d. -f2)

  if (( major < MIN_BUNDLER_MAJOR || (major == MIN_BUNDLER_MAJOR && minor < MIN_BUNDLER_MINOR) )); then
    echo "ERROR: Bundler ${version} is too old for Ruby 3.4+. Run: gem install bundler"
    exit 1
  fi

  echo "OK: Bundler ${version}"
}

echo "Checking BuildBanner Ruby environment..."
check_ruby
check_bundler
echo "All checks passed."

#!/usr/bin/env bash
# Preflight check for BuildBanner Ruby development environment.
# Verifies Ruby >= 3.1 and Bundler >= 2.4 are installed.

set -euo pipefail

MIN_RUBY_MAJOR=3
MIN_RUBY_MINOR=1
MIN_BUNDLER_MAJOR=2
MIN_BUNDLER_MINOR=4

# Verify version meets minimum major.minor requirement.
check_minimum_version() {
  local version="$1" min_major="$2" min_minor="$3" label="$4"
  local install_hint="${5:-}"
  local major minor
  major=$(echo "$version" | cut -d. -f1)
  minor=$(echo "$version" | cut -d. -f2)

  if (( major < min_major || (major == min_major && minor < min_minor) )); then
    echo "ERROR: ${label} ${version} is too old. Minimum required: ${min_major}.${min_minor}.${install_hint:+ ${install_hint}}"
    exit 1
  fi

  echo "OK: ${label} ${version}"
}

echo "Checking BuildBanner Ruby environment..."

# Check Ruby
if ! command -v ruby &>/dev/null; then
  echo "ERROR: Ruby is not installed. Install via rbenv, rvm, or your package manager."
  exit 1
fi
ruby_version=$(ruby -e 'puts RUBY_VERSION')
check_minimum_version "$ruby_version" "$MIN_RUBY_MAJOR" "$MIN_RUBY_MINOR" "Ruby" \
  "Install via rbenv, rvm, or your package manager."

# Check Bundler
if ! command -v bundle &>/dev/null; then
  echo "ERROR: Bundler is not installed. Run: gem install bundler"
  exit 1
fi
bundler_version=$(bundle --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
check_minimum_version "$bundler_version" "$MIN_BUNDLER_MAJOR" "$MIN_BUNDLER_MINOR" "Bundler" \
  "Run: gem install bundler"

echo "All checks passed."

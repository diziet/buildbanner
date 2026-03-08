#!/usr/bin/env bash
# Preflight check for BuildBanner Ruby development environment.
# Verifies Ruby >= 3.1 and Bundler >= 2.4 are installed.

set -euo pipefail

MIN_RUBY_MAJOR=3
MIN_RUBY_MINOR=1
MIN_BUNDLER_MAJOR=2
MIN_BUNDLER_MINOR=4

# Usage: check_version <cmd> <version_cmd> <min_major> <min_minor> <label> [install_hint]
check_version() {
  local cmd="$1" version_cmd="$2" min_major="$3" min_minor="$4" label="$5"
  local install_hint="${6:-}"

  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: ${label} is not installed.${install_hint:+ ${install_hint}}"
    exit 1
  fi

  local version major minor
  version=$(eval "$version_cmd")
  major=$(echo "$version" | cut -d. -f1)
  minor=$(echo "$version" | cut -d. -f2)

  if (( major < min_major || (major == min_major && minor < min_minor) )); then
    echo "ERROR: ${label} ${version} is too old. Minimum required: ${min_major}.${min_minor}.${install_hint:+ ${install_hint}}"
    exit 1
  fi

  echo "OK: ${label} ${version}"
}

echo "Checking BuildBanner Ruby environment..."
check_version ruby "ruby -e 'puts RUBY_VERSION'" \
  "$MIN_RUBY_MAJOR" "$MIN_RUBY_MINOR" "Ruby" \
  "Install via rbenv, rvm, or your package manager."
check_version bundle "bundle --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+'" \
  "$MIN_BUNDLER_MAJOR" "$MIN_BUNDLER_MINOR" "Bundler" \
  "Run: gem install bundler"
echo "All checks passed."

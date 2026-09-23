#!/usr/bin/env bash
# Worktree-local Node toolchain: the pinned Node in .tools/ and the npm workspaces (client/, node/)
# installed from the root package-lock.json. Doctor fails closed and never installs.
#
# Usage: NODE_VERSION=<pin> scripts/frontend.sh install | lock | doctor | exec <dir> <command...>
#   exec  runs <command...> in <dir> with the pinned Node first on PATH, so npm, npx and the
#         `#!/usr/bin/env node` scripts in node_modules/.bin all run under the pin.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
[ -f "$ROOT/Makefile" ] && [ -f "$ROOT/package.json" ] || {
  echo "frontend: $ROOT is not the repo root (Makefile/package.json missing)" >&2
  exit 2
}
cd "$ROOT"
: "${NODE_VERSION:?set by Makefile}"
platform="$(uname -s | tr '[:upper:]' '[:lower:]')"
architecture="$(uname -m)"
[ "$architecture" != x86_64 ] || architecture=x64
[ "$architecture" != aarch64 ] || architecture=arm64
archive="node-v${NODE_VERSION}-${platform}-${architecture}"
tool_dir="$ROOT/.tools/$archive"
export PATH="$tool_dir/bin:$PATH"

probe() {
  [ -x "$tool_dir/bin/node" ] || { echo 'frontend: pinned Node missing; run make node-install' >&2; return 1; }
  [ "$("$tool_dir/bin/node" --version)" = "v$NODE_VERSION" ] || { echo 'frontend: Node version drift' >&2; return 1; }
}

install_runtime() {
  if [ ! -x "$tool_dir/bin/node" ]; then
    local temp checksum
    temp="$(mktemp -d)"
    trap 'rm -rf "$temp"' RETURN
    curl --fail --silent --show-error --location --max-time 120 "https://nodejs.org/dist/v$NODE_VERSION/$archive.tar.gz" -o "$temp/$archive.tar.gz"
    curl --fail --silent --show-error --location --max-time 30 "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" -o "$temp/SHASUMS256.txt"
    checksum="$(awk -v name="$archive.tar.gz" '$2 == name {print $1}' "$temp/SHASUMS256.txt")"
    [ -n "$checksum" ] && [ "$(shasum -a 256 "$temp/$archive.tar.gz" | awk '{print $1}')" = "$checksum" ] || { echo 'frontend: Node checksum failed' >&2; return 1; }
    mkdir -p "$ROOT/.tools"
    tar -xzf "$temp/$archive.tar.gz" -C "$ROOT/.tools"
  fi
  probe
}

command="${1:?frontend command required}"
shift
case "$command" in
  install) install_runtime; npm ci --ignore-scripts --no-audit --no-fund ;;
  lock) install_runtime; npm install --package-lock-only --ignore-scripts --no-audit --no-fund ;;
  doctor) probe; npm ls --depth=0 >/dev/null; echo "frontend: Node $NODE_VERSION and locked direct dependencies ready" ;;
  exec)
    probe
    dir="${1:?exec needs <dir> <command...>}"
    shift
    [ "$#" -gt 0 ] || { echo 'frontend: exec needs a command after the directory' >&2; exit 2; }
    cd "$dir"
    exec "$@"
    ;;
  *) echo "frontend: unknown command $command" >&2; exit 2 ;;
esac

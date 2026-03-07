#!/bin/sh
# Generates buildbanner.json from BUILDBANNER_* environment variables.
# Usage: entrypoint.sh [output_path]
#   output_path defaults to /usr/share/nginx/html/buildbanner.json

set -e

OUTPUT_PATH="${1:-/usr/share/nginx/html/buildbanner.json}"

SHA="${BUILDBANNER_SHA:-}"
SHA_FULL="${BUILDBANNER_SHA_FULL:-}"
BRANCH="${BUILDBANNER_BRANCH:-}"
APP_NAME="${BUILDBANNER_APP_NAME:-}"
ENVIRONMENT="${BUILDBANNER_ENVIRONMENT:-}"
REPO_URL="${BUILDBANNER_REPO_URL:-}"
SERVER_STARTED="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# Derive short sha from full if not provided
if [ -z "$SHA" ] && [ -n "$SHA_FULL" ]; then
  SHA="$(printf '%s' "$SHA_FULL" | cut -c1-7)"
fi

# Escape JSON-special characters in a string value
json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/	/\\t/g'
}

# Build custom fields from BUILDBANNER_CUSTOM_* env vars
build_custom_json() {
  custom_entries=""
  for var in $(env | grep '^BUILDBANNER_CUSTOM_' | cut -d= -f1); do
    value="$(printenv "$var")"
    suffix="${var#BUILDBANNER_CUSTOM_}"
    suffix_lower="$(printf '%s' "$suffix" | tr '[:upper:]' '[:lower:]')"
    escaped="$(json_escape "$value")"
    if [ -n "$custom_entries" ]; then
      custom_entries="${custom_entries},"
    fi
    custom_entries="${custom_entries}\"${suffix_lower}\":\"${escaped}\""
  done
  if [ -n "$custom_entries" ]; then
    printf '{%s}' "$custom_entries"
  fi
}

CUSTOM_JSON="$(build_custom_json)"

# Helper: format a value as escaped JSON string or null
json_str_or_null() {
  if [ -n "$1" ]; then
    printf '"%s"' "$(json_escape "$1")"
  else
    printf 'null'
  fi
}

# Build JSON parts
JSON="{"
JSON="${JSON}\"_buildbanner\":{\"version\":1}"
JSON="${JSON},\"sha\":$(json_str_or_null "$SHA")"
JSON="${JSON},\"branch\":$(json_str_or_null "$BRANCH")"
JSON="${JSON},\"sha_full\":$(json_str_or_null "$SHA_FULL")"
JSON="${JSON},\"server_started\":\"${SERVER_STARTED}\""

if [ -n "$APP_NAME" ]; then
  JSON="${JSON},\"app_name\":\"$(json_escape "$APP_NAME")\""
fi
if [ -n "$ENVIRONMENT" ]; then
  JSON="${JSON},\"environment\":\"$(json_escape "$ENVIRONMENT")\""
fi
if [ -n "$REPO_URL" ]; then
  JSON="${JSON},\"repo_url\":\"$(json_escape "$REPO_URL")\""
fi
if [ -n "$CUSTOM_JSON" ]; then
  JSON="${JSON},\"custom\":${CUSTOM_JSON}"
fi

JSON="${JSON}}"

printf '%s\n' "$JSON" > "$OUTPUT_PATH"

echo "BuildBanner JSON written to $OUTPUT_PATH"

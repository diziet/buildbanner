# Shared Contract

The cross-language test fixtures and the JSON Schema that define the BuildBanner response contract. Every server helper (Python, Ruby, Node) must produce the same output for the same input.

## JSON Schema

`schema.json` — the JSON Schema (draft-07) of the `/buildbanner.json` response.

- **Required fields**: `sha` (string or null), `branch` (string or null).
- **Optional fields**: `_buildbanner`, `sha_full`, `commit_date`, `repo_url`, `server_started`, `deployed_at`, `environment`, `port`, `app_name`, `tests`, `build`, `custom`.
- `additionalProperties: false` — unknown fields are rejected.

## Test Fixtures

`test_fixtures.json` — input and output pairs that the test suites of all three languages load.

### Sections

| Key | Purpose |
|-----|---------|
| `url_sanitization` | Array of `{ input, expected }` for repo URL cleaning |
| `branch_detection` | Array of `{ input, tag, expected }` for detached HEAD logic |
| `valid_responses` | Array of `{ description, payload }` — valid JSON payloads |
| `env_var_mapping` | Map of `BUILDBANNER_*` env vars to JSON fields |

### Loading Fixtures

**JavaScript**

```js
import { readFileSync } from "fs";
const fixtures = JSON.parse(readFileSync("shared/test_fixtures.json", "utf-8"));

for (const { input, expected } of fixtures.url_sanitization) {
  expect(sanitizeUrl(input)).toBe(expected);
}
```

**Python**

```python
import json
from pathlib import Path

fixtures = json.loads(Path("shared/test_fixtures.json").read_text())

for case in fixtures["url_sanitization"]:
    assert sanitize_url(case["input"]) == case["expected"]
```

**Ruby**

```ruby
require "json"

fixtures = JSON.parse(File.read("shared/test_fixtures.json"))

fixtures["url_sanitization"].each do |c|
  expect(sanitize_url(c["input"])).to eq(c["expected"])
end
```

## `BUILDBANNER_CUSTOM_*` Derivation Rule

Each environment variable that matches `BUILDBANNER_CUSTOM_*` becomes an entry in the `custom` object:

1. Strip the `BUILDBANNER_CUSTOM_` prefix.
2. Lowercase the remaining suffix.
3. Use it as the key in `custom`.

Example: `BUILDBANNER_CUSTOM_MODEL=gpt4` produces `"custom": { "model": "gpt4" }`.

The `custom` values from the `extras` callback are merged with the ones from environment variables. When both set the same key, the `extras` value wins.

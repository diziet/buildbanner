# Cross-Language Parity Tests

## What is "parity"?

These tests enforce that all three server helper implementations (Node, Python, Ruby) produce **identical JSON output** given the same input. "Same input" means:

- The same `shared/test_fixtures.json` fixture data
- The same mocked git subprocess responses
- The same `BUILDBANNER_CUSTOM_*` environment variables

"Same output" means the resulting JSON has:

- Identical `repo_url` values for all URL sanitization cases
- Identical `branch` values for all branch detection cases
- Identical custom field stringification (integers become strings, nulls are omitted)
- `_buildbanner.version` is always `1`
- Both `sha` (7 chars) and `sha_full` (40 chars) are emitted
- `BUILDBANNER_CUSTOM_*` env vars produce identical `custom` maps (lowercased suffix keys)
- The same top-level field names and JSON structure

## Running each language's parity suite

### Node (Vitest)

```bash
cd <repo-root>
npx vitest run tests/parity/node.test.js
```

### Python (pytest)

```bash
cd <repo-root>/python
pip install -e ".[test]"
cd <repo-root>
python -m pytest tests/parity/test_python.py -v
```

### Ruby (RSpec)

```bash
cd <repo-root>/ruby
bundle install
cd <repo-root>
bundle exec --gemfile=ruby/Gemfile rspec tests/parity/ruby_parity_spec.rb
```

### Run all three

```bash
# From repo root
npx vitest run tests/parity/node.test.js && \
python -m pytest tests/parity/test_python.py -v && \
bundle exec --gemfile=ruby/Gemfile rspec tests/parity/ruby_parity_spec.rb
```

## Shared fixtures

All tests load `shared/test_fixtures.json`. Adding a new fixture case there automatically adds a test case to all three languages.

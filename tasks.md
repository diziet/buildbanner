# BuildBanner Implementation Guide

BuildBanner is a crash-proof, language-agnostic developer info banner for web apps. It consists of a zero-dependency client JS widget that fetches a JSON endpoint and renders a thin banner with git info, uptime, status indicators, and custom fields — plus server helper libraries for Python, Ruby, and Node that serve the JSON with one-liner middleware. This task list is ordered so each task produces a working, testable commit and dependencies flow strictly downward. A minimal working banner exists by Task 6; every subsequent task extends it. The design spec (`buildbanner-design-spec.md`) is the authoritative reference for all architectural decisions.

Convention: All client code lives under `client/`, server helpers under `python/`, `ruby/`, `node/`. Shared fixtures live in `shared/`. Every task names its exact files and test file. All DOM content uses `textContent` / `createElement` (never `innerHTML`). All styles are class-based CSS inside the Shadow DOM — no inline `style=""` attributes (CSP safety). All timestamps are ISO 8601 UTC. The client never throws — every public entry point is wrapped in try/catch. Server helpers never throw — they degrade gracefully. Every server helper response includes `_buildbanner: { version: 1 }`, both `sha` (short 7-char) and `sha_full` (full 40-char), and `server_started` (ISO 8601 UTC, auto-recorded at process boot). Environment variables matching `BUILDBANNER_CUSTOM_*` map to `custom` entries where the key is the lowercased suffix after `BUILDBANNER_CUSTOM_` (e.g. `BUILDBANNER_CUSTOM_MODEL=gpt4` → `custom.model`). The `extras` callback's `custom` values merge with env-var custom values, with extras winning on key conflict. `BUILDBANNER_TOKEN` env var sets the auth token if `options.token` is not provided programmatically; programmatic wins. The banner host element has `data-testid="buildbanner"` and each segment has a `data-segment` attribute (e.g. `"sha"`, `"branch"`, `"app-name"`, `"custom-{key}"`) for integration test querying. All server helper tests must mock git subprocess/exec calls — tests must not depend on a `.git` directory or `git` binary being present in the test environment. Tests use the frameworks already present in each ecosystem (Vitest for JS, pytest for Python, RSpec for Ruby).

---

## Task 1: Project scaffold and monorepo structure

Create the top-level directory structure and configuration files for the monorepo. Create `package.json` at the root with `name: "buildbanner-monorepo"`, `private: true`, and a `workspaces` array pointing to `client/`, `node/`. Create `client/package.json` with `name: "buildbanner"`, entry `"main": "buildbanner.js"`. Create `node/package.json` with `name: "buildbanner-server"` (server helpers are a separate package from the client). Create `python/pyproject.toml` with project name `buildbanner`, version `0.1.0`, and python `>=3.8`. Create `ruby/buildbanner.gemspec` with `name: "buildbanner"`, `version: "0.1.0"`. Create empty placeholder files: `client/buildbanner.js`, `node/index.js`, `node/server.js`, `python/buildbanner/__init__.py`, `ruby/lib/buildbanner.rb`. Create `shared/` directory with empty `schema.json` and `test_fixtures.json`. Create `LICENSE` with MIT text. Create `.gitignore` covering `node_modules/`, `dist/`, `__pycache__/`, `*.egg-info/`. Include test dependency setup: add `vitest` and `supertest` as devDependencies in `node/package.json`, add `pytest` in `python/pyproject.toml` `[project.optional-dependencies.test]`, add `rspec` and `rack-test` in `ruby/Gemfile`. Write `tests/scaffold.test.js` (Vitest) covering: all expected directories exist, all placeholder files exist, root `package.json` has correct workspaces, `client/package.json` has correct name and main entry.

---

## Task 2: JSON Schema, shared fixtures, and cross-language test contract

Create `shared/schema.json` as a JSON Schema (draft-07) defining the BuildBanner response contract. Required properties: `sha` (string or null), `branch` (string or null). Optional properties: `_buildbanner` (object with `version` integer), `sha_full` (string), `commit_date` (string, format date-time), `repo_url` (string or null), `server_started` (string, format date-time), `deployed_at` (string, format date-time), `environment` (string), `port` (integer), `app_name` (string), `tests` (object with `status` enum `["pass","fail","running","idle"]`, optional `summary` string, optional `url` string), `build` (object with `status` enum `["fresh","stale","building"]`, optional `summary` string, optional `url` string), `custom` (object with `additionalProperties: { type: "string" }`). Create `shared/test_fixtures.json` containing: (a) `url_sanitization` — an array of `{ input, expected }` objects matching every row in the spec's URL Sanitization Fixtures section (13 entries including empty and no-remote cases), formatted so all three languages (JS, Python, Ruby) can load and iterate directly without transformation, (b) `branch_detection` — an array of `{ input, tag, expected }` matching the spec's Branch Detection Fixtures (4 entries), (c) `valid_responses` — 3 example valid JSON payloads (minimal with only sha+branch; full with all fields including `_buildbanner.version`, `sha_full`, `server_started`, `deployed_at`, `app_name`, `environment`, `port`; and one with custom fields), (d) `env_var_mapping` — a map documenting each `BUILDBANNER_*` env var and its corresponding JSON field: `BUILDBANNER_SHA`→`sha`/`sha_full`, `BUILDBANNER_BRANCH`→`branch`, `BUILDBANNER_REPO_URL`→`repo_url`, `BUILDBANNER_COMMIT_DATE`→`commit_date`, `BUILDBANNER_DEPLOYED_AT`→`deployed_at`, `BUILDBANNER_APP_NAME`→`app_name`, `BUILDBANNER_ENVIRONMENT`→`environment`, `BUILDBANNER_PORT`→`port`, `BUILDBANNER_CUSTOM_*`→`custom.*`, `BUILDBANNER_TOKEN`→`token`. Create `shared/README.md` documenting: the JSON schema location, the fixture file format with examples of loading in JS/Python/Ruby, the shared contract (all languages must produce identical output for identical input), and the `BUILDBANNER_CUSTOM_*` derivation rule. Write `tests/schema.test.js` covering: schema is valid JSON Schema, each `valid_responses` fixture validates against the schema, a response missing `sha` fails validation, a response with non-string `custom` value fails validation, `_buildbanner.version` accepts integer only, `port` accepts integer only, `test_fixtures.json` is valid JSON and contains all expected keys.

---

## Task 3: Client build pipeline

Set up the client build tooling. This task is toolchain-only — it builds against the placeholder `client/buildbanner.js` from Task 1 as the entry point. Task 6 later creates the real `client/src/main.js` and the build naturally picks it up. Install `esbuild` as a dev dependency in `client/package.json`. Add npm scripts: `"build"` (bundles `buildbanner.js` → `dist/buildbanner.min.js` with minification, no external dependencies, IIFE format, target `es2017`; also outputs `dist/buildbanner.js` unminified), `"size"` (runs build then checks gzipped size < 3072 bytes using a Node script `scripts/check-size.js`). Create `client/scripts/check-size.js` that gzips `dist/buildbanner.min.js` using Node's `zlib.gzipSync`, checks byte length, exits 1 with an error message if over budget, exits 0 with the size printed otherwise. Install `vitest` and `jsdom` as dev dependencies. Create `client/vitest.config.js` with jsdom environment. Write `client/tests/build.test.js` covering: `dist/buildbanner.min.js` exists after build, file is valid JavaScript (no syntax errors via `new Function()`), gzipped size is under 3072 bytes, output is IIFE (contains no `import`/`export` statements), source contains no `eval()` or `innerHTML`.

---

## Task 4: Client config parsing

Create `client/src/config.js` exporting `parseConfig(scriptElement)` and `resolveConfig(dataAttrs, programmaticOpts)`. `parseConfig` reads `data-*` attributes from the `<script>` element: `data-endpoint` (default `"/buildbanner.json"`), `data-position` (default `"top"`, valid: `"top"`, `"bottom"`), `data-theme` (default `"dark"`, valid: `"dark"`, `"light"`, `"auto"`), `data-dismiss` (default `"session"`, valid: `"session"`, `"permanent"`, `"none"`), `data-env-hide` (default `null`, parsed as comma-separated list), `data-height` (default `28`, clamped to 24–48), `data-debug` (default `false`), `data-poll` (default `0`, integer seconds), `data-push` (default `true`, boolean), `data-token` (default `null`), `data-manual` (default `false`, boolean). `resolveConfig` merges data-attribute config with programmatic options (programmatic wins); accepted programmatic-only options include `zIndex` (default `999999`) and `hostPatterns` (default `[]`, array of `{ host, commitPath, treePath }` for custom Git host link generation — see Task 12). Export a `DEFAULT_CONFIG` constant. Write `client/tests/config.test.js` covering: defaults are correct when no attributes set, each attribute is parsed to the correct type, `data-height` clamped to min 24 and max 48, `data-poll` parsed as integer, `data-push` "false" string → boolean false, `data-env-hide` splits on commas and trims whitespace, programmatic options override data attributes, `zIndex` accepted programmatically, `hostPatterns` accepted programmatically, unknown attributes are ignored, missing script element returns defaults.

---

## Task 5: Diagnostic logging module

Create `client/src/logger.js` exporting `createLogger(debugEnabled)`. Returns an object with a `log(message)` method. Every call emits `console.debug("[BuildBanner] " + message)`. If `debugEnabled` is true, also emits `console.warn("[BuildBanner] " + message)`. The logger tracks a call count per instance and stops emitting after 20 calls (session cap). Export `LOG_CAP = 20` constant. Write `client/tests/logger.test.js` covering: `log()` always calls `console.debug`, `log()` calls `console.warn` only when debug enabled, messages are prefixed with `[BuildBanner]`, 21st call is silently dropped (cap at 20), cap is per logger instance (two instances have separate counts), `console.debug` and `console.warn` receive identical message text when both fire.

---

## Task 6: Vertical slice — minimal working banner

Create the minimal end-to-end client that fetches, renders, and cleans up. This task pulls together thin layers of fetch, DOM, rendering, and lifecycle into a working banner that subsequent tasks will extend.

Create `client/src/fetch.js` exporting `fetchBannerData(endpoint, options)`. Calls `fetch(endpoint)` with a 3-second `AbortController` timeout. If `options.token` is set, adds `Authorization: Bearer <token>` header. If `options.isRefetch` is true, adds `Cache-Control: no-cache` header (initial fetch must NOT send this header). Validates that the response is well-formed JSON with a top-level object; does NOT reject based on null or missing fields — returns the parsed data regardless. If `sha` is null, `branch` is null, or any other field is missing, return the full parsed object anyway and let `renderSegments` skip null fields. The client renders whatever's present, not refuse the entire payload because git was unavailable. Returns `null` only on transport/format failures (non-200 status, timeout, network error, invalid JSON, HTML-instead-of-JSON response). All failures are logged via the logger from Task 5. Never throws.

Create `client/src/dom.js` exporting `createBannerHost(config)` and `destroyBannerHost(host)`. `createBannerHost` creates a `<build-banner>` custom element with `data-testid="buildbanner"`, attaches a Shadow DOM (`mode: "open"`), injects a `<style>` block inside the shadow root with base banner CSS (dark theme as default, monospace font stack: `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace`), and applies `all: initial` on the shadow root's top-level wrapper `div`. The wrapper has `role="toolbar"`, `aria-label="Build information banner"`. Applies `position: sticky`, `z-index` from config (default `999999`), `height` from config (default `28px`), `overflow: hidden`, `text-overflow: ellipsis`, `white-space: nowrap`. All styles are class-based CSS inside the shadow root — no inline `style=""` attributes. If `attachShadow` is unavailable (feature detection), falls back to a regular `<div>` with `.__buildbanner-host` class and namespaced `.__buildbanner-*` selectors with explicit resets for inheritable properties injected via a `<style>` tag in `<head>` (only in this fallback path — note: this fallback will inject a `<style>` into `<head>`, which may trigger CSP `style-src` violations in strict environments; Shadow DOM is the primary path and has no such issue). Returns `{ host, shadowRoot, wrapper }`. Prepends host to `<body>` as first child (or appends if `config.position === "bottom"`). `destroyBannerHost` removes the host element from the DOM.

Create `client/src/main.js` as the entry point. Exposes `window.BuildBanner` with `init(opts)`, `destroy()`, and `isVisible()`. On `DOMContentLoaded`, auto-detects `<script>` tag with `src` containing `"buildbanner"`, calls `parseConfig` (Task 4), and auto-initializes unless `data-manual` is set. `init`: creates logger (Task 5), fetches data, creates banner host, renders `branch` and `sha` as plain `<span>` elements (each with `data-segment="branch"` and `data-segment="sha"`) separated by ` · `. Entire init is wrapped in try/catch — any error hides the banner silently. Singleton guard: tracks active instance via `window[Symbol.for("buildbanner")]` with `window.__buildBannerInstance` fallback; second `init()` is a no-op with `console.debug` message. `destroy()`: removes banner DOM, marks instance as destroyed. `isVisible()`: returns boolean. Update `client/buildbanner.js` to re-export from `src/main.js`.

Write `client/tests/fetch.test.js` using `vi.fn()` to mock global `fetch`. Covering: successful fetch returns parsed data, 404 returns null, 500 returns null, network error returns null, timeout after 3s returns null, invalid JSON returns null, HTML response (content-type text/html) returns null, response with null sha is accepted and returned, response with null branch is accepted and returned, token is sent as Bearer header when configured, `Cache-Control: no-cache` is NOT sent on initial fetch, `Cache-Control: no-cache` IS sent when `isRefetch` is true, no `Authorization` header when token is null.

Write `client/tests/dom.test.js` covering: creates `<build-banner>` element, host has `data-testid="buildbanner"`, attaches shadow root, wrapper has `all: initial` style, `role="toolbar"` set, `aria-label` set, height matches config, z-index matches config or default 999999, position is sticky, overflow is hidden, font-family is monospace, no `<style>` tag injected into document `<head>` in Shadow DOM path, host is first child of `<body>` for position top, host is last child of `<body>` for position bottom, fallback mode creates div with correct classes when `attachShadow` is stubbed out, `destroyBannerHost` removes element from DOM.

Write `client/tests/main.test.js` covering: auto-init on DOMContentLoaded renders banner with sha and branch segments, `data-manual` prevents auto-init, manual `init()` renders banner, singleton guard blocks second init with `console.debug` message, `destroy()` removes banner DOM, `isVisible()` returns true when rendered and false after destroy, non-200 endpoint → no banner (no error thrown), timeout → no banner, `Symbol.for("buildbanner")` tracks instance, fallback `__buildBannerInstance` used when Symbol unavailable.

---

## Task 7: Time formatting module

Create `client/src/time.js` exporting `formatUptime(serverStartedISO)`, `formatDeployAge(deployedAtISO)`, and `startUptimeTicker(element, serverStartedISO)`. `formatUptime` computes elapsed time from `server_started` to now and returns human-readable string (e.g. "up 2h 15m", "up 3d 1h", "up 45s"). `formatDeployAge` computes elapsed time from `deployed_at` to now and returns (e.g. "deployed 3h ago"). `startUptimeTicker` updates the element's `textContent` every 60 seconds (for always-live uptime display without polling). Returns a timer ID for cleanup. Write `client/tests/time.test.js` covering: uptime formats seconds correctly ("up 45s"), uptime formats minutes ("up 12m"), uptime formats hours+minutes ("up 2h 15m"), uptime formats days ("up 3d 1h"), deploy age formats correctly ("deployed 3h ago"), `startUptimeTicker` updates element text after 60 seconds (use `vi.useFakeTimers`), ticker returns clearable timer ID, null `server_started` returns null, null `deployed_at` returns null, both present → both strings returned, ISO 8601 with timezone offset parsed correctly.

---

## Task 8: Fix Task 4 review issues (config parsing)

Address code review findings from PR #7. All changes are in `client/src/config.js` and `client/tests/config.test.js`.

1. **Validate programmatic options in `resolveConfig`**: Currently `resolveConfig` blindly assigns programmatic values without validation. Extract the validation logic (`_validateEnum`, `_parseHeight`, `_parsePoll`, `_parseBool`) and apply it to programmatic values too, or run the merged config through a single `_validateConfig()` pass before returning.
2. **Defensive copy `envHide` array**: `hostPatterns` gets a defensive copy but `envHide` does not. Add `if (Array.isArray(merged.envHide)) merged.envHide = [...merged.envHide];` alongside the `hostPatterns` copy.
3. **Fix early-return path skipping defensive copies**: When `programmaticOpts` is null/undefined, the early return skips the `hostPatterns` (and now `envHide`) defensive copies. Move the copies before the early return.
4. **Fix prototype pollution via `in` operator**: Replace `if (!(key in DEFAULT_CONFIG))` with `if (!Object.hasOwn(DEFAULT_CONFIG, key))` in the programmatic options loop.
5. **DRY: Extract `_parseIntOrDefault` helper**: `_parseHeight` and `_parsePoll` share identical parseInt-with-fallback logic. Extract a shared `_parseIntOrDefault(value, defaultValue)` and let each caller apply its own post-processing (clamping, negative rejection).
6. **DRY: Use `== null` instead of `=== null || === undefined`**: Simplify the 5 repeated null-or-undefined guards in the parser functions.
7. Update tests to cover: invalid programmatic values are rejected/normalized, prototype pollution keys are ignored, `envHide` mutation doesn't corrupt shared defaults, early-return path produces independent array copies.

---

## Task 9: Fix Task 5 review issues (logging and schema)

Address code review findings from PR #5. Changes span `shared/schema.json`, `tests/schema.test.js`, `tests/scaffold.test.js`, and dependency declarations.

1. **Add `minLength` to `sha` field in `shared/schema.json`**: Currently `sha` has `maxLength: 7` but no `minLength`, allowing empty strings. Add `"minLength": 7` so empty strings fail validation (null is already accepted via the type union).
2. **Restore deleted `env_var_mapping` tests**: The merger rejected PR #5 because two tests were removed — `"env_var_mapping entries have consistent structure"` and `"env_var_mapping field references exist in schema properties"`. Restore these tests in `tests/schema.test.js`.
3. **Restore exact fixture array length assertions**: The merger noted that `url_sanitization.length` (13), `branch_detection.length` (4), and `valid_responses.length` (3) were weakened to `> 0`. Restore the exact counts to catch accidental fixture deletion.
4. **Pin `ajv` and `ajv-formats` versions**: In `node/package.json`, change `"^8.18.0"` → `"8.18.0"` and `"^3.0.1"` → `"3.0.1"` to match the project's pinning convention.
5. **Add test dependencies to root `package.json`**: Add `vitest`, `ajv`, and `ajv-formats` as devDependencies in the root `package.json` so `tests/` doesn't rely on implicit workspace hoisting.

---

## Task 10: Fix Task 6 review issues (vertical slice)

Address code review findings from PR #8. Changes span `client/src/main.js`, `client/src/dom.js`, `client/src/fetch.js`, `client/buildbanner.js`, and their test files.

1. **Fix fallback style tag leak in `dom.js`**: In the non-Shadow DOM path, `createBannerHost` injects a `<style>` tag into `<head>` but `destroyBannerHost` never removes it. Return the fallback style element as part of the return value (e.g., `{ host, shadowRoot, wrapper, fallbackStyle }`) and remove it in `destroyBannerHost`.
2. **Fix race condition on concurrent `init()` calls in `main.js`**: Mark the instance as "pending" immediately upon entering `init()`, before the async `fetchBannerData`, to prevent two concurrent calls from both passing the singleton guard.
3. **Remove unreachable `__buildBannerInstance` fallback**: The `Symbol.for` fallback is dead code in ES module environments. Remove the dual-write pattern and use only `window[SYMBOL_KEY]`.
4. **Add `document.body` null guard in `dom.js`**: Before `document.body.insertBefore(...)`, check that `document.body` is not null. Log a warning via the logger if it is and return null.
5. **Remove dead `isRefetch` parameter from `fetch.js`**: No caller passes `isRefetch`. Remove it until a feature (e.g., polling in Task 13) actually uses it. Keep the test as a commented reference for when it's reintroduced.
6. **Fix contract drift in `buildbanner.js` docstring**: Update the module docstring from "zero-dependency IIFE banner renderer" to accurately describe it as the public re-export entry point.
7. **DRY: Extract shared `mockResponse` helper**: Move the duplicated `mockResponse` helper from `client/tests/fetch.test.js` and `client/tests/main.test.js` into `client/tests/helpers.js`.
8. **DRY: Extract shared CSS properties builder in `dom.js`**: Create `_buildWrapperCssProperties(height, zIndex)` used by both `_buildStyles` and `_buildFallbackStyles`, with fallback appending its reset properties.
9. Update tests to cover: fallback style cleanup on destroy, concurrent init blocked, null body returns gracefully, singleton uses only Symbol.

---

## Task 11: Full segment rendering

Extend the banner rendering in `client/src/main.js` by creating `client/src/segments.js` exporting `renderSegments(data, config, wrapper)`. This replaces the minimal sha+branch rendering from Task 6 with the full canonical render order from the spec. `main.js` now calls `renderSegments` instead of inline rendering.

Segments in order: (1) `app_name` (`data-segment="app-name"`), (2) `environment` (`data-segment="environment"`), (3) `branch` — hidden if value is `"HEAD"`, null, or empty (`data-segment="branch"`), (4) `sha` — plain text for now, links added in Task 9 (`data-segment="sha"`), (5) `commit_date` — converted from UTC to local time (`data-segment="commit-date"`), (6) uptime from `server_started` using `formatUptime` from Task 7 (`data-segment="uptime"`) and/or deploy age from `deployed_at` using `formatDeployAge` (`data-segment="deploy-age"`), with `startUptimeTicker` attached for live uptime display, (7) `tests` then `build` status with indicator dots: 🟢 pass/fresh, 🔴 fail/stale, 🟡 running/building, ⚪ idle/unknown (`data-segment="tests"`, `data-segment="build"`). Render the status dot followed by summary text if present (e.g. 🟢 1.1M passed). If summary is absent, render just the dot and status name. When `tests.url` or `build.url` is present, wrap the corresponding status segment in `<a href="{url}" target="_blank" rel="noopener">` to make it a clickable link to the details page (per spec Schema Rule 7 and Rendering Rule 10), (8) `port` (`data-segment="port"`), (9) `custom` fields in alphabetical key order — only string values rendered, non-strings ignored (`data-segment="custom-{key}"` for each). Each segment is a `<span>` (or `<a>` for clickable statuses) created via `document.createElement`. Segments are separated by ` · ` (a separator span). All content set via `textContent` — never `innerHTML`. Ensure the uptime ticker timer ID is stored so `destroy()` can clear it. Returns the wrapper element.

Write `client/tests/segments.test.js` covering: full data renders all segments in correct order, each segment has correct `data-segment` attribute, canonical segment order verified by `data-segment` attribute sequence, minimal data (sha + branch only) renders just those two, missing optional fields are skipped (no empty spans), `branch = "HEAD"` is hidden, `branch = null` is hidden, `branch = ""` is hidden, valid branch is shown, `commit_date` is converted to local time, `server_started` produces uptime string via `formatUptime`, `deployed_at` produces deploy-age string via `formatDeployAge`, both present → both segments rendered, neither present → no time segments, status dot is 🟢 for "pass"/"fresh", 🔴 for "fail"/"stale", 🟡 for "running"/"building", ⚪ for "idle"/unknown, `tests.url` present → tests segment is a clickable `<a>` with `target="_blank"` and `rel="noopener"`, `tests.url` absent → tests segment is a `<span>`, `build.url` works the same way, custom fields render in alphabetical key order with correct `data-segment`, non-string custom values are ignored, empty custom object produces no custom segments, XSS in branch/custom values is escaped (textContent), tests with summary renders dot + summary text, build with summary renders dot + summary text.

---

## Task 12: Link generation for SHA and branch

Create `client/src/links.js` exporting `createLink(repoUrl, type, value, hostPatterns)` where `type` is `"commit"` or `"tree"`. The function checks `hostPatterns` first (an array of `{ host, commitPath, treePath }` from config — see Task 4), then falls back to the three built-in host rules: `github.com` → `/commit/{sha}` and `/tree/{branch}`, `gitlab.com` → `/-/commit/{sha}` and `/-/tree/{branch}`, `bitbucket.org` → `/commits/{sha}` and `/src/{branch}`. For any host not matching custom patterns or built-in rules, returns `null` (plain text, no broken links). Links open in new tab (`target="_blank"`, `rel="noopener"`). The `hostPatterns` option enables v1 support for self-hosted Git instances as described in the spec's Link Generation section: `BuildBanner.init({ hostPatterns: [{ host: "git.mycompany.com", commitPath: "/-/commit/{sha}", treePath: "/-/tree/{branch}" }] })`.

Update `client/src/segments.js` so the `sha` segment wraps in `<a>` when a commit link is available (using `sha_full` for the URL if present, falling back to `sha`), and `branch` segment wraps in `<a>` when a tree link is available. Links use subtle underline on hover (CSS in shadow root stylesheet). When no link is generated, render as plain `<span>`.

Write `client/tests/links.test.js` covering: GitHub commit link correct, GitHub tree link correct, GitLab commit link uses `/-/commit/`, GitLab tree link uses `/-/tree/`, Bitbucket commit link uses `/commits/`, Bitbucket tree link uses `/src/`, self-hosted GitLab (e.g. `gitlab.mycompany.com`) returns null with empty hostPatterns, custom hostPattern for `git.mycompany.com` generates correct link, custom hostPattern takes precedence over built-in for same host, Gitea host returns null without custom pattern, Azure DevOps returns null without custom pattern, null `repo_url` returns null, link has `target="_blank"` and `rel="noopener"`, `sha_full` is used for commit link when present (fallback to `sha`), no `repo_url` in data → SHA and branch render as plain `<span>` (no `<a>` elements).

---

## Task 13: Time formatting module

Create `client/src/time.js` exporting `formatUptime(serverStartedISO)`, `formatDeployAge(deployedAtISO)`, and `startUptimeTicker(element, serverStartedISO)`. `formatUptime` computes elapsed time from `server_started` to now and returns human-readable string (e.g. "up 2h 15m", "up 3d 1h", "up 45s"). `formatDeployAge` computes elapsed time from `deployed_at` to now and returns (e.g. "deployed 3h ago"). `startUptimeTicker` updates the element's `textContent` every 60 seconds (for always-live uptime display without polling). Returns a timer ID for cleanup. Write `client/tests/time.test.js` covering: uptime formats seconds correctly ("up 45s"), uptime formats minutes ("up 12m"), uptime formats hours+minutes ("up 2h 15m"), uptime formats days ("up 3d 1h"), deploy age formats correctly ("deployed 3h ago"), `startUptimeTicker` updates element text after 60 seconds (use `vi.useFakeTimers`), ticker returns clearable timer ID, null `server_started` returns null, null `deployed_at` returns null, both present → both strings returned, ISO 8601 with timezone offset parsed correctly.

---

## Task 14: Click-to-copy SHA

Create `client/src/clipboard.js` exporting `attachCopyHandler(shaElement, fullSha, logger)`. On click, calls `e.preventDefault()` (to prevent navigation if the SHA is wrapped in an `<a>` link), then attempts `navigator.clipboard.writeText(fullSha)`. On success, replaces the element's `textContent` with "Copied!" for 1500ms, then reverts to the original SHA display text. On clipboard failure (or if API is unavailable), falls back to creating a temporary off-screen `<textarea>`, selecting the text, and calling `document.execCommand('copy')`. Integrate into `segments.js` so the SHA element (whether `<a>` or `<span>`) has `cursor: pointer` and the copy handler attached. Write `client/tests/clipboard.test.js` covering: click copies `sha_full` when present, click copies `sha` when `sha_full` absent, click calls `preventDefault` (no navigation), text changes to "Copied!" on success, text reverts after 1500ms (use `vi.useFakeTimers`), fallback to `execCommand` when clipboard API unavailable, fallback to text selection when both APIs fail, double-click during "Copied!" state doesn't break (debounce/ignore).

---

## Task 15: Token auth client-side guardrails

Create `client/src/token-warnings.js` exporting `checkTokenWarnings(config)`. Token warnings use `console.warn` directly — they are safety guardrails, not diagnostic messages. They bypass the logger entirely and are not subject to the 20-message session cap or the debug flag. If `config.token` is set and shorter than 16 characters, calls `console.warn("[BuildBanner] Token is shorter than 16 characters. Short tokens offer minimal protection.")`. If `config.token` is set and `window.location.protocol === 'https:'` and the page hostname does not match `localhost`, `127.0.0.1`, or end with `.local`, `.internal`, or `.test`, calls `console.warn("[BuildBanner] Token auth detected on a public-facing origin. data-token is intended for staging/internal use only.")`. A dev running http://myapp.example.com during development shouldn't get warned — only HTTPS signals a truly public-facing origin. Integrate into `main.js` init flow so warnings fire before the first fetch. Write `client/tests/token-warnings.test.js` covering: short token (< 16 chars) triggers `console.warn` directly, long token (>= 16 chars) does not trigger short-token warning, HTTPS public hostname with token triggers public `console.warn`, `localhost` does not trigger public warning, `127.0.0.1` does not trigger public warning, `myapp.local` does not trigger public warning, `staging.internal` does not trigger public warning, `foo.test` does not trigger public warning, HTTP on public hostname does not trigger public warning, no token set triggers no warnings, both warnings fire simultaneously when applicable, warnings are called via `console.warn` not through the logger.

---

## Task 16: Dismiss functionality

Create `client/src/dismiss.js` exporting `createDismissButton(config, onDismiss)` and `isDismissed(config)`. `createDismissButton` returns a `<button>` element with text "✕", `aria-label="Close build banner"`, keyboard-navigable (focusable, activates on Enter/Space), visible `:focus-visible` ring styled in the shadow CSS. `isDismissed` checks `sessionStorage` (for `"session"` mode) or `localStorage` (for `"permanent"` mode) for key `"buildbanner-dismissed"`. If storage APIs throw (blocked), falls back to a module-level `dismissedInMemory` flag. On dismiss when storage throws, set `dismissedInMemory = true`. `isDismissed` checks this flag as a final fallback after storage checks fail — so if the user dismisses and then `destroy()` + re-init happens on the same page with blocked storage, the banner stays dismissed. When dismiss mode is `"none"`, `createDismissButton` returns `null` (no button rendered). On dismiss, writes to appropriate storage and calls `onDismiss` callback. Integrate into `main.js` so the dismiss button appears at the far right of the banner (after all segments), and the `onDismiss` callback removes the banner host and restores padding (calls `removePush` from Task 17 once it exists; until then, just removes DOM). In `main.js`, after config parsing and before fetch, call `isDismissed(config)`. If true, skip fetch and rendering entirely — return silently. Write `client/tests/dismiss.test.js` covering: session dismiss stores in sessionStorage, permanent dismiss stores in localStorage, `isDismissed` returns true after session dismiss, `isDismissed` returns true after permanent dismiss, dismiss mode "none" returns null button (no ✕ rendered), button has correct aria-label, button activates on Enter key, button activates on Space key, button has focus-visible ring class, storage blocked (throws) → dismiss sets in-memory flag → `isDismissed` returns true on same page without reload, storage blocked → dismiss still calls onDismiss callback, onDismiss callback is invoked (banner removal verified), banner not rendered when sessionStorage has buildbanner-dismissed, banner not rendered when localStorage has buildbanner-dismissed in permanent mode.

---

## Task 17: Polling with exponential backoff and visibility awareness

Create `client/src/polling.js` exporting `startPolling(config, fetchFn, onData, logger)` and `stopPolling(state)`. `startPolling` sets an interval of `config.poll` seconds. On each tick, calls `fetchFn` with `isRefetch: true`. If data is returned, calls `onData(data)` to update segments in-place (via `renderSegments` re-call). On failure, does NOT remove or flicker the banner — keeps the last successfully rendered data visible. On consecutive failures, doubles the interval (capped at 300 seconds / 5 minutes). Registers a `visibilitychange` listener: when hidden, pauses polling (clears timer); when visible, fires an immediate fetch and resumes normal interval. Backoff resets only on a successful fetch while visible, not on visibility change alone. `stopPolling` clears timers and removes the visibility listener. Returns a state object with `{ timerId, listenerRef, currentInterval }` for cleanup. Integrate into `main.js` so polling starts after initial render when `config.poll > 0`, and `destroy()` calls `stopPolling`. Write `client/tests/polling.test.js` covering: polls at configured interval, successful poll resets interval, failed poll doubles interval, backoff caps at 300 seconds, tab hidden pauses polling (no fetches fire), tab visible triggers immediate fetch, tab visible resumes normal interval, backoff not reset by visibility change alone (endpoint still failing), `stopPolling` clears timer, `stopPolling` removes visibility listener, `poll=0` means no polling started, poll update calls `onData` with new data, failed poll does not call `onData`, failed poll does not flicker banner (banner DOM remains present), consecutive failures increase backoff (N→2N→4N), success after backoff resets to original interval.

---

## Task 18: Push mode with existing-padding safety

Create `client/src/push.js` exporting `applyPush(config, bannerHeight)` and `removePush(bannerHeight)`. `applyPush`: reads `getComputedStyle(document.documentElement).paddingTop`. If `config.push` is false, returns `{ mode: "overlay", originalPadding: existing }` without modifying anything. If the existing padding is non-zero, returns `{ mode: "overlay", originalPadding: existing }` and does not modify padding (logs via logger that push mode fell back to overlay due to existing padding). If zero, adds `bannerHeight` px to `<html>` padding-top (or padding-bottom for `config.position === "bottom"`) and returns `{ mode: "push", originalPadding: 0 }`. `removePush`: implements subtract-not-overwrite — reads current padding, if it equals `originalPadding + bannerHeight` restores to `originalPadding`, otherwise subtracts `bannerHeight` from current value, clamps to 0 (never negative). Integrate into `main.js` and `dom.js`: when `applyPush` returns `mode: "push"`, the banner host uses `position: sticky`; when `mode: "overlay"`, the banner host uses `position: fixed`. Wire `removePush` into both `destroy()` and the dismiss `onDismiss` callback so padding is restored on either action. Write `client/tests/push.test.js` covering: zero existing padding → push mode applies padding, non-zero existing padding → overlay mode (padding untouched), `config.push = false` → overlay mode (no padding modification), destroy restores original padding when no third-party changes, destroy subtracts banner height when third-party added padding after init, dismiss restores padding (calls removePush), result never goes negative (clamp to 0), bottom position applies padding-bottom instead, push mode sets `position: sticky` on banner host, overlay mode sets `position: fixed` on banner host.

---

## Task 19: Theme support (dark/light/auto)

Create `client/src/theme.js` exporting `getThemeStyles(theme)` and the color constants `DARK_BG`, `DARK_FG`, `LIGHT_BG`, `LIGHT_FG` as named exports. Returns a CSS string for the banner. Both themes share base typography: `font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace` and `font-size: 12px`. Dark theme: background `#1a1a2e`, text `#e0e0e0`, link color muted blue. Light theme: background `#f0f0f0`, text `#333`. Auto theme: uses `@media (prefers-color-scheme: dark)` inside the shadow root stylesheet to switch between dark and light. All themes must meet WCAG AA contrast ratios (4.5:1) for all text elements. Integrate into `dom.js` so the `<style>` block inside the shadow root includes the correct theme CSS based on `config.theme`. Write `client/tests/theme.test.js` covering: dark theme applies dark background class/styles, light theme applies light background, auto theme includes `prefers-color-scheme` media query in stylesheet, default theme is dark, all three theme strings are valid CSS (no syntax errors), all themes include monospace font-family, contrast ratio check — compute from exported `DARK_BG`/`DARK_FG` constants and verify 4.5:1 ratio, contrast ratio check — compute from exported `LIGHT_BG`/`LIGHT_FG` and verify 4.5:1.

---

## Task 20: Env-hide

Create `client/src/env-hide.js` exporting `shouldHide(envHideList, environment)`. If `envHideList` is null or empty, returns `false`. If `environment` matches any entry in `envHideList` (case-insensitive), returns `true`. Integrate into `main.js` init flow. **Implementation note:** the spec says `data-env-hide` "skips the fetch entirely," but the client has no way to know the environment without fetching — the environment value comes from the server response. The actual implementation performs the fetch, checks `responseData.environment` against the `envHideList`, and hides the banner (removes DOM, does not render) if matched. The fetch is still made but no banner is shown. This is a practical deviation from the spec's aspirational language; agents implementing this task should use the fetch-then-check approach. Write `client/tests/env-hide.test.js` covering: matching environment returns true (shouldHide), non-matching environment returns false, case-insensitive matching (`"Production"` matches `"production"`), multiple environments in list (`"production,staging"`), environment not in response → returns false, null envHideList → returns false, empty string envHideList → returns false, integration test — init with `data-env-hide="production"` and endpoint returning `environment: "production"` → no banner rendered.

---

## Task 21: Accessibility — ARIA live region and keyboard navigation

Update `client/src/segments.js` and `client/src/dom.js` for full accessibility. Wrap `tests` and `build` status segments in a container `<div>` with `role="status"` and `aria-live="polite"`. On poll updates (via `renderSegments` re-call), only update the live region content when `tests.status` or `build.status` actually changes from its previous value — store previous status values and compare before updating the live region DOM. This prevents screen readers from being spammed by identical content or uptime ticks. Ensure all interactive elements (close button, SHA copy, links) are reachable via Tab and activatable via Enter/Space. The banner never auto-focuses on render or poll update. Close button has visible `:focus-visible` ring. Tab order follows the canonical render order left-to-right: links → SHA → status links → dismiss. Write `client/tests/accessibility.test.js` covering: status container has `role="status"`, status container has `aria-live="polite"`, status change updates live region content, identical status on poll does not update live region, uptime tick does not update live region, close button is keyboard-navigable (tabIndex 0), close button responds to Enter, close button responds to Space, close button has focus-visible styles, no element has `autofocus`, all links are tabbable, tab order is correct (branch link → SHA → status links → dismiss).

---

## Task 22: Lifecycle — refresh, update, Symbol guard finalization

Extend `client/src/main.js` with the remaining lifecycle methods. `BuildBanner.refresh()`: triggers a manual re-fetch (calls `fetchBannerData` with `isRefetch: true`) and updates segments with the result. `BuildBanner.update(partialData)`: merges `partialData` into the current banner state (shallow merge at top level; `custom` is merged key-by-key) and re-renders segments without fetching. This enables SPA frameworks to push data changes without network round-trips. After `destroy()`, all methods on `window.BuildBanner` (`init`, `destroy`, `refresh`, `update`, `isVisible`) become no-ops that return silently — the global is NOT deleted, so existing references don't throw. A new active instance can be created by calling `BuildBanner.init()` after destroy. Write `client/tests/lifecycle.test.js` covering: `refresh()` re-fetches and updates segments, `refresh()` with endpoint failure keeps last data, `update({ custom: { model: "new" } })` merges into current state, `update()` re-renders without fetch, `update()` with partial custom merges (does not replace entire custom map), `update()` of status fields re-renders status dots, methods become no-ops after destroy (no error thrown), `init()` after destroy creates new instance, `update()` while polling is active works (data merges), `refresh()` after destroy is a no-op.

---

## Task 23: Client build — minification, IIFE bundle, CDN-ready output

Update `client/package.json` build scripts to produce the final distribution. The `build` script now outputs `dist/buildbanner.min.js` (minified IIFE, target es2017, no external deps), `dist/buildbanner.js` (unminified for debugging), and `dist/buildbanner.css` (fallback stylesheet for non-Shadow-DOM environments containing all `.__buildbanner-*` rules). Add `"files"` field listing `dist/` for npm publishing. Add `"unpkg": "dist/buildbanner.min.js"` and `"jsdelivr": "dist/buildbanner.min.js"` fields for CDN auto-resolution. Update the `size` script to enforce <3KB gzipped for `buildbanner.min.js`. Write `client/tests/bundle.test.js` covering: `buildbanner.min.js` exists and is valid JS, `buildbanner.js` (unminified) exists, `buildbanner.css` exists, minified file is smaller than unminified, gzipped size < 3072 bytes, IIFE format (no `import`/`export`), `window.BuildBanner` is defined after evaluation, `BuildBanner.init` is a function, `BuildBanner.destroy` is a function, `BuildBanner.refresh` is a function, `BuildBanner.update` is a function.

---

## Task 24: Node server helper — core module

Create `node/lib/core.js` as a shared core module used by all Node framework adapters. At `require` time (not per-request), reads git info by spawning `git` subprocesses: `git log -1 --format="%H %h %cd" --date=iso-strict` (extracts full 40-char SHA for `sha_full` and short 7-char for `sha`), `git rev-parse --abbrev-ref HEAD` (if result is `"HEAD"`, tries `git describe --tags --exact-match` — if tag found, uses tag as branch; else branch is null), `git remote get-url origin`. Environment variables override git: `BUILDBANNER_SHA` (if 8+ chars, also used as `sha_full`; short form derived by truncating to 7), `BUILDBANNER_BRANCH`, `BUILDBANNER_REPO_URL`, `BUILDBANNER_COMMIT_DATE`, `BUILDBANNER_DEPLOYED_AT`, `BUILDBANNER_APP_NAME` → `app_name`, `BUILDBANNER_ENVIRONMENT` → `environment`, `BUILDBANNER_PORT` → `port` (parsed as integer). Read `BUILDBANNER_TOKEN` from environment as fallback when `options.token` is not provided programmatically; programmatic wins. Custom fields from env vars: any `BUILDBANNER_CUSTOM_*` env var maps to `custom.{lowercased_suffix}` (e.g. `BUILDBANNER_CUSTOM_MODEL=gpt4` → `custom.model`). Sanitizes repo URL (strips userinfo, `.git` suffix, trailing slashes). Records `server_started` as ISO 8601 UTC at module load time. Caches all static fields. Every response includes `_buildbanner: { version: 1 }`. Accepts `options.extras` callback for dynamic fields (extras `custom` merges with env-var custom, extras wins on conflict). Stringifies non-string `custom` values via `String()`, omits null values. Never throws — if git and env vars both fail, fields are null; if extras throws, omits extras and logs once. Token auth: if `options.token` is configured, validates incoming `Authorization: Bearer <token>` header; returns 401 with empty body on mismatch; missing header → 401. If token is shorter than 16 characters, logs a warning at startup (`"BuildBanner: token is shorter than 16 characters, auth check disabled"`) and disables auth. If `environment` is `"production"` and token is set, logs a warning.

Write `node/tests/core.test.js` — unit tests for `node/lib/core.js` with **all git subprocess calls mocked** (use `vi.mock('child_process')` or equivalent). Covering: happy path returns object with all fields, `_buildbanner.version === 1`, both `sha` (7 chars) and `sha_full` (40 chars) present, `server_started` is ISO 8601, env vars override git values, `BUILDBANNER_APP_NAME` → `app_name`, `BUILDBANNER_ENVIRONMENT` → `environment`, `BUILDBANNER_PORT` → `port` as integer, `BUILDBANNER_CUSTOM_MODEL` → `custom.model`, multiple `BUILDBANNER_CUSTOM_*` vars build full custom map, extras callback merges custom (extras wins on conflict), extras callback that throws → response without extras (logged once), custom integer value stringified, custom null value omitted, URL sanitization — load all fixtures from `shared/test_fixtures.json` and verify every case, detached HEAD with tag uses tag as branch, detached HEAD without tag → branch is null, git not available (spawn fails) → falls back to env vars, no git and no env vars → sha/branch are null, token auth: valid token → passes, invalid token → rejected, missing header → rejected, no token configured → no auth check, short token (<16 chars) → auth disabled with warning logged, production env with token → warning logged, calling `getBannerData()` twice returns the same `server_started` value (cached, not recomputed).

---

## Task 25: Node server helper — Express adapter

Create `node/server.js` exporting `buildBannerMiddleware(options)` for Express. Uses `core.js` from Task 23 for all data/auth logic. Serves `GET` on `options.path` (default `/buildbanner.json`) with `Content-Type: application/json`, `Cache-Control: no-store`. Passes through all non-matching requests to `next()`. Update `node/index.js` to re-export the server helpers (Express middleware from `server.js`). Do NOT re-export the client from `../client/buildbanner.js` — that cross-package relative path breaks on npm publish. The client is a separate package (`buildbanner` from `client/`).

Write `node/tests/server.test.js` — integration tests for Express middleware (using supertest). Covering: happy path returns 200 with valid JSON, response has `Cache-Control: no-store`, response has `Content-Type: application/json`, middleware doesn't break other routes (next() called for non-matching paths), token auth returns 401 when configured and header missing.

---

## Task 26: Node server helper — Koa adapter

Create `node/koa.js` exporting `buildBannerKoa(options)`. Koa middleware reusing `node/lib/core.js` from Task 23. Responds to `GET` on configured path with the same JSON, same headers (`Cache-Control: no-store`, `Content-Type: application/json`), same token auth behavior. Passes through non-matching requests via `await next()`. Write `node/tests/koa.test.js` covering: happy path returns 200 with valid JSON including `_buildbanner.version`, `sha`, `sha_full`, correct headers, middleware passes through non-matching requests, env vars override git (via core), extras callback works, extras callback that throws → response without extras, `BUILDBANNER_CUSTOM_*` env vars populate custom map, token auth (valid → 200, invalid → 401).

---

## Task 27: Node server helper — Hono adapter

Create `node/hono.js` exporting `buildBannerHono(options)`. Hono middleware reusing `node/lib/core.js`. Same JSON contract, same headers, same token auth. Write `node/tests/hono.test.js` covering: happy path returns 200 with valid JSON including `_buildbanner.version`, `sha`, `sha_full`, correct headers, middleware passes through non-matching requests, env vars override git (via core), extras callback works, extras callback that throws → response without extras, `BUILDBANNER_CUSTOM_*` env vars populate custom map, token auth (valid → 200, invalid → 401).

---

## Task 28: Python server helper — core module and Flask adapter

Create `python/buildbanner/core.py` with `get_banner_data(extras=None)` and `sanitize_repo_url(raw_url)`. At import time, reads git info by invoking `git` via `subprocess.run` (with **all subprocess calls mocked in tests**): `git log -1 --format="%H %h %cd" --date=iso-strict`, `git rev-parse --abbrev-ref HEAD` (detached HEAD → try `git describe --tags --exact-match`), `git remote get-url origin`. Environment variables override: `BUILDBANNER_SHA`, `BUILDBANNER_BRANCH`, `BUILDBANNER_REPO_URL`, `BUILDBANNER_COMMIT_DATE`, `BUILDBANNER_DEPLOYED_AT`, `BUILDBANNER_APP_NAME`, `BUILDBANNER_ENVIRONMENT`, `BUILDBANNER_PORT` (int). Read `BUILDBANNER_TOKEN` from environment as fallback when `options.token` is not provided programmatically; programmatic wins. `BUILDBANNER_CUSTOM_*` → `custom.*` (lowercased suffix). Sanitizes repo URL. Records `server_started` at module load. Always includes `_buildbanner: { "version": 1 }`. Emits both `sha` and `sha_full`. Stringifies non-string custom values via `str()`, omits `None`. Accepts `extras` callable; extras `custom` merges with env-var custom (extras wins). Never raises. Token auth helper: `validate_token(request_header, configured_token)` — returns True/False; short token (<16 chars) disables auth with logged warning. If `environment` is `"production"` and token is configured, log a warning at startup.

Create `python/buildbanner/flask.py` with `buildbanner_blueprint(path="/buildbanner.json", extras=None, token=None)`. Returns a Flask Blueprint. Serves `GET` on path with `Cache-Control: no-store`, `Content-Type: application/json`. Re-export `buildbanner_blueprint` from `python/buildbanner/__init__.py`.

Write `python/tests/test_core.py` — unit tests with **all subprocess calls mocked**. Covering: happy path, `_buildbanner.version == 1`, `sha` and `sha_full` present, `server_started` present, env vars override git, `BUILDBANNER_APP_NAME` → `app_name`, `BUILDBANNER_PORT` → int, `BUILDBANNER_CUSTOM_MODEL` → `custom.model`, URL sanitization (load all fixtures from `shared/test_fixtures.json`), detached HEAD with tag, detached HEAD without tag, extras merges (extras custom wins), extras raises → omits extras, custom int stringified, custom None omitted, no git no env → null fields, production env with token → warning logged, calling `get_banner_data()` twice returns the same `server_started` value (cached, not recomputed).

Write `python/tests/test_flask.py` — Flask integration tests. Covering: happy path 200 with JSON, `Cache-Control: no-store`, `Content-Type: application/json`, custom path works, token auth (valid → 200, invalid → 401, short token → auth disabled with warning), middleware doesn't break other routes.

---

## Task 29: Python server helper — FastAPI/Starlette middleware

Create `python/buildbanner/fastapi.py` with `BuildBannerMiddleware` (ASGI middleware) reusing `core.py`. Intercepts `GET` on configured path, returns JSON response with correct headers. Token auth via `core.validate_token`. Re-export from `__init__.py`. Write `python/tests/test_fastapi.py` covering: happy path 200 with JSON including `_buildbanner.version`, correct headers, extras callback with tests/build/custom, extras failure → omits extras, token auth (valid → 200, invalid → 401), `BUILDBANNER_CUSTOM_*` env vars, non-matching requests pass through, detached HEAD fixtures.

---

## Task 30: Python server helper — Django middleware and WSGI wrapper

Create `python/buildbanner/django.py` with `BuildBannerMiddleware` conforming to Django's middleware protocol (`__init__(self, get_response)`, `__call__(self, request)`). Reuses `core.py`. Intercepts `GET` on configured path, returns `JsonResponse` with correct headers. Token auth. Create `python/buildbanner/wsgi.py` with `buildbanner_wsgi(app, path="/buildbanner.json", extras=None, token=None)` as a WSGI wrapper reusing `core.py`. Re-export both from `__init__.py`. Write `python/tests/test_django.py` covering: Django middleware happy path, path interception, pass-through of non-matching routes, token auth (valid → 200, invalid → 401), short-token disabling. Write `python/tests/test_wsgi.py` covering: WSGI wrapper happy path, interception and pass-through, correct headers, token auth.

---

## Task 31: Ruby server helper — Rack middleware

Create `ruby/lib/buildbanner.rb` defining `BuildBanner::Middleware` as a Rack middleware class. At initialization, reads git info (with **all subprocess calls mocked in tests**, using `Open3.capture2` or backticks) — same extraction logic: full/short SHA, branch (detached HEAD → tag fallback), remote URL. Env var overrides: `BUILDBANNER_SHA`, `BUILDBANNER_BRANCH`, `BUILDBANNER_REPO_URL`, `BUILDBANNER_COMMIT_DATE`, `BUILDBANNER_DEPLOYED_AT`, `BUILDBANNER_APP_NAME`, `BUILDBANNER_ENVIRONMENT`, `BUILDBANNER_PORT`. Read `BUILDBANNER_TOKEN` from environment as fallback when `options.token` is not provided programmatically; programmatic wins. `BUILDBANNER_CUSTOM_*` → `custom.*` (lowercased suffix). URL sanitization. Records `server_started` at init. Always includes `_buildbanner: { "version" => 1 }`. Emits both `sha` and `sha_full`. Stringifies non-string custom values via `.to_s`, omits `nil`. Accepts `extras` lambda; extras `custom` merges with env-var custom (extras wins). Token auth with short-token guard. If `environment` is `"production"` and token is configured, log a warning at startup. Serves `GET` on configured path (default `/buildbanner.json`) with `Cache-Control: no-store`, `Content-Type: application/json`. Never raises. Write `ruby/spec/buildbanner_spec.rb` covering: happy path returns valid JSON, `_buildbanner.version == 1`, `sha` and `sha_full` present, `server_started` present, `BUILDBANNER_APP_NAME` → `app_name`, `BUILDBANNER_CUSTOM_MODEL` → `custom.model`, env vars override git, URL sanitization (load all fixtures from `shared/test_fixtures.json`), detached HEAD with tag, detached HEAD without tag, extras lambda works, extras lambda raises → omits extras, custom integer `.to_s` stringified, custom nil omitted, token auth (valid → 200, invalid → 401, short token → auth disabled with warning), production env with token → warning logged, response headers correct, middleware passes through non-matching requests, calling the middleware twice returns the same `server_started` value (cached, not recomputed).

---

## Task 32: Cross-language parity enforcement

Create parameterized parity tests that call each language's public API with every shared fixture and verify identical output across all three languages. Create `tests/parity/node.test.js` (imports `node/lib/core.js`, mocks git, runs all fixtures), `tests/parity/test_python.py` (imports `buildbanner.core`, mocks subprocess, runs all fixtures), `tests/parity/ruby_parity_spec.rb` (requires `buildbanner`, mocks system calls, runs all fixtures). Each test loads `shared/test_fixtures.json` and verifies: all URL sanitization cases produce identical `repo_url` output, all branch detection cases produce identical `branch` output, custom stringification rules match (integer → string, null → omitted), `_buildbanner.version` is `1`, both `sha` and `sha_full` are emitted, `BUILDBANNER_CUSTOM_*` derivation produces identical `custom` maps (lowercased suffix keys), field names and JSON structure match exactly. This runs as a standalone CI job. Write `tests/parity/README.md` documenting how to run each language's parity suite independently and what "parity" means (same input → same JSON output structure and values).

---

## Task 33: Static/nginx deployment example

Create `examples/static-html/entrypoint.sh` — a shell script that generates `buildbanner.json` from `BUILDBANNER_*` env vars (including `BUILDBANNER_CUSTOM_*` → custom map with lowercased suffix keys, `_buildbanner.version: 1`, `sha`/`sha_full`, `server_started` set to current time). This validates that the env-var contract works without any server helper library — the critical path for distroless images, Bazel builds, and Nix. Create `examples/static-html/nginx.conf` serving the JSON at `/buildbanner.json` with `Cache-Control: no-store` and `Content-Type: application/json`, plus static files. Create `examples/static-html/index.html` with the standard `<script src="/static/buildbanner.min.js">` tag. Create `examples/static-html/Dockerfile` (nginx:alpine base) that runs `entrypoint.sh` then starts nginx. Write `tests/static-example.test.js` covering: `entrypoint.sh` exists and is executable, generated JSON validates against `shared/schema.json`, `BUILDBANNER_CUSTOM_MODEL=test` produces `custom.model: "test"`, `_buildbanner.version` is 1, `sha` and `sha_full` are both present, `nginx.conf` includes `no-store` directive, `nginx.conf` includes `application/json`, renamed endpoint path works (pass different path arg to entrypoint → generates at that path).

---

## Task 34: End-to-end integration smoke test

Create `tests/e2e/smoke.test.js` — an integration test that wires the built client and a Node Express server helper together. This test requires Playwright (not jsdom) because it validates layout properties (`paddingTop`, `offsetHeight`) and computed styles (`font-family`, `color`) that require a real browser layout engine. Spin up an Express server using `buildBannerMiddleware` from Task 24 with known fixture data (override via `BUILDBANNER_*` env vars including `BUILDBANNER_CUSTOM_MODEL=test` and `BUILDBANNER_CUSTOM_REGION=us-east-1`). Serve a minimal HTML page that includes `<script src="buildbanner.min.js">`.

Use Playwright (Chromium) to verify: (1) banner DOM is rendered inside Shadow DOM with `data-testid="buildbanner"`, (2) JSON response from `/buildbanner.json` includes `_buildbanner.version === 1`, both `sha` and `sha_full`, and `server_started`, (3) segments have correct `data-segment` attributes in canonical order, (4) SHA links to the correct GitHub commit URL using `sha_full`, (5) branch links to the correct tree URL, (6) removing `repo_url` from response causes SHA and branch to render as plain text (no `<a>` elements), (7) custom fields render in alphabetical order (`model` before `region`) with `data-segment="custom-model"` and `data-segment="custom-region"`, (8) dismiss button removes banner and `paddingTop` resets to 0, (9) polling updates banner in-place after configured interval (no flicker), (10) `BuildBanner.destroy()` removes banner and restores padding, (11) 500 from endpoint → no banner (no console error, page renders normally), (12) env-hide with matching environment → no banner, (13) CSS isolation — inject `* { font-family: "Comic Sans MS" !important; color: red !important; }` on host page, verify banner computed font-family is monospace and text color is not red, (14) push mode → `paddingTop` equals banner `offsetHeight`, (15) `tests.url` present → status segment is a clickable `<a>`. Create `playwright.config.js` in `tests/e2e/` configured for Chromium only (Firefox/WebKit are covered by the separate test harness project).

---

## Task 35: Packaging — Python (pip), Node (npm), Ruby (gem)

Finalize all three package configurations for publishing.

**Python**: finalize `python/pyproject.toml` with `[build-system]` using `setuptools`, `[project]` metadata (name `buildbanner`, version, description, author, license MIT, python_requires `>=3.8`, no dependencies), `[project.urls]` pointing to GitHub. Create `python/buildbanner/py.typed` marker (PEP 561). Create `python/README.md` with installation and usage examples for Flask, FastAPI, Django, WSGI.

**Node**: finalize `node/package.json` — `"name": "buildbanner-server"`, `"main": "index.js"`, `"exports"` map: `"."` → `index.js` (Express middleware re-export), `"./server"` → `server.js`, `"./koa"` → `koa.js`, `"./hono"` → `hono.js`. `"files"` includes `index.js`, `server.js`, `koa.js`, `hono.js`, `lib/`. Do NOT re-export the client — it is a separate package (`buildbanner` from `client/`). Finalize `client/package.json` `"files"` field listing `dist/`.

**Ruby**: finalize `ruby/buildbanner.gemspec` with name, version, summary, description, authors, license MIT, files list, no runtime dependencies. Create `ruby/README.md` with Rack/Rails usage examples.

Write `python/tests/test_packaging.py` covering: `import buildbanner` succeeds, `buildbanner_blueprint` importable, `BuildBannerMiddleware` importable from `buildbanner` and `buildbanner.django`, `buildbanner_wsgi` importable, version string present. Write `node/tests/packaging.test.js` covering: `require("buildbanner-server")` works, `require("buildbanner-server/server")` exports function, `require("buildbanner-server/koa")` exports function, `require("buildbanner-server/hono")` exports function, `package.json` has correct exports map and name `buildbanner-server`. Write `ruby/spec/packaging_spec.rb` covering: `require "buildbanner"` succeeds, `BuildBanner::Middleware` defined, gemspec has no runtime dependencies.

---

## Task 36: Documentation

Create `docs/README.md` — the main project README. Sections: what BuildBanner is (with banner screenshot placeholder), quick start (script tag, zero-config), configuration (table of all `data-*` attributes with defaults), programmatic API (`init`, `destroy`, `refresh`, `update`, `isVisible` — include `hostPatterns` option), environment variables (table of all `BUILDBANNER_*` env vars including `BUILDBANNER_CUSTOM_*` with derivation rule), server helpers (one subsection per framework: Flask, FastAPI, Django, WSGI, Express, Koa, Hono, Rack/Rails, static/nginx with link to example), JSON contract (summarize with link to `shared/schema.json`), custom fields usage, status indicators, theming, dismiss behavior, push mode, polling, size budget (<3KB), CSP compatibility notes, security posture summary (link to `docs/security.md`). Create `docs/configuration.md` with detailed configuration reference. Create `docs/security.md` covering: token auth limitations (not a security boundary), network-level controls recommendation, `data-env-hide`, endpoint renaming for discoverability, same-origin policy. Create `docs/csp.md` with CSP header examples for self-hosted and CDN usage, noting that the Shadow DOM path requires no CSP changes and the non-Shadow-DOM fallback path injects a `<style>` tag. Create `docs/self-hosting.md` with instructions for serving `buildbanner.min.js` from your own server. Create stub `examples/flask-app/`, `examples/express-app/`, `examples/rails-app/` directories with minimal one-file example apps. Write `tests/docs.test.js` covering: all doc files exist (`README.md`, `configuration.md`, `security.md`, `csp.md`, `self-hosting.md`), README contains required sections (quick start, configuration, API, server helpers, environment variables), `security.md` mentions token limitations, `schema.json` referenced in README, all framework names mentioned (Flask, Django, FastAPI, Express, Koa, Hono, Rails/Rack, nginx), `examples/static-html/` directory exists.

---

## Task 37: CI pipeline setup

Create `.github/workflows/ci.yml` with a GitHub Actions workflow. Jobs: (1) **client-build** — install deps, run `npm run build` in `client/`, run size check, run `vitest run` in `client/`. (2) **node-tests** — install deps, run `vitest run` in `node/`. (3) **python-tests** — set up Python 3.8+, `pip install -e python/`, run `pytest python/tests/`. (4) **ruby-tests** — set up Ruby, `bundle install` in `ruby/`, run `rspec ruby/spec/`. (5) **parity-tests** — run all three parity suites from Task 31. (6) **schema-validation** — run `tests/schema.test.js`. (7) **e2e** — install Playwright, build client, run `tests/e2e/smoke.test.js`. (8) **docs-check** — run `tests/docs.test.js`. The size check step should fail the build if gzipped output exceeds 3072 bytes. Add a step that comments the current gzipped size on PRs (using `actions/github-script`). Write `tests/ci.test.js` covering: `.github/workflows/ci.yml` exists, YAML is valid, contains expected job names (`client-build`, `node-tests`, `python-tests`, `ruby-tests`, `parity-tests`, `e2e`), size check step references the 3072 byte limit, Python version is 3.8+, Playwright install step exists.

---

## Task 38: Time formatting module

Create `client/src/time.js` exporting `formatUptime(serverStartedISO)`, `formatDeployAge(deployedAtISO)`, and `startUptimeTicker(element, serverStartedISO)`.

Create `client/src/time.js` exporting `formatUptime(serverStartedISO)`, `formatDeployAge(deployedAtISO)`, and `startUptimeTicker(element, serverStartedISO)`. `formatUptime` computes elapsed time from `server_started` to now and returns human-readable string (e.g. "up 2h 15m", "up 3d 1h", "up 45s"). `formatDeployAge` computes elapsed time from `deployed_at` to now and returns (e.g. "deployed 3h ago"). `startUptimeTicker` updates the element's `textContent` every 60 seconds (for always-live uptime display without polling). Returns a timer ID for cleanup. Write `client/tests/time.test.js` covering: uptime formats seconds correctly ("up 45s"), uptime formats minutes ("up 12m"), uptime formats hours+minutes ("up 2h 15m"), uptime formats days ("up 3d 1h"), deploy age formats correctly ("deployed 3h ago"), `startUptimeTicker` updates element text after 60 seconds (use `vi.useFakeTimers`), ticker returns clearable timer ID, null `server_started` returns null, null `deployed_at` returns null, both present → both strings returned, ISO 8601 with timezone offset parsed correctly.

---

## Task 39: Rename logger parameter to match spec

In `client/src/logger.js`, rename the `createLogger` parameter from `warnEnabled` to `debugEnabled` to match the Task 5 spec. Update all call sites and tests accordingly.

---

## Task 40: Fix install instructions to use GitHub-based installs

The docs currently say `npm install buildbanner`, `pip install buildbanner`, and `gem install buildbanner` as if the packages are published to registries. They are not. Update all install instructions across `docs/README.md`, `python/README.md`, `ruby/README.md`, and any other docs to use GitHub-based installation instead. For npm: `npm install github:diziet/buildbanner`. For pip: `pip install git+https://github.com/diziet/buildbanner.git#subdirectory=python`. For Ruby: point to the GitHub repo in the Gemfile. Update any code examples or quick-start sections accordingly.

---

## Task 41: Fix pytest-asyncio deprecation warning on Python 3.14+

Running `cd python && pytest` produces a `DeprecationWarning` from `pytest_asyncio` calling `asyncio.get_event_loop_policy()`, which is deprecated in Python 3.14 and slated for removal in 3.16. Pin or upgrade `pytest-asyncio` to a version that no longer triggers this warning. If no fixed version exists yet, add a `filterwarnings` entry in `python/pyproject.toml` under `[tool.pytest.ini_options]` to suppress the specific `DeprecationWarning` from `pytest_asyncio/plugin.py` until upstream resolves it, with a `# TODO:` comment linking to the upstream issue. Verify the warning no longer appears when running `pytest`.

---

## Task 42: Fix Bundler compatibility with Ruby 3.4+

Running `bundle install` or `bundle exec rspec` fails on Ruby 3.4+ with `undefined method 'untaint' for an instance of String (NoMethodError)` because the installed Bundler (1.17.2) uses `String#untaint`, which was removed in Ruby 3.4. Fix:

1. Regenerate `ruby/Gemfile.lock` with a modern Bundler (>= 2.4). The existing lockfile was generated by Bundler 1.17.2, which causes modern Bundler to downgrade itself to 1.17.2, which then crashes on Ruby 3.4+ due to removed `String#untaint`. Delete `ruby/Gemfile.lock` and run `cd ruby && bundle install` to regenerate it with the current Bundler.
2. Add a `ruby/.ruby-version` file specifying `>= 3.1` (or whatever the minimum supported Ruby is).
3. Add a preflight check script (`ruby/scripts/check-env.sh` or a `Makefile` target) that verifies Ruby >= 3.1 and Bundler >= 2.4 are installed, and prints actionable error messages if not (e.g. `"ERROR: Bundler 1.17.2 is too old for Ruby 3.4+. Run: gem install bundler"`).
4. Document minimum requirements in `ruby/README.md`: Ruby >= 3.1, Bundler >= 2.4. Include the `gem install bundler` upgrade command.
5. Add `logger` gem to `ruby/Gemfile` (or gemspec) as an explicit dependency. Ruby 3.4 warns that `logger` will be removed from default gems in Ruby 4.0. Adding it explicitly silences the warning: `"logger was loaded from the standard library, but will no longer be part of the default gems starting from Ruby 4.0.0"`.
6. Verify `cd ruby && bundle install && bundle exec rspec` succeeds on Ruby 3.4 with no warnings.

---

## Task 43: Add top-level Makefile for cross-language setup and test

Add a `Makefile` at the monorepo root with the following targets:

- `install` — runs `npm install` at the root (covers JS workspaces), `cd python && pip install -e ".[test]"`, and `cd ruby && bundle install`. Single command to set up all three ecosystems.
- `test` — runs all test suites: `npm test` (monorepo-level JS tests), `cd client && npm test`, `cd node && npm test`, `cd python && pytest`, `cd ruby && bundle exec rspec`.
- `test-js` — runs only JS tests (monorepo + client + node).
- `test-python` — runs only `cd python && pytest`.
- `test-ruby` — runs only `cd ruby && bundle exec rspec`.
- `build` — runs `cd client && npm run build`.
- `clean` — removes `client/dist/`, `python/__pycache__/`, `*.pyc`, `*.egg-info`.

Each target should print a short header (e.g. `==> Installing JS dependencies...`) before each step for readability. The `test` target should fail fast on the first suite that fails. Add a `.PHONY` declaration for all targets. Document the Makefile targets in the project README.

---

## Task 44: Color-coded SHA segment based on commit hash

Add a feature to the client banner that derives a unique background color from the commit SHA and applies it to the SHA segment. This gives each deploy a visually distinct color, making it easy to tell at a glance whether two environments are running the same commit.

1. Create `client/src/sha-color.js` exporting `getShaColor(sha)`. Take the first 6 characters of the SHA and use them as a hex color (e.g. SHA `a1b2c3f...` → `#a1b2c3`). Adjust lightness to ensure readability against the banner's text color: for dark theme, ensure the color is light enough (min luminance threshold); for light theme, ensure it's dark enough. If `sha` is null or too short, return `null` (no color applied).
2. In `client/src/dom.js` or the rendering logic, when the SHA segment is created, apply the derived color as a `background-color` on the SHA `<span>` via a CSS class with a CSS custom property (e.g. `--sha-color`) set on the element. Add the corresponding CSS rule inside the Shadow DOM stylesheet. Do not use inline `style=""` — use a class-based approach with the CSS custom property for CSP safety.
3. Add a `data-sha-color` attribute (`"auto"` | `"off"`, default `"auto"`) to the config parser (Task 4) so users can disable this feature.
4. Write `client/tests/sha-color.test.js` covering: 6-char hex SHAs produce valid CSS colors, same SHA always produces the same color, different SHAs produce different colors, null/short SHA returns null, luminance adjustment keeps colors readable on dark and light backgrounds, `data-sha-color="off"` disables the feature.

---

## Task 45: Replace unpkg CDN reference with self-hosting in Quick Start

The Quick Start section in `docs/README.md` references `https://unpkg.com/buildbanner@latest/buildbanner.min.js`, but unpkg serves from the npm registry and the package is not published to npm. This URL will not resolve. Replace the CDN `<script>` tag with the self-hosted approach: instruct users to copy `buildbanner.min.js` into their static assets directory and reference it locally (`/static/buildbanner.min.js`). Link to `docs/self-hosting.md` for detailed setup instructions. Remove any other `unpkg.com` references if present elsewhere in the docs.

---

## Task 46: Replace eval in ruby/scripts/check-env.sh

`ruby/scripts/check-env.sh` line 23 uses `eval` to execute version commands (`version=$(eval "$version_cmd")`). While the inputs are currently hardcoded, `eval` is a shell anti-pattern that risks command injection if the function is ever reused with external input (ShellCheck SC2294). Replace the generic `check_version` function with direct version checks that avoid `eval` entirely — call `ruby -e "puts RUBY_VERSION"` and `bundle --version | grep -oE ...` directly instead of passing them as strings through `eval`.

## Task 47: Eliminate banner flash — render placeholder synchronously before fetch

### Bug

When a page loads, there's a visible flash where the banner doesn't exist, then pops in after the `/buildbanner.json` fetch completes (~50-100ms gap). This is jarring on every page navigation.

### Fix

Render the `<build-banner>` custom element with a placeholder skeleton **synchronously** during script execution, before the fetch starts. The element should have the correct height, background color, and position immediately. When the JSON response arrives, fill in the text content (SHA, branch, uptime, etc.).

### Implementation

1. In `main.js` (or wherever the custom element is created), create and attach the `<build-banner>` element to the DOM **synchronously** at script load time — not inside a fetch `.then()` callback.

2. The initial render shows an empty bar with the correct dimensions and background color (matching the current theme). No text, no loading spinner — just the colored strip at the correct position.

3. When the fetch resolves, update the element's shadow DOM content with the actual data (links, text, uptime counter).

4. If the fetch fails, the empty bar either stays as-is (invisible thin line) or removes itself gracefully.

### Result

- Zero layout shift — the bar is always there from first paint
- No flash — background color matches immediately
- Text fills in smoothly once data arrives

---

## Task 48: Support runtime theme switching via data-theme attribute observation

### Bug

When a host app toggles between dark/light mode at runtime (e.g. via `data-theme` attribute on `<html>`), buildbanner stays on its initial theme. The `auto` theme only reads `prefers-color-scheme` (OS setting), not the host app's theme state.

### Fix

1. **Watch for `data-theme` changes** — use a `MutationObserver` on `document.documentElement` to detect when the `data-theme` attribute changes. When it changes to `"dark"`, switch to dark theme. When `"light"`, switch to light. This is a common pattern for web apps that toggle themes via data attributes.

2. **Priority**: `data-theme` attribute on `<html>` > `prefers-color-scheme` > default. If the host app sets `data-theme`, that takes precedence over the OS setting.

3. **Update shadow DOM styles** in real-time when the theme changes — swap the CSS variables inside the shadow root.

### Result

Apps that toggle `data-theme="dark"` / `data-theme="light"` on `<html>` get automatic banner theme matching without any extra JS.

---

## Task 49: Check data-theme on initial render, not just via observer

### Bug

When `data-theme="auto"` is set, the initial CSS uses `prefers-color-scheme` to pick dark/light. The `startThemeObserver` then reads `data-theme` from `<html>` and overrides — but there's a visible frame flash between the two. If the OS is set to light but the app uses `data-theme="dark"`, the banner flashes light then switches to dark on every page load.

### Fix

In `theme.js` `getThemeStyles()`, when theme is `"auto"`, check `document.documentElement.getAttribute("data-theme")` FIRST. If it's set to `"dark"` or `"light"`, use that directly. Only fall back to `prefers-color-scheme` if `data-theme` is absent.

This way the initial CSS render already matches the host app's theme — zero flash. The MutationObserver still handles runtime changes.

### Files

- `client/src/theme.js` — `getThemeStyles()` checks `data-theme` first
- Rebuild dist after change

---

## Task 50: Cache rendered banner in localStorage for instant subsequent loads

### Context

The banner flashes on every page load because it waits for the `/buildbanner.json` fetch before rendering text. After the first load, we know what the banner should look like — cache it for instant rendering on subsequent loads.

### Behavior

1. **First visit ever** — fetch JSON, render banner, store rendered state (HTML content, theme, SHA) in localStorage under `buildbanner_cache` key.

2. **Subsequent visits** — script runs synchronously, reads `buildbanner_cache` from localStorage, immediately renders the cached banner content. Zero fetch wait, zero flash.

3. **Background refresh** — after rendering from cache, still fetch `/buildbanner.json` in the background:
   - If SHA matches cached SHA: update uptime silently, update cache. No visible change.
   - If SHA differs (new deploy): re-render immediately with new data, update cache. User sees the banner update, which is correct.
   - If fetch fails (server down, 404): keep showing cached data. Don't clear cache.

4. **Cache key includes endpoint URL** — so different apps/ports don't share cache.

### Cache format

```json
{
  "endpoint": "/buildbanner.json",
  "sha": "a1b2c3d",
  "data": { ... full JSON response ... },
  "theme": "dark",
  "timestamp": 1711234567890
}
```

### Safety

- If localStorage is unavailable, fall back to normal fetch behavior.
- If cached data is corrupt/unparseable, ignore it and fetch fresh.
- Cache expires after 24 hours as a safety net (force fresh fetch).
- `data-cache="false"` attribute disables caching entirely.

### Files

- `client/src/cache.js` — new module: read/write/validate localStorage cache
- `client/src/main.js` — check cache before fetch, background refresh after render
- Rebuild dist

---

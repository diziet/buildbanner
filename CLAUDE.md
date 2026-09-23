# BuildBanner

BuildBanner is a developer info banner for web apps. Add a `<script>` tag to any app and point it at a JSON endpoint; the banner is a thin strip with links to GitHub. The server can be written in any language, and the client never throws an error into the host app.

TODO: this repository still uses the flat layout. The git root is `~/projects/buildbanner/`, and
`make worktree` puts trees in `~/projects/buildbanner-worktrees/<branch>/`. The move to the nested
layout (`~/projects/buildbanner/buildbanner/`) is pending.

## Workflow

- One worktree per task: `make worktree b=<type>/name` creates
  `~/projects/buildbanner-worktrees/<type>/name` from `origin/main`. It runs `make deps`, which
  installs the pinned Node in `.tools/`, the npm packages, a `.venv` and the Ruby gems in
  `ruby/vendor/bundle`, and it installs the hooks. Commit and push from the worktree.
- Local `main` is a read-only mirror of `origin/main`. The hooks in `.githooks/` refuse commits,
  merges and pushes to it.
- Never `git stash`: every worktree of the repo shares one stash stack.
- `make merge pr=N` is the only merge path. It runs the gate on the preview merge of the PR into
  `origin/main`. Never run `gh pr merge` or merge into `main` locally.
- `make sync` fetches and fast-forwards the current branch.
- `make branches-gc` is report-only. `make branches-gc args=--delete` removes only merged branches.
- `make gate` runs `doc-facts-check`, `doc-refs-check` and `gate-wiring-check`, then `test-ruby`,
  `test-parity`, `test-python`, `test-js` and `test-tooling`. A docs-only PR runs the first three
  and `test-js`. Run the one suite you are changing while you work; `make merge` runs the gate.
- `make doctor` comes first when a gate fails for no visible reason. `make help` lists every target.
- Prose follows `docs/writing-style.md`.
- A value between `<!-- fact:NAME -->` and `<!-- /fact -->` in a doc is generated from
  `scripts/doc_facts_registry.py`. Change its source, then run `make doc-facts`; never edit the
  value by hand. `make doc-refs-check` fails on a doc path, `make` target or flag that does not
  exist; exempt a correct reference it cannot see in `docs/doc-refs-allow.txt`, with a reason.
  Both checks come from llm-reliability-benchmark; its
  [doc-checks.md](https://github.com/diziet/llm-reliability-benchmark/blob/main/docs/doc-checks.md)
  describes them.

## Architecture

- **Monorepo**: client JS in `client/`, Python helpers in `python/`, Ruby in `ruby/`, Node in `node/`, shared fixtures in `shared/`.
- **Client**: an IIFE bundle with no dependencies. It isolates its CSS in a Shadow DOM. It never throws: every entry point is wrapped in try/catch.
- **Server helpers**: one-line middleware for Flask, Django, FastAPI, Rails/Rack, Express, Koa, Hono. They never throw. When git or the `extras` callback fails, the response has fewer fields.
- **Testing**: Vitest for JS, pytest for Python, RSpec for Ruby. All tests are deterministic: they mock git calls and use no network.

## Coding Standards

- Set all DOM content with `textContent` / `createElement`, never `innerHTML`.
- All styles are class-based CSS inside the Shadow DOM, with no inline `style=""`, so the banner works under a strict CSP.
- All timestamps are ISO 8601 UTC.
- Every server helper response has `_buildbanner: { version: 1 }`, `sha` (7-char), `sha_full` (40-char) and `server_started`.
- Banner host element: `data-testid="buildbanner"`. Segments: `data-segment="sha"`, `"branch"`, `"app-name"`, `"custom-{key}"`, etc.
- `BUILDBANNER_CUSTOM_*` env vars → `custom.*` fields (lowercased suffix).

## Reference Documents

- **Design spec**: `buildbanner-design-spec.md` is the authoritative source for the architecture decisions, the JSON contract, the client behavior and the server helper contract. Read it when a task description is ambiguous or when you need the full context of a feature.

## File Layout

```
client/          Client JS (src/, tests/, dist/)
python/          Python server helpers (Flask, Django, FastAPI)
ruby/            Ruby server helper (Rack)
node/            Node server helpers (Express, Koa, Hono)
shared/          JSON schema, test fixtures, cross-language contract
tests/           Top-level monorepo tests (scaffold, schema, docs, parity; tooling/ for scripts/)
scripts/         Repo tooling: merge gate, gate lock, hooks library, doctor, Node toolchain
.githooks/       Git hooks that keep local main read-only
```

## Conventions

- Commit messages: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
- First commit on a task branch must start with `Task N:` (e.g., `Task 7: feat: add time formatting module`).
- Every task produces tests, and the task names each test file.
- Server helper tests must mock the git subprocess or exec call. They must not depend on `.git` or the `git` binary.

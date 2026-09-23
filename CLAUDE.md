# BuildBanner

A crash-proof, language-agnostic developer info banner for web apps. Drop a `<script>` tag into any app, point it at a JSON endpoint, get a GitHub-linked admin strip.

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
- `make gate` runs `gate-wiring-check`, then `test-ruby`, `test-parity`, `test-python`, `test-js`
  and `test-tooling`. Run the one suite you are changing while you work; `make merge` runs the
  gate.
- `make doctor` comes first when a gate fails for no visible reason. `make help` lists every target.
- Prose follows `docs/writing-style.md`.

## Architecture

- **Monorepo**: client JS in `client/`, Python helpers in `python/`, Ruby in `ruby/`, Node in `node/`, shared fixtures in `shared/`.
- **Client**: zero-dependency IIFE bundle. Shadow DOM for CSS isolation. Never throws — all entry points wrapped in try/catch.
- **Server helpers**: one-liner middleware for Flask, Django, FastAPI, Rails/Rack, Express, Koa, Hono. Never throw — degrade gracefully.
- **Testing**: Vitest for JS, pytest for Python, RSpec for Ruby. All tests deterministic — mock git calls, no network.

## Coding Standards

- All DOM content via `textContent` / `createElement` — never `innerHTML`.
- All styles are class-based CSS inside Shadow DOM — no inline `style=""` (CSP safety).
- All timestamps ISO 8601 UTC.
- Server helpers: `_buildbanner: { version: 1 }`, `sha` (7-char), `sha_full` (40-char), `server_started` in every response.
- Banner host element: `data-testid="buildbanner"`. Segments: `data-segment="sha"`, `"branch"`, `"app-name"`, `"custom-{key}"`, etc.
- `BUILDBANNER_CUSTOM_*` env vars → `custom.*` fields (lowercased suffix).

## Reference Documents

- **Design spec**: `buildbanner-design-spec.md` — authoritative source for all architectural decisions, JSON contract, client behavior, server helper contract. Read it when a task description is ambiguous or you need full context on a feature.

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
- Every task produces tests. Every test file named explicitly in the task.
- Server helper tests must mock git subprocess/exec — no dependency on `.git` or `git` binary.

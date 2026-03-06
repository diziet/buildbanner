# BuildBanner

A crash-proof, language-agnostic developer info banner for web apps. Drop a `<script>` tag into any app, point it at a JSON endpoint, get a GitHub-linked admin strip.

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
tests/           Top-level monorepo tests (scaffold, schema)
```

## Conventions

- Commit messages: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
- Every task produces tests. Every test file named explicitly in the task.
- Server helper tests must mock git subprocess/exec — no dependency on `.git` or `git` binary.

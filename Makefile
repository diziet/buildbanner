# BuildBanner task runner. `make` (or `make help`) lists every target.
#
# Every project command lives here. The tool pins are the variables below; `make doctor` checks
# them and `make install` provisions them, both reading the same values. package-lock.json pins
# the npm packages and ruby/Gemfile.lock the gems.
.DEFAULT_GOAL := help
.PHONY: help install deps node-install node-lock venv bundle doctor hooks-install \
        test test-js test-python test-ruby test-parity test-tooling build clean \
        gate gate-wiring-check worktree sync merge branches-gc doc-refs-check doc-facts \
        doc-facts-check test-doc-checks

# ---- Pins (the single source; doctor and install both read these) -----------------------------
NODE_VERSION   := 26.10.0
PYTHON_VERSION := 3.14
# Homebrew's ruby formula, 4.0.7 on 2026-09-24. ruby/buildbanner.gemspec requires >= 3.1, and
# macOS's /usr/bin/ruby is 2.6. TODO: pin a Ruby version; the devops Brewfile installs the
# unversioned formula.
RUBY_BIN       := /opt/homebrew/opt/ruby/bin
UV             := uv
VENV           := .venv

# ---- Derived commands -------------------------------------------------------------------------
BIN      := $(CURDIR)/$(VENV)/bin
PY       := $(BIN)/python
FRONTEND := NODE_VERSION=$(NODE_VERSION) bash scripts/frontend.sh
# Every bundle command runs in ruby/, so the gems go to ruby/vendor/bundle.
RUBY_ENV := PATH="$(RUBY_BIN):$$PATH" BUNDLE_PATH=vendor/bundle
# Machine-wide gate lock: heavy targets queue behind each other instead of competing for cores.
LOCKED   := $(PY) scripts/gate_lock.py --
# `make branches-gc args="--delete"`.
args ?=

help: ## List targets, parsed from the double-hash comment on each rule
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | sort \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ---- Setup ------------------------------------------------------------------------------------
install: ## Sanctioned path for one-time machine setup: uv-managed Python, this tree's dependencies, hooks; ends with doctor
	$(UV) python install $(PYTHON_VERSION)
	$(MAKE) deps hooks-install
	$(MAKE) doctor

deps: node-install venv bundle ## Sanctioned path: install this tree's pinned Node and npm packages, .venv and Ruby gems (make worktree and make merge run it)

node-install: ## Sanctioned path: download the pinned Node into .tools/ and run npm ci at the root (workspaces client/ and node/)
	$(FRONTEND) install

node-lock: ## Sanctioned path: update package-lock.json after a package.json change; review the diff
	$(FRONTEND) lock

venv: ## Sanctioned path: recreate .venv with the pinned uv-managed Python and install python/ with its test extra, editable
	$(UV) venv -q --clear $(VENV) --python $(PYTHON_VERSION) --managed-python --no-python-downloads
	$(UV) pip install -q --python $(PY) -e "./python[test]"

bundle: ## Sanctioned path: install the gems in ruby/Gemfile.lock into ruby/vendor/bundle when bundle check reports one missing
	cd ruby && { $(RUBY_ENV) bundle check >/dev/null || $(RUBY_ENV) bundle install; }

doctor: ## Advisory preflight (seconds, no build, no side effects): uv, gh, Node, Python and Ruby pins, installed dependencies, hooks
	@NODE_VERSION=$(NODE_VERSION) PYTHON_VERSION=$(PYTHON_VERSION) RUBY_BIN=$(RUBY_BIN) UV=$(UV) VENV=$(VENV) \
	  bash scripts/doctor.sh

hooks-install: ## Sanctioned path for pointing core.hooksPath at .githooks in this repo
	git config core.hooksPath .githooks
	@echo "hooks: core.hooksPath=.githooks"

# ---- Tests and gates (cheapest first) ---------------------------------------------------------
test: ## Sanctioned path: every test suite the gate runs, in the gate's order, under the gate lock
	$(LOCKED) $(MAKE) -s test-ruby test-parity test-python test-js test-tooling

test-ruby: bundle ## Blocking gate: rspec for ruby/spec under RUBY_BIN's Ruby
	cd ruby && $(RUBY_ENV) bundle exec rspec

test-parity: bundle ## Blocking gate: the Python and Ruby parity suites in tests/parity/ (test-js runs the Node one)
	$(PY) -m pytest -q -p no:cacheprovider --rootdir=. tests/parity/test_python.py
	cd ruby && $(RUBY_ENV) bundle exec rspec ../tests/parity/ruby_parity_spec.rb

test-python: ## Blocking gate: pytest for python/tests in .venv
	cd python && $(BIN)/pytest

test-js: ## Blocking gate: vitest under the pinned Node for tests/ (with tests/parity/node.test.js), client/ and node/
	$(FRONTEND) exec . npm test
	$(FRONTEND) exec client npm test
	$(FRONTEND) exec node npx vitest run

test-tooling: ## Blocking gate: tests for scripts/ and .githooks/, run against throwaway git repos
	$(PY) -m pytest -q -p no:cacheprovider --rootdir=. tests/tooling

test-doc-checks: ## Blocking gate, also in the docs-only gate: pytest on tests/tooling/test_doc_checks_repo.py only (seconds); a .md edit can remove a span that test requires, and docs-only skips test-tooling
	$(PY) -m pytest -q -p no:cacheprovider --rootdir=. tests/tooling/test_doc_checks_repo.py

gate: ## Blocking gate: doc-facts-check, doc-refs-check, test-doc-checks, gate-wiring-check, then every test suite, under the gate lock (stage list in scripts/gate.sh)
	$(LOCKED) bash scripts/gate.sh

gate-wiring-check: ## Blocking gate: every test file run by exactly one suite, no orphan script, blocking targets wired
	$(PY) scripts/check_gate_wiring.py --node-version $(NODE_VERSION) --ruby-bin $(RUBY_BIN)

doc-refs-check: ## Blocking gate, fails closed: paths, make targets and --flags in tracked .md code spans must resolve; stale exemptions in docs/doc-refs-allow.txt fail
	$(PY) scripts/check_doc_refs.py

doc-facts: ## Sanctioned path: regenerate <!-- fact:NAME --> values in tracked .md files from scripts/doc_facts_registry.py
	$(PY) scripts/doc_facts.py --write

doc-facts-check: ## Blocking gate: print the diff and fail when a doc fact is stale; rewrites the value first, so the re-run needs only a re-stage
	$(PY) scripts/doc_facts.py --fix-stale

# ---- Build ------------------------------------------------------------------------------------
build: ## Sanctioned path: rebuild client/dist/ under the pinned Node; commit it with the source change
	$(FRONTEND) exec client npm run build

# TODO: client/dist/ is tracked, and client/tests/dist-fresh.test.js compares it with a fresh
# build, so after `make clean` the tree stays dirty until `make build`.
clean: ## Sanctioned path: remove client/dist/, __pycache__ directories, *.pyc files and *.egg-info directories
	rm -rf client/dist/
	find python -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -name '*.pyc' -delete 2>/dev/null || true
	find . -name '*.egg-info' -type d -exec rm -rf {} + 2>/dev/null || true

# ---- Workflow ---------------------------------------------------------------------------------
worktree: ## Sanctioned path for starting work: make worktree b=feat/name (tree in <primary>-worktrees/, own dependencies, hooks)
	@bash scripts/worktree.sh "$(b)"

sync: ## Sanctioned path for updating the current branch: fetch + fast-forward; refuses (fails closed) on a divergent local main
	@bash scripts/sync.sh

# TODO: build a report-only local watcher that re-runs the gate on each new origin/main commit
# and notifies on failure and recovery (the chess-rogue pattern). It would catch two PRs that
# each pass alone and together merge into a failing main.
merge: ## Sanctioned path for landing a PR, and the only merge path: make merge pr=N [keep=1] [dry_run=1]; gate on the preview merge
	$(PY) scripts/merge.py --pr "$(pr)" $(if $(keep),--keep,) $(if $(dry_run),--dry-run,)

branches-gc: ## Advisory: triage local branches/worktrees (merged, superseded, open-PR, checked-out); args="--delete" removes the merged class
	$(PY) scripts/branches_gc.py $(args)

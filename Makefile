.PHONY: install test test-js test-python test-ruby build clean

install:
	# npm workspaces (root package.json) covers client/ and node/
	npm install
	cd python && pip install -e ".[test]"
	cd ruby && bundle install

test: test-js test-python test-ruby

test-js:
	npm test
	cd client && npm test
	cd node && npx vitest run

test-python:
	cd python && pytest

test-ruby:
	cd ruby && bundle exec rspec

build:
	cd client && npm run build

clean:
	rm -rf client/dist/
	find python -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -name '*.pyc' -delete 2>/dev/null || true
	find . -name '*.egg-info' -type d -exec rm -rf {} + 2>/dev/null || true

# BuildBanner — Ruby Server Helper

Rack middleware that serves a `/buildbanner.json` endpoint with the git information, deploy metadata and custom fields. It works with any Rack-based framework, including Rails and Sinatra.

## Requirements

- **Ruby >= 3.1**
- **Bundler >= 2.4** — upgrade with: `gem install bundler`

The preflight script checks the Ruby and Bundler versions:

```bash
bash scripts/check-env.sh
```

## Installation

Add this line to your Gemfile:

```ruby
gem "buildbanner", github: "diziet/buildbanner", glob: "ruby/*.gemspec"
```

Then run:

```bash
bundle install
```

## Usage

### Rack

```ruby
require "buildbanner"

use BuildBanner::Middleware
run MyApp
```

### Rails

In `config/application.rb` or an initializer:

```ruby
require "buildbanner"

config.middleware.use BuildBanner::Middleware
```

### Options

```ruby
use BuildBanner::Middleware,
  path: "/buildbanner.json",       # endpoint path (default)
  token: "your-secret-token",      # optional bearer auth
  extras: -> { { "deploy_id" => "abc123" } }  # extra fields callback
```

## Environment Variables

See [shared/env-vars.md](../shared/env-vars.md) for ~~the full list of~~ the supported environment variables. Corrected 2026-09-24: that table omits `BUILDBANNER_PORT`, which this helper also reads (`lib/buildbanner.rb`). [docs/configuration.md](../docs/configuration.md#server-side-environment-variables) lists every variable.

## License

MIT

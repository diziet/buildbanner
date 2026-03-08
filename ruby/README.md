# BuildBanner — Ruby Server Helper

Rack middleware that serves a `/buildbanner.json` endpoint with git info, deploy metadata, and custom fields. Works with any Rack-based framework including Rails and Sinatra.

## Requirements

- **Ruby >= 3.1**
- **Bundler >= 2.4** — older versions (e.g. 1.17.2) crash on Ruby 3.4+ due to removed `String#untaint`. Upgrade with: `gem install bundler`

Run the preflight check to verify your environment:

```bash
bash scripts/check-env.sh
```

## Installation

Add to your Gemfile:

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

See [shared/env-vars.md](../shared/env-vars.md) for the full list of supported environment variables.

## License

MIT

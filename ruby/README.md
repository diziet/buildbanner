# BuildBanner — Ruby Server Helper

Rack middleware that serves a `/buildbanner.json` endpoint with git info, deploy metadata, and custom fields. Works with any Rack-based framework including Rails and Sinatra.

## Installation

Add to your Gemfile:

```ruby
gem "buildbanner"
```

Then run:

```bash
bundle install
```

Or install directly:

```bash
gem install buildbanner
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

| Variable | Description |
|----------|-------------|
| `BUILDBANNER_SHA` | Override git SHA |
| `BUILDBANNER_BRANCH` | Override git branch |
| `BUILDBANNER_REPO_URL` | Override repository URL |
| `BUILDBANNER_COMMIT_DATE` | Override commit date |
| `BUILDBANNER_APP_NAME` | Application name |
| `BUILDBANNER_ENVIRONMENT` | Deployment environment |
| `BUILDBANNER_DEPLOYED_AT` | Deployment timestamp |
| `BUILDBANNER_TOKEN` | Bearer token for auth |
| `BUILDBANNER_CUSTOM_*` | Custom fields (suffix lowercased) |

## License

MIT

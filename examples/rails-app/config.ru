# Minimal Rack app demonstrating BuildBanner middleware for Rails/Rack.
#
# Run with: rackup config.ru -p 3000

require 'buildbanner'

use BuildBanner::Middleware

app = proc do |_env|
  body = <<~HTML
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8"><title>Rails/Rack + BuildBanner</title></head>
    <body>
      <h1>Rack App</h1>
      <p>BuildBanner is loaded via the script tag below.</p>
      <script src="/static/buildbanner.min.js"></script>
    </body>
    </html>
  HTML
  [200, { 'Content-Type' => 'text/html' }, [body]]
end

run app

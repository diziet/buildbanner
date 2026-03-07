Gem::Specification.new do |s|
  s.name        = "buildbanner"
  s.version     = "0.1.0"
  s.summary     = "BuildBanner server helper for Rack/Rails"
  s.description = "Rack middleware that serves BuildBanner JSON with git info"
  s.authors     = ["BuildBanner Contributors"]
  s.license     = "MIT"
  s.homepage    = "https://github.com/diziet/buildbanner"
  s.files       = Dir["lib/**/*.rb"]
  s.require_paths = ["lib"]
  s.required_ruby_version = ">= 2.7"
end

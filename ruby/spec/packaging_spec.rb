# frozen_string_literal: true

require_relative '../lib/buildbanner'

RSpec.describe 'BuildBanner gem packaging' do
  it 'require "buildbanner" succeeds' do
    expect(defined?(BuildBanner)).to eq('constant')
  end

  it 'BuildBanner::Middleware is defined' do
    expect(defined?(BuildBanner::Middleware)).to eq('constant')
  end

  it 'gemspec has no runtime dependencies' do
    gemspec_path = File.join(__dir__, '..', 'buildbanner.gemspec')
    spec = Gem::Specification.load(gemspec_path)
    runtime_deps = spec.dependencies.select { |d| d.type == :runtime }
    expect(runtime_deps).to be_empty
  end
end

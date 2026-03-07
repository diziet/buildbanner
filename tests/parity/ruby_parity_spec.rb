# frozen_string_literal: true

# Parity tests — verify Ruby server helper matches shared fixtures exactly.

require 'json'
require 'rack/test'

require_relative '../../ruby/lib/buildbanner'

PARITY_FIXTURES_PATH = File.join(__dir__, '..', '..', 'shared', 'test_fixtures.json')
PARITY_FIXTURES = JSON.parse(File.read(PARITY_FIXTURES_PATH))
PARITY_DEFAULTS = PARITY_FIXTURES['defaults']

# Ruby's git log format is "%H %cd" — 2 space-separated tokens.
PARITY_GIT_LOG_OUTPUT = "#{PARITY_DEFAULTS['sha_full']} #{PARITY_DEFAULTS['commit_date']}"

TYPE_MAP = {
  'string' => String,
  'integer' => Integer,
  'object' => Hash
}.freeze

# Default git stub responses keyed by command regex.
# Word-boundary anchors prevent overlap (e.g. "git describe --tags" vs
# "git describe --tags --exact-match").
PARITY_GIT_STUBS = {
  /\bgit log\b/ => [PARITY_GIT_LOG_OUTPUT, true],
  /\bgit rev-parse --abbrev-ref HEAD\b/ => ["#{PARITY_DEFAULTS['branch']}\n", true],
  /\bgit describe --tags\b/ => ['', false],
  /\bgit remote get-url origin\b/ => ["#{PARITY_DEFAULTS['remote_url']}\n", true]
}.freeze

RSpec.describe 'Cross-language parity' do
  include Rack::Test::Methods

  let(:inner_app) { ->(_env) { [200, { 'Content-Type' => 'text/plain' }, ['ok']] } }

  def stub_git(overrides = {})
    allow(Open3).to receive(:capture2) do |*args|
      cmd = args.flatten.join(' ')
      match = overrides.find { |pattern, _| cmd.match?(pattern) }
      match ||= PARITY_GIT_STUBS.find { |pattern, _| cmd.match?(pattern) }
      if match
        output, success = match[1]
        [output, double(success?: success)]
      else
        ['', double(success?: false)]
      end
    end
  end

  def build_app(opts = {})
    mw = BuildBanner::Middleware.new(inner_app, opts)
    Rack::Test::Session.new(Rack::MockSession.new(mw))
  end

  def get_banner(session)
    session.get('/buildbanner.json')
    JSON.parse(session.last_response.body)
  end

  before { stub_git }

  after do
    %w[
      BUILDBANNER_SHA BUILDBANNER_BRANCH BUILDBANNER_REPO_URL
      BUILDBANNER_COMMIT_DATE BUILDBANNER_DEPLOYED_AT BUILDBANNER_APP_NAME
      BUILDBANNER_ENVIRONMENT BUILDBANNER_PORT BUILDBANNER_TOKEN
    ].each { |k| ENV.delete(k) }
    ENV.keys.select { |k| k.start_with?('BUILDBANNER_CUSTOM_') }.each { |k| ENV.delete(k) }
  end

  describe 'URL sanitization' do
    PARITY_FIXTURES['url_sanitization'].each do |fixture|
      input = fixture['input']
      expected = fixture['expected']

      it "sanitizes #{input.inspect} to #{expected.inspect}" do
        origin_response = if input.nil? || input.to_s.empty?
                            ['', false]
                          else
                            ["#{input}\n", true]
                          end
        stub_git(/\bgit remote get-url origin\b/ => origin_response)

        body = get_banner(build_app)
        expect(body['repo_url']).to eq(expected)
      end
    end
  end

  describe 'branch detection' do
    PARITY_FIXTURES['branch_detection'].each do |fixture|
      input = fixture['input']
      tag = fixture['tag']
      expected = fixture['expected']

      it "resolves input=#{input.inspect}, tag=#{tag.inspect} to #{expected.inspect}" do
        overrides = {
          /\bgit rev-parse --abbrev-ref HEAD\b/ => ["#{input}\n", true]
        }
        if tag
          overrides[/\bgit describe --tags --exact-match\b/] = ["#{tag}\n", true]
        else
          overrides[/\bgit describe --tags\b/] = ['', false]
        end
        stub_git(overrides)

        body = get_banner(build_app)
        actual = body['branch']
        expect(actual).to eq(expected)
      end
    end
  end

  describe '_buildbanner.version' do
    it 'is always 1' do
      body = get_banner(build_app)
      expect(body['_buildbanner']).to eq({ 'version' => 1 })
    end
  end

  describe 'sha and sha_full' do
    it 'emits both sha (7 chars) and sha_full (40 chars)' do
      body = get_banner(build_app)

      expect(body['sha'].length).to eq(7)
      expect(body['sha_full'].length).to eq(40)
      expect(body['sha']).to eq(body['sha_full'][0, 7])
    end
  end

  describe 'custom field stringification' do
    it 'integer custom value is stringified via extras' do
      app = build_app(extras: -> { { 'custom' => { 'count' => 42 } } })
      body = get_banner(app)

      expect(body['custom']['count']).to eq('42')
      expect(body['custom']['count']).to be_a(String)
    end

    it 'null custom value is omitted' do
      app = build_app(extras: -> { { 'custom' => { 'keep' => 'yes', 'drop' => nil } } })
      body = get_banner(app)

      expect(body['custom']['keep']).to eq('yes')
      expect(body['custom']).not_to have_key('drop')
    end
  end

  describe 'BUILDBANNER_CUSTOM_* env vars' do
    it 'lowercases suffix and maps to custom object' do
      ENV['BUILDBANNER_CUSTOM_MODEL'] = 'gpt-4'
      ENV['BUILDBANNER_CUSTOM_REGION'] = 'us-east-1'
      ENV['BUILDBANNER_CUSTOM_WORKERS'] = '4'

      body = get_banner(build_app)
      expect(body['custom']).to eq({
        'model' => 'gpt-4',
        'region' => 'us-east-1',
        'workers' => '4'
      })
    end

    it 'BUILDBANNER_CUSTOM_MY_KEY becomes custom.my_key' do
      ENV['BUILDBANNER_CUSTOM_MY_KEY'] = 'value'

      body = get_banner(build_app)
      expect(body['custom']).to have_key('my_key')
      expect(body['custom']['my_key']).to eq('value')
    end
  end

  describe 'JSON structure and field names' do
    it 'full response has expected top-level field names' do
      ENV['BUILDBANNER_APP_NAME'] = 'my-app'
      ENV['BUILDBANNER_ENVIRONMENT'] = 'development'
      ENV['BUILDBANNER_PORT'] = '8001'
      ENV['BUILDBANNER_DEPLOYED_AT'] = '2026-02-13T12:00:00Z'
      ENV['BUILDBANNER_CUSTOM_MODEL'] = 'gpt-4'

      body = get_banner(build_app)

      PARITY_FIXTURES['expected_top_level_keys'].each do |key|
        expect(body).to have_key(key), "Missing key: #{key}"
      end

      # Verify types from shared field_types spec
      PARITY_FIXTURES['field_types'].each do |field, json_type|
        next unless body.key?(field)

        expect(body[field]).to be_a(TYPE_MAP[json_type]),
                               "#{field} should be #{json_type}"
      end
      expect(body['_buildbanner']['version']).to eq(1)
    end

    it 'null top-level fields are omitted from response' do
      stub_git(
        /\bgit log\b/ => ['', false],
        /\bgit rev-parse\b/ => ['', false],
        /\bgit remote\b/ => ['', false],
        /\bgit describe\b/ => ['', false]
      )

      body = get_banner(build_app)
      expect(body['_buildbanner']).to eq({ 'version' => 1 })
      expect(body).to have_key('server_started')

      %w[sha branch repo_url].each do |key|
        expect(body[key]).not_to be_nil if body.key?(key)
      end
    end
  end
end

# frozen_string_literal: true

require 'json'
require 'rack/test'

require_relative '../lib/buildbanner'

# Load shared test fixtures.
FIXTURES_PATH = File.join(__dir__, '..', '..', 'shared', 'test_fixtures.json')
FIXTURES = JSON.parse(File.read(FIXTURES_PATH))

RSpec.describe BuildBanner::Middleware do
  include Rack::Test::Methods

  let(:inner_app) { ->(_env) { [200, { 'Content-Type' => 'text/plain' }, ['ok']] } }
  let(:options) { {} }
  let(:app) { described_class.new(inner_app, options) }

  # Stub all git subprocess calls by default.
  before do
    allow(Open3).to receive(:capture2) do |*args|
      cmd = args.flatten.join(' ')
      case cmd
      when /git log/
        ['abc1234567890abcdef1234567890abcdef123456 2026-01-15T10:30:00+00:00', double(success?: true)]
      when /git rev-parse --abbrev-ref HEAD/
        ["main\n", double(success?: true)]
      when /git describe --tags/
        ['', double(success?: false)]
      when /git remote get-url origin/
        ["https://github.com/org/repo.git\n", double(success?: true)]
      else
        ['', double(success?: false)]
      end
    end
  end

  after do
    # Clean up env vars after each test.
    %w[
      BUILDBANNER_SHA BUILDBANNER_BRANCH BUILDBANNER_REPO_URL
      BUILDBANNER_COMMIT_DATE BUILDBANNER_DEPLOYED_AT BUILDBANNER_APP_NAME
      BUILDBANNER_ENVIRONMENT BUILDBANNER_PORT BUILDBANNER_TOKEN
    ].each { |k| ENV.delete(k) }
    ENV.keys.select { |k| k.start_with?('BUILDBANNER_CUSTOM_') }.each { |k| ENV.delete(k) }
  end

  def json_body
    JSON.parse(last_response.body)
  end

  describe 'happy path' do
    it 'returns valid JSON with 200 status' do
      get '/buildbanner.json'
      expect(last_response.status).to eq(200)
      expect { JSON.parse(last_response.body) }.not_to raise_error
    end

    it 'includes _buildbanner.version == 1' do
      get '/buildbanner.json'
      expect(json_body['_buildbanner']['version']).to eq(1)
    end

    it 'includes sha and sha_full' do
      get '/buildbanner.json'
      expect(json_body['sha']).to eq('abc1234')
      expect(json_body['sha_full']).to eq('abc1234567890abcdef1234567890abcdef123456')
    end

    it 'includes server_started' do
      get '/buildbanner.json'
      expect(json_body['server_started']).not_to be_nil
      expect { Time.iso8601(json_body['server_started']) }.not_to raise_error
    end
  end

  describe 'env var: BUILDBANNER_APP_NAME' do
    before { ENV['BUILDBANNER_APP_NAME'] = 'my-app' }

    let(:app) { described_class.new(inner_app, options) }

    it 'maps to app_name field' do
      get '/buildbanner.json'
      expect(json_body['app_name']).to eq('my-app')
    end
  end

  describe 'env var: BUILDBANNER_CUSTOM_MODEL' do
    before { ENV['BUILDBANNER_CUSTOM_MODEL'] = 'gpt-4' }

    let(:app) { described_class.new(inner_app, options) }

    it 'maps to custom.model field' do
      get '/buildbanner.json'
      expect(json_body['custom']['model']).to eq('gpt-4')
    end
  end

  describe 'env vars override git' do
    before do
      ENV['BUILDBANNER_SHA'] = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
      ENV['BUILDBANNER_BRANCH'] = 'env-branch'
    end

    let(:app) { described_class.new(inner_app, options) }

    it 'uses env var values over git-derived values' do
      get '/buildbanner.json'
      expect(json_body['sha']).to eq('eeeeeee')
      expect(json_body['sha_full']).to eq('eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')
      expect(json_body['branch']).to eq('env-branch')
    end
  end

  describe 'URL sanitization (shared fixtures)' do
    FIXTURES['url_sanitization'].each do |fixture|
      input = fixture['input']
      expected = fixture['expected']

      it "sanitizes #{input.inspect} to #{expected.inspect}" do
        allow(Open3).to receive(:capture2) do |*args|
          cmd = args.flatten.join(' ')
          case cmd
          when /git log/
            ['abc1234567890abcdef1234567890abcdef123456 2026-01-15T10:30:00+00:00', double(success?: true)]
          when /git rev-parse --abbrev-ref HEAD/
            ["main\n", double(success?: true)]
          when /git remote get-url origin/
            if input.nil? || input.empty?
              ['', double(success?: false)]
            else
              ["#{input}\n", double(success?: true)]
            end
          else
            ['', double(success?: false)]
          end
        end

        middleware = described_class.new(inner_app, options)
        test_app = Rack::Test::Session.new(Rack::MockSession.new(middleware))
        test_app.get('/buildbanner.json')
        body = JSON.parse(test_app.last_response.body)

        expect(body['repo_url']).to eq(expected)
      end
    end
  end

  describe 'detached HEAD with tag' do
    it 'uses tag as branch' do
      allow(Open3).to receive(:capture2) do |*args|
        cmd = args.flatten.join(' ')
        case cmd
        when /git log/
          ['abc1234567890abcdef1234567890abcdef123456 2026-01-15T10:30:00+00:00', double(success?: true)]
        when /git rev-parse --abbrev-ref HEAD/
          ["HEAD\n", double(success?: true)]
        when /git describe --tags --exact-match/
          ["v1.2.3\n", double(success?: true)]
        when /git remote get-url origin/
          ["https://github.com/org/repo.git\n", double(success?: true)]
        else
          ['', double(success?: false)]
        end
      end

      middleware = described_class.new(inner_app)
      test_app = Rack::Test::Session.new(Rack::MockSession.new(middleware))
      test_app.get('/buildbanner.json')
      body = JSON.parse(test_app.last_response.body)
      expect(body['branch']).to eq('v1.2.3')
    end
  end

  describe 'detached HEAD without tag' do
    it 'returns nil branch' do
      allow(Open3).to receive(:capture2) do |*args|
        cmd = args.flatten.join(' ')
        case cmd
        when /git log/
          ['abc1234567890abcdef1234567890abcdef123456 2026-01-15T10:30:00+00:00', double(success?: true)]
        when /git rev-parse --abbrev-ref HEAD/
          ["HEAD\n", double(success?: true)]
        when /git describe --tags/
          ['', double(success?: false)]
        when /git remote get-url origin/
          ["https://github.com/org/repo.git\n", double(success?: true)]
        else
          ['', double(success?: false)]
        end
      end

      middleware = described_class.new(inner_app)
      test_app = Rack::Test::Session.new(Rack::MockSession.new(middleware))
      test_app.get('/buildbanner.json')
      body = JSON.parse(test_app.last_response.body)
      expect(body).not_to have_key('branch')
    end
  end

  describe 'extras lambda' do
    it 'merges extras into response' do
      opts = { extras: -> { { 'deploy_id' => 'abc-123', 'custom' => { 'region' => 'us-east-1' } } } }
      middleware = described_class.new(inner_app, opts)
      test_app = Rack::Test::Session.new(Rack::MockSession.new(middleware))
      test_app.get('/buildbanner.json')
      body = JSON.parse(test_app.last_response.body)

      expect(body['deploy_id']).to eq('abc-123')
      expect(body['custom']['region']).to eq('us-east-1')
    end

    it 'omits extras when lambda raises' do
      opts = { extras: -> { raise 'boom' } }
      middleware = described_class.new(inner_app, opts)
      test_app = Rack::Test::Session.new(Rack::MockSession.new(middleware))
      test_app.get('/buildbanner.json')
      body = JSON.parse(test_app.last_response.body)

      expect(body['_buildbanner']['version']).to eq(1)
      expect(body).not_to have_key('deploy_id')
    end
  end

  describe 'custom value stringification' do
    it 'converts integer to string via .to_s' do
      ENV['BUILDBANNER_CUSTOM_WORKERS'] = '42'
      middleware = described_class.new(inner_app)
      test_app = Rack::Test::Session.new(Rack::MockSession.new(middleware))
      test_app.get('/buildbanner.json')
      body = JSON.parse(test_app.last_response.body)

      expect(body['custom']['workers']).to eq('42')
      expect(body['custom']['workers']).to be_a(String)
    end
  end

  describe 'custom nil omitted' do
    it 'does not include custom keys with nil values from extras' do
      opts = { extras: -> { { 'custom' => { 'present' => 'yes', 'absent' => nil } } } }
      middleware = described_class.new(inner_app, opts)
      test_app = Rack::Test::Session.new(Rack::MockSession.new(middleware))
      test_app.get('/buildbanner.json')
      body = JSON.parse(test_app.last_response.body)

      expect(body['custom']['present']).to eq('yes')
      expect(body['custom']).not_to have_key('absent')
    end
  end

  describe 'token auth' do
    let(:valid_token) { 'super-secret-token-1234' }

    it 'returns 200 with valid token' do
      middleware = described_class.new(inner_app, token: valid_token)
      test_app = Rack::Test::Session.new(Rack::MockSession.new(middleware))
      test_app.get('/buildbanner.json', {}, 'HTTP_AUTHORIZATION' => "Bearer #{valid_token}")
      expect(test_app.last_response.status).to eq(200)
    end

    it 'returns 401 with invalid token' do
      middleware = described_class.new(inner_app, token: valid_token)
      test_app = Rack::Test::Session.new(Rack::MockSession.new(middleware))
      test_app.get('/buildbanner.json', {}, 'HTTP_AUTHORIZATION' => 'Bearer wrong-token-value-x')
      expect(test_app.last_response.status).to eq(401)
    end

    it 'disables auth with short token and logs warning' do
      logger = instance_double(Logger)
      allow(logger).to receive(:warn)
      allow(logger).to receive(:error)

      middleware = described_class.new(inner_app, token: 'short', logger: logger)
      test_app = Rack::Test::Session.new(Rack::MockSession.new(middleware))
      test_app.get('/buildbanner.json')

      expect(test_app.last_response.status).to eq(200)
      expect(logger).to have_received(:warn).with(/shorter than 16 characters/)
    end
  end

  describe 'production env with token' do
    it 'logs a warning at startup' do
      ENV['BUILDBANNER_ENVIRONMENT'] = 'production'
      logger = instance_double(Logger)
      allow(logger).to receive(:warn)
      allow(logger).to receive(:error)

      described_class.new(inner_app, token: 'super-secret-token-1234', logger: logger)

      expect(logger).to have_received(:warn).with(/production environment/)
    end
  end

  describe 'response headers' do
    it 'includes correct Content-Type and Cache-Control' do
      get '/buildbanner.json'
      expect(last_response.headers['Content-Type']).to eq('application/json')
      expect(last_response.headers['Cache-Control']).to eq('no-store')
    end
  end

  describe 'passthrough for non-matching requests' do
    it 'passes through requests to other paths' do
      get '/other-path'
      expect(last_response.status).to eq(200)
      expect(last_response.body).to eq('ok')
    end

    it 'passes through POST requests to the banner path' do
      post '/buildbanner.json'
      expect(last_response.status).to eq(200)
      expect(last_response.body).to eq('ok')
    end
  end

  describe 'server_started caching' do
    it 'returns the same server_started value on repeated calls' do
      get '/buildbanner.json'
      first_started = json_body['server_started']

      get '/buildbanner.json'
      second_started = json_body['server_started']

      expect(first_started).to eq(second_started)
    end
  end
end

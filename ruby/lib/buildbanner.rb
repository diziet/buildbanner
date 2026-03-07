# BuildBanner Ruby server helper — Rack middleware.

require 'json'
require 'logger'
require 'open3'
require 'rack/utils'
require 'time'
require 'uri'

module BuildBanner
  SHORT_SHA_LEN = 7
  MIN_SHA_FULL_LEN = 40
  MIN_TOKEN_LEN = 16
  DEFAULT_PATH = '/buildbanner.json'

  # Keys that extras callbacks cannot overwrite.
  PROTECTED_KEYS = %w[
    _buildbanner sha sha_full branch commit_date
    repo_url server_started
  ].freeze

  # Rack middleware that serves BuildBanner JSON with git info.
  class Middleware
    attr_reader :serve_path

    def initialize(app, options = {})
      @app = app
      @serve_path = options.fetch(:path, DEFAULT_PATH)
      @extras = options[:extras]
      @logger = options[:logger] || Logger.new($stderr)
      @token = _resolve_token(options[:token])
      @auth_enabled = false
      @git_info = {}
      @static_info = {}
      @custom_env = nil
      @env_config = { deployed_at: nil, app_name: nil, environment: nil, port: nil }
      @server_started = Time.now.utc.iso8601

      @git_info = _read_git_info
      @static_info = _apply_env_overrides(@git_info)
      @custom_env = _read_custom_env
      @env_config = _read_env_config

      _configure_auth
    rescue StandardError => e
      @logger.error("BuildBanner: init failed: #{e}")
      @auth_enabled = false
    end

    def call(env)
      return @app.call(env) unless _matches_request?(env)

      # Auth check runs outside the data-building rescue so that auth
      # failures are never swallowed into a 200 fallback.
      unless _check_auth(env)
        return _json_response(401, { 'error' => 'Unauthorized' })
      end

      _serve_banner
    rescue StandardError => e
      @logger.error("BuildBanner: request failed: #{e}")
      _json_response(200, { '_buildbanner' => { 'version' => 1 } })
    end

    private

    def _matches_request?(env)
      env['REQUEST_METHOD'] == 'GET' &&
        env['PATH_INFO'] == @serve_path
    end

    def _serve_banner
      data = _build_banner_data
      _json_response(200, data)
    end

    def _json_response(status, body)
      json = JSON.generate(body)
      headers = {
        'Content-Type' => 'application/json',
        'Cache-Control' => 'no-store',
      }
      [status, headers, [json]]
    end

    def _resolve_token(programmatic_token)
      return programmatic_token unless programmatic_token.nil?

      ENV['BUILDBANNER_TOKEN']
    end

    def _configure_auth
      return unless @token

      if @token.length < MIN_TOKEN_LEN
        @logger.warn(
          'BuildBanner: token is shorter than 16 characters, ' \
          'auth check disabled'
        )
        return
      end

      @auth_enabled = true

      return unless @env_config[:environment] == 'production'

      @logger.warn(
        'BuildBanner: token auth is enabled in production environment'
      )
    end

    def _check_auth(env)
      return true unless @auth_enabled

      header = env['HTTP_AUTHORIZATION']
      return false unless header&.start_with?('Bearer ')

      provided = header.sub('Bearer ', '')
      _safe_compare(provided, @token)
    end

    def _safe_compare(a, b)
      Rack::Utils.secure_compare(a, b)
    end

    def _run_git(command)
      stdout, status = Open3.capture2(*command)
      return nil unless status.success?

      stdout.strip.empty? ? nil : stdout.strip
    rescue StandardError
      nil
    end

    def _read_git_info
      sha_full = nil
      sha = nil
      commit_date = nil

      log_line = _run_git(
        ['git', 'log', '-1', '--format=%H %cd', '--date=iso-strict']
      )
      if log_line
        parts = log_line.split(' ', 2)
        sha_full = parts[0]
        sha = sha_full ? sha_full[0, SHORT_SHA_LEN] : nil
        commit_date = parts[1] if parts.length > 1
      end

      branch = _run_git(%w[git rev-parse --abbrev-ref HEAD])
      if branch == 'HEAD'
        tag = _run_git(%w[git describe --tags --exact-match])
        branch = tag
      end

      repo_url = _run_git(%w[git remote get-url origin])

      {
        sha: sha,
        sha_full: sha_full,
        branch: branch,
        commit_date: commit_date,
        repo_url: repo_url,
      }
    end

    def _apply_env_overrides(git_info)
      info = git_info.dup

      env_sha = ENV['BUILDBANNER_SHA']
      if env_sha && !env_sha.empty?
        info[:sha] = env_sha[0, SHORT_SHA_LEN]
        if env_sha.length >= MIN_SHA_FULL_LEN
          info[:sha_full] = env_sha
        else
          info[:sha_full] = nil
        end
      end

      env_branch = ENV['BUILDBANNER_BRANCH']
      info[:branch] = env_branch if env_branch && !env_branch.empty?

      env_repo = ENV['BUILDBANNER_REPO_URL']
      info[:repo_url] = env_repo if env_repo && !env_repo.empty?

      env_date = ENV['BUILDBANNER_COMMIT_DATE']
      info[:commit_date] = env_date if env_date && !env_date.empty?

      info
    end

    def _read_custom_env
      prefix = 'BUILDBANNER_CUSTOM_'
      custom = {}

      ENV.each do |key, value|
        next unless key.start_with?(prefix) && key.length > prefix.length

        suffix = key[prefix.length..-1].downcase
        custom[suffix] = value.to_s if value
      end

      custom.empty? ? nil : custom
    end

    def _read_env_config
      config = {
        deployed_at: ENV['BUILDBANNER_DEPLOYED_AT'],
        app_name: ENV['BUILDBANNER_APP_NAME'],
        environment: ENV['BUILDBANNER_ENVIRONMENT'],
        port: nil,
      }
      port_str = ENV['BUILDBANNER_PORT']
      if port_str && !port_str.empty?
        begin
          config[:port] = Integer(port_str, 10)
        rescue ArgumentError
          @logger.warn("BuildBanner: invalid BUILDBANNER_PORT=#{port_str.inspect}, ignoring")
        end
      end
      config
    end

    def _sanitize_url(raw_url)
      return nil if raw_url.nil? || raw_url.empty?

      url = raw_url

      # Convert SSH shorthand (git@host:org/repo.git) to HTTPS
      ssh_match = url.match(/^[\w.-]+@([\w.-]+):(.*)/)
      url = "https://#{ssh_match[1]}/#{ssh_match[2]}" if ssh_match

      # Convert ssh:// to https://
      url = url.sub(%r{^ssh://}, 'https://') if url.start_with?('ssh://')

      parsed = URI.parse(url)
      return nil unless parsed.host

      # Strip userinfo
      parsed.user = nil
      parsed.password = nil
      clean = parsed.to_s

      # Remove .git suffix and trailing slashes
      clean = clean.sub(/\.git$/, '')
      clean = clean.chomp('/')

      clean
    rescue URI::InvalidURIError
      nil
    end

    def _build_banner_data
      data = {
        '_buildbanner' => { 'version' => 1 },
        'sha' => @static_info[:sha],
        'sha_full' => @static_info[:sha_full],
        'branch' => @static_info[:branch],
        'commit_date' => @static_info[:commit_date],
        'repo_url' => _sanitize_url(@static_info[:repo_url]),
        'server_started' => @server_started,
        'deployed_at' => @env_config[:deployed_at],
        'app_name' => @env_config[:app_name],
        'environment' => @env_config[:environment],
        'port' => @env_config[:port],
      }

      custom = @custom_env ? @custom_env.dup : nil
      custom = _apply_extras(data, custom)
      data['custom'] = _clean_custom(custom) if custom && !custom.empty?

      # Remove nil top-level fields
      data.reject! { |_, v| v.nil? }

      data
    end

    def _apply_extras(data, custom)
      return custom unless @extras.respond_to?(:call)

      result = @extras.call
      return custom unless result.is_a?(Hash)

      result.each do |key, value|
        key_s = key.to_s
        if key_s == 'custom' && value.is_a?(Hash)
          custom ||= {}
          value.each do |ck, cv|
            next if cv.nil?

            custom[ck.to_s] = cv.to_s
          end
        elsif !PROTECTED_KEYS.include?(key_s)
          data[key_s] = value
        end
      end

      custom
    rescue StandardError => e
      @logger.error("BuildBanner: extras callback threw: #{e}")
      custom
    end

    def _clean_custom(custom)
      cleaned = {}
      custom.each do |k, v|
        next if v.nil?

        cleaned[k.to_s] = v.to_s
      end
      cleaned.empty? ? nil : cleaned
    end
  end
end

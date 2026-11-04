# Dujiao-Next config, based on config.yml.example from v1.5.2.
# deploy.sh replaces every double-underscore placeholder with the values kept in /opt/dujiao-next/.env,
# so no secret is stored in this file.

app:
  secret_key: __APP_SECRET_KEY__ # AES-256 root key for sensitive data; back it up together with the database
  totp_issuer: AIStudio365

server:
  host: 0.0.0.0
  port: 8080
  mode: release
  # nginx reaches the container through docker-proxy, so requests arrive from the
  # Docker network gateway (fixed in docker-compose.sqlite.yml).
  trusted_proxies:
    - 127.0.0.1/32
    - ::1/128
    - 172.30.65.1/32

log:
  dir: ""
  filename: app.log
  max_size_mb: 100
  max_backups: 7
  max_age_days: 30
  compress: true

database:
  driver: sqlite
  dsn: /app/db/dujiao.db
  pool:
    max_open_conns: 1
    max_idle_conns: 1
    conn_max_lifetime_seconds: 0
    conn_max_idle_time_seconds: 0

jwt:
  secret: __JWT_SECRET__
  expire_hours: 24

user_jwt:
  secret: __USER_JWT_SECRET__
  expire_hours: 24
  remember_me_expire_hours: 168

bootstrap:
  # The first admin comes from DJ_DEFAULT_ADMIN_USERNAME / DJ_DEFAULT_ADMIN_PASSWORD in .env.
  default_admin_username: ""
  default_admin_password: ""

telegram_auth:
  enabled: false
  bot_username: ""
  bot_token: ""
  client_secret: ""
  oidc_redirect_uri: ""   # https://aistudio365.duckdns.org/auth/telegram/callback
  mini_app_url: ""
  login_expire_seconds: 300
  replay_ttl_seconds: 300

google_auth:
  enabled: false
  client_id: ""

redis:
  enabled: true
  host: redis
  port: 6379
  password: "__REDIS_PASSWORD__"
  db: 0
  prefix: "dj"

queue:
  enabled: true
  host: redis
  port: 6379
  password: "__REDIS_PASSWORD__"
  db: 1
  concurrency: 10
  queues:
    default: 10
    critical: 5
  upstream_sync_interval: "5m"

upload:
  max_size: 10485760
  allowed_types:
    - image/jpeg
    - image/png
    - image/gif
    - image/webp
  allowed_extensions:
    - .jpg
    - .jpeg
    - .png
    - .gif
    - .webp
  max_width: 4096
  max_height: 4096

cors:
  allowed_origins:
    - "*"
  allowed_methods:
    - GET
    - POST
    - PUT
    - PATCH
    - DELETE
    - OPTIONS
  allowed_headers:
    - Content-Type
    - Content-Length
    - Accept-Encoding
    - Authorization
    - Cache-Control
    - X-Requested-With
    - X-CSRF-Token
  allow_credentials: true
  max_age: 600

security:
  login_rate_limit:
    window_seconds: 300
    max_attempts: 5
    block_seconds: 900
  password_policy:
    min_length: 8
    require_upper: true
    require_lower: true
    require_number: true
    require_special: false

# Fill in a real SMTP account to send verification codes and order emails.
email:
  enabled: true
  host: smtp.xxx.com
  port: 465
  username: your-username
  password: your-password
  from: your-email
  from_name: AIStudio365
  use_tls: false
  use_ssl: true
  verify_code:
    expire_minutes: 10
    send_interval_seconds: 60
    max_attempts: 5
    length: 6

order:
  payment_expire_minutes: 15
  max_refund_days: 30

reseller:
  enabled: false
  main_hosts:
    - aistudio365.duckdns.org
    - localhost
    - 127.0.0.1
    - "::1"
  trusted_forwarded_host: false
  subdomain_base: ""
  self_apply_enabled: true
  settlement_confirm_days: 7

web:
  admin_path: "__ADMIN_PATH__"

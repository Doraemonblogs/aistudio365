/**
 * Schema migrations, applied in order. PRAGMA user_version holds how many have run, so add new
 * migrations to the end and never edit one that has shipped.
 *
 * Money is integer cents (分). Timestamps are UTC ISO-8601 strings.
 */
export const migrations: readonly string[] = [
  `
  CREATE TABLE categories (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL,
    sort        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL
  );

  CREATE TABLE products (
    id              INTEGER PRIMARY KEY,
    category_id     INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    name            TEXT    NOT NULL,
    summary         TEXT    NOT NULL DEFAULT '',
    description     TEXT    NOT NULL DEFAULT '',
    instructions    TEXT    NOT NULL DEFAULT '',
    price           INTEGER NOT NULL CHECK (price >= 0),
    original_price  INTEGER CHECK (original_price IS NULL OR original_price >= 0),
    image           TEXT    NOT NULL DEFAULT '',
    qr_wechat       TEXT    NOT NULL DEFAULT '',
    qr_alipay       TEXT    NOT NULL DEFAULT '',
    stock           INTEGER NOT NULL DEFAULT -1 CHECK (stock >= -1),
    max_qty         INTEGER NOT NULL DEFAULT 10 CHECK (max_qty >= 1),
    card_mode       TEXT    NOT NULL DEFAULT 'fixed' CHECK (card_mode IN ('fixed', 'pool')),
    card_text       TEXT    NOT NULL DEFAULT '',
    status          TEXT    NOT NULL DEFAULT 'on' CHECK (status IN ('on', 'off')),
    sort            INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL
  );
  CREATE INDEX idx_products_listing ON products (status, sort DESC, id);

  CREATE TABLE orders (
    id            INTEGER PRIMARY KEY,
    order_no      TEXT    NOT NULL UNIQUE,
    phone         TEXT    NOT NULL,
    product_id    INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name  TEXT    NOT NULL,
    unit_price    INTEGER NOT NULL CHECK (unit_price >= 0),
    quantity      INTEGER NOT NULL CHECK (quantity >= 1),
    amount        INTEGER NOT NULL CHECK (amount >= 0),
    pay_method    TEXT    NOT NULL CHECK (pay_method IN ('wechat', 'alipay')),
    status        TEXT    NOT NULL CHECK (status IN ('pending', 'paid', 'completed', 'cancelled')),
    cards         TEXT    NOT NULL DEFAULT '[]',
    admin_note    TEXT    NOT NULL DEFAULT '',
    client_ip     TEXT    NOT NULL DEFAULT '',
    created_at    TEXT    NOT NULL,
    expire_at     TEXT    NOT NULL,
    paid_at       TEXT,
    completed_at  TEXT,
    cancelled_at  TEXT
  );
  CREATE INDEX idx_orders_phone  ON orders (phone, created_at);
  CREATE INDEX idx_orders_status ON orders (status, created_at);
  CREATE INDEX idx_orders_paid   ON orders (paid_at);

  CREATE TABLE cards (
    id          INTEGER PRIMARY KEY,
    product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    content     TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'sold')),
    order_id    INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    created_at  TEXT    NOT NULL,
    sold_at     TEXT
  );
  CREATE INDEX idx_cards_product ON cards (product_id, status);

  CREATE TABLE settings (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
  );

  CREATE TABLE admins (
    id             INTEGER PRIMARY KEY,
    username       TEXT NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL,
    last_login_at  TEXT,
    created_at     TEXT NOT NULL
  );
  `,
  // v2: admin login sessions. Only a SHA-256 of each session token is stored.
  `
  CREATE TABLE sessions (
    token_hash  TEXT PRIMARY KEY,
    admin_id    INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL,
    expires_at  TEXT NOT NULL
  );
  CREATE INDEX idx_sessions_expires ON sessions (expires_at);
  `,
];

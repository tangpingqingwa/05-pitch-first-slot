-- Durable local payment intents and provider delivery ledger.
-- A listing may have only one unresolved checkout at a time. A deterministic
-- provider failure is released; an unknown response stays reserved for
-- operator reconciliation instead of risking a second charge.
CREATE TABLE checkout_sessions (
  intent_id TEXT PRIMARY KEY,
  provider_checkout_id TEXT UNIQUE,
  provider_order_id TEXT UNIQUE,
  webhook_id TEXT UNIQUE,
  listing_id TEXT NOT NULL,
  week_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency = 'usd'),
  charge_cents INTEGER NOT NULL CHECK (charge_cents >= 100 AND charge_cents % 100 = 0),
  target_cents INTEGER NOT NULL CHECK (target_cents >= 500 AND target_cents % 100 = 0),
  status TEXT NOT NULL CHECK (status IN ('creating', 'pending', 'paid', 'provider_failed', 'provider_unknown')),
  checkout_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  paid_at TEXT,
  failure_reason TEXT,
  FOREIGN KEY (listing_id) REFERENCES listings(id)
);

CREATE UNIQUE INDEX checkout_sessions_active_listing
  ON checkout_sessions (listing_id)
  WHERE status IN ('creating', 'pending', 'provider_unknown');

CREATE INDEX checkout_sessions_listing_status
  ON checkout_sessions (listing_id, status);

CREATE TABLE checkout_events (
  webhook_id TEXT PRIMARY KEY,
  provider_order_id TEXT NOT NULL UNIQUE,
  provider_checkout_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type = 'order.paid'),
  payload TEXT NOT NULL,
  received_at TEXT NOT NULL,
  FOREIGN KEY (provider_checkout_id) REFERENCES checkout_sessions(provider_checkout_id)
);

CREATE INDEX checkout_events_checkout
  ON checkout_events (provider_checkout_id);

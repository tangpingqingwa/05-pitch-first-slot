-- Durable Waffo intents and verified-delivery ledger.
-- The old checkout_sessions table remains for historical schema compatibility;
-- production selection uses these Waffo-specific tables exclusively.
CREATE TABLE waffo_checkout_intents (
  intent_id TEXT PRIMARY KEY,
  intent_fingerprint TEXT NOT NULL,
  normalized_payload TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  week_id TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  company TEXT NOT NULL,
  one_liner TEXT NOT NULL,
  base_bid_cents INTEGER NOT NULL CHECK (base_bid_cents >= 0 AND base_bid_cents % 100 = 0),
  base_week_id TEXT,
  base_paid_at TEXT,
  target_bid_cents INTEGER NOT NULL CHECK (target_bid_cents >= 500 AND target_bid_cents % 100 = 0),
  charge_cents INTEGER NOT NULL CHECK (charge_cents >= 100 AND charge_cents % 100 = 0),
  store_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('waffo-test', 'waffo-prod')),
  currency TEXT NOT NULL CHECK (currency = 'USD'),
  tax_category TEXT NOT NULL CHECK (tax_category = 'digital_goods'),
  status TEXT NOT NULL CHECK (status IN ('creating', 'open', 'unknown', 'paid', 'rejected', 'needs_reconciliation')),
  provider_checkout_id TEXT UNIQUE,
  provider_order_id TEXT UNIQUE,
  provider_payment_id TEXT UNIQUE,
  provider_delivery_id TEXT,
  checkout_url TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  paid_at TEXT,
  failure_reason TEXT,
  FOREIGN KEY (listing_id) REFERENCES listings(id)
);

CREATE UNIQUE INDEX waffo_checkout_intents_active_listing
  ON waffo_checkout_intents (listing_id)
  WHERE status IN ('creating', 'open', 'unknown');

CREATE INDEX waffo_checkout_intents_fingerprint
  ON waffo_checkout_intents (intent_fingerprint);

CREATE INDEX waffo_checkout_intents_listing_status
  ON waffo_checkout_intents (listing_id, status);

CREATE TABLE waffo_checkout_events (
  delivery_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  event_id TEXT NOT NULL,
  raw_hash TEXT NOT NULL,
  normalized_hash TEXT NOT NULL,
  payment_id TEXT,
  order_id TEXT,
  intent_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('processing', 'accepted', 'duplicate', 'rejected', 'needs_reconciliation')),
  reason TEXT,
  event_timestamp TEXT,
  received_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  FOREIGN KEY (intent_id) REFERENCES waffo_checkout_intents(intent_id)
);

CREATE UNIQUE INDEX waffo_checkout_events_business_event
  ON waffo_checkout_events (event_type, event_id)
  WHERE outcome IN ('processing', 'accepted', 'needs_reconciliation');

CREATE UNIQUE INDEX waffo_checkout_events_payment
  ON waffo_checkout_events (payment_id)
  WHERE payment_id IS NOT NULL AND outcome IN ('processing', 'accepted', 'needs_reconciliation');

CREATE UNIQUE INDEX waffo_checkout_events_order
  ON waffo_checkout_events (order_id)
  WHERE order_id IS NOT NULL AND outcome IN ('processing', 'accepted', 'needs_reconciliation');

CREATE UNIQUE INDEX waffo_checkout_events_intent
  ON waffo_checkout_events (intent_id)
  WHERE intent_id IS NOT NULL AND outcome IN ('processing', 'accepted', 'needs_reconciliation');

CREATE INDEX waffo_checkout_events_intent_lookup
  ON waffo_checkout_events (intent_id, received_at);

CREATE TABLE waffo_webhook_attempts (
  attempt_id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id TEXT NOT NULL,
  raw_hash TEXT NOT NULL,
  normalized_hash TEXT NOT NULL,
  outcome TEXT NOT NULL,
  reason TEXT,
  received_at TEXT NOT NULL,
  UNIQUE (delivery_id, raw_hash)
);

CREATE INDEX waffo_webhook_attempts_delivery
  ON waffo_webhook_attempts (delivery_id, received_at);

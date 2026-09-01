-- Reserve every verified provider identity, including rejected and
-- needs_reconciliation deliveries. A rejected identity must never be reused
-- by a corrected payload to create a later rank.
DROP INDEX IF EXISTS waffo_checkout_events_business_event;
DROP INDEX IF EXISTS waffo_checkout_events_payment;
DROP INDEX IF EXISTS waffo_checkout_events_order;
DROP INDEX IF EXISTS waffo_checkout_events_intent;

CREATE UNIQUE INDEX waffo_checkout_events_business_event
  ON waffo_checkout_events (event_type, event_id);

CREATE UNIQUE INDEX waffo_checkout_events_payment
  ON waffo_checkout_events (payment_id)
  WHERE payment_id IS NOT NULL;

CREATE UNIQUE INDEX waffo_checkout_events_order
  ON waffo_checkout_events (order_id)
  WHERE order_id IS NOT NULL;

CREATE UNIQUE INDEX waffo_checkout_events_intent
  ON waffo_checkout_events (intent_id)
  WHERE intent_id IS NOT NULL;

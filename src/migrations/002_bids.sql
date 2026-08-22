-- One current paid bid per listing per UTC week. Amount is integer USD cents.
CREATE TABLE bids (
  listing_id TEXT NOT NULL,
  week_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 500 AND amount_cents % 100 = 0),
  paid_at TEXT NOT NULL,
  PRIMARY KEY (listing_id, week_id),
  FOREIGN KEY (listing_id) REFERENCES listings(id)
);

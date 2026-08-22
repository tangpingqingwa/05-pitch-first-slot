-- Public outbound clicks. Start at 0; only real increments.
CREATE TABLE clicks (
  listing_id TEXT PRIMARY KEY,
  count INTEGER NOT NULL CHECK (count >= 0),
  FOREIGN KEY (listing_id) REFERENCES listings(id)
);

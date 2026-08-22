-- Listings persist across weeks. Rank lives on paid bids (later PR).
CREATE TABLE listings (
  id TEXT PRIMARY KEY,
  company TEXT NOT NULL CHECK (length(trim(company)) BETWEEN 1 AND 80),
  one_liner TEXT NOT NULL CHECK (length(trim(one_liner)) BETWEEN 1 AND 140),
  url TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  contact_email TEXT
);

import type { AppDb } from "../db.js";
import { getListingById, type Listing } from "./listing.js";
import { currentWeekId, type WeekId } from "./week.js";

export const MIN_BID_USD = 5;

export type Bid = {
  listingId: string;
  weekId: WeekId;
  amountUsd: number;
  paidAt: string;
};

export type RankedListing = Listing & {
  bid: Bid;
  rank: number;
};

export type BidQuote = {
  chargeUsd: number;
  nextUsd: number;
};

export class BidError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = "BidError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

type BidRow = {
  listing_id: string;
  week_id: string;
  amount_cents: number;
  paid_at: string;
};

type ListingRow = {
  id: string;
  company: string;
  one_liner: string;
  url: string;
  created_at: string;
  contact_email: string | null;
};

type RankJoinRow = ListingRow & BidRow;

function mapListing(row: ListingRow): Listing {
  return {
    id: row.id,
    company: row.company,
    oneLiner: row.one_liner,
    url: row.url,
    createdAt: row.created_at,
    ...(row.contact_email ? { contactEmail: row.contact_email } : {}),
  };
}

function mapBid(row: BidRow): Bid {
  return {
    listingId: row.listing_id,
    weekId: row.week_id,
    amountUsd: row.amount_cents / 100,
    paidAt: row.paid_at,
  };
}

export function parseBidUsd(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }
  throw new BidError("invalid_bid", "bid must be a whole-dollar USD amount");
}

export function rankKey(
  bid: Bid,
  listing: Listing,
): [number, string, string, string] {
  return [-bid.amountUsd, bid.paidAt, listing.createdAt, listing.id];
}

export function compareRank(
  a: { bid: Bid; listing: Listing },
  b: { bid: Bid; listing: Listing },
): number {
  const left = rankKey(a.bid, a.listing);
  const right = rankKey(b.bid, b.listing);
  for (let i = 0; i < left.length; i += 1) {
    const av = left[i]!;
    const bv = right[i]!;
    if (av < bv) {
      return -1;
    }
    if (av > bv) {
      return 1;
    }
  }
  return 0;
}

export function rankListings(
  rows: readonly { bid: Bid; listing: Listing }[],
  weekId: WeekId,
): RankedListing[] {
  const current = rows.filter((row) => row.bid.weekId === weekId);
  const ordered = [...current].sort(compareRank);
  return ordered.map((row, index) => ({
    ...row.listing,
    bid: row.bid,
    rank: index + 1,
  }));
}

export function quoteBid(current: Bid | undefined, nextUsd: number): BidQuote {
  if (!Number.isInteger(nextUsd)) {
    throw new BidError("invalid_bid", "bid must be a whole-dollar USD amount");
  }
  if (nextUsd < MIN_BID_USD) {
    throw new BidError("min_bid", `first bid must be at least $${MIN_BID_USD}`);
  }
  if (current === undefined) {
    return { chargeUsd: nextUsd, nextUsd };
  }
  if (nextUsd <= current.amountUsd) {
    throw new BidError(
      "bid_not_higher",
      "raise must be greater than the current bid",
    );
  }
  return { chargeUsd: nextUsd - current.amountUsd, nextUsd };
}

export function getBid(
  db: AppDb,
  listingId: string,
  weekId: WeekId,
): Bid | undefined {
  const row = db
    .prepare<[string, string], BidRow>(
      `SELECT listing_id, week_id, amount_cents, paid_at
       FROM bids
       WHERE listing_id = ? AND week_id = ?`,
    )
    .get(listingId, weekId);
  return row ? mapBid(row) : undefined;
}

export function applyPaidBid(
  db: AppDb,
  listingId: string,
  weekId: WeekId,
  nextUsd: number,
  paidAt: string,
): Bid {
  const quote = quoteBid(getBid(db, listingId, weekId), nextUsd);
  db.prepare(
    `INSERT INTO bids (listing_id, week_id, amount_cents, paid_at)
     VALUES (@listingId, @weekId, @amountCents, @paidAt)
     ON CONFLICT(listing_id, week_id) DO UPDATE SET
       amount_cents = excluded.amount_cents,
       paid_at = excluded.paid_at`,
  ).run({
    listingId,
    weekId,
    amountCents: quote.nextUsd * 100,
    paidAt,
  });
  return {
    listingId,
    weekId,
    amountUsd: quote.nextUsd,
    paidAt,
  };
}

export function placePaidBid(
  db: AppDb,
  listingId: string,
  nextUsd: unknown,
  now: Date = new Date(),
): { bid: Bid; chargeUsd: number; listing: Listing } {
  const listing = getListingById(db, listingId);
  if (listing === undefined) {
    throw new BidError("listing_not_found", "listing not found", 404);
  }
  const weekId = currentWeekId(now);
  const amountUsd = parseBidUsd(nextUsd);
  const current = getBid(db, listingId, weekId);
  const quote = quoteBid(current, amountUsd);
  const bid = applyPaidBid(
    db,
    listingId,
    weekId,
    quote.nextUsd,
    now.toISOString(),
  );
  return { bid, chargeUsd: quote.chargeUsd, listing };
}

export function rankedBoard(
  db: AppDb,
  weekId: WeekId = currentWeekId(),
): RankedListing[] {
  const rows = db
    .prepare<[string], RankJoinRow>(
      `SELECT l.id, l.company, l.one_liner, l.url, l.created_at, l.contact_email,
              b.listing_id, b.week_id, b.amount_cents, b.paid_at
       FROM bids b
       JOIN listings l ON l.id = b.listing_id
       WHERE b.week_id = ?`,
    )
    .all(weekId);
  return rankListings(
    rows.map((row) => ({ bid: mapBid(row), listing: mapListing(row) })),
    weekId,
  );
}

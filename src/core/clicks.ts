/** Public click counts start at 0 and only increment. */

import type { AppDb } from "../db.js";
import { getListingById } from "./listing.js";

export type Click = {
  listingId: string;
  count: number;
};

export class ClickError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = "ClickError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

type ClickRow = {
  listing_id: string;
  count: number;
};

export function getClickCount(db: AppDb, listingId: string): number {
  const row = db
    .prepare<[string], ClickRow>(
      `SELECT listing_id, count FROM clicks WHERE listing_id = ?`,
    )
    .get(listingId);
  return row?.count ?? 0;
}

export function clickCountsByListing(db: AppDb): Map<string, number> {
  const rows = db
    .prepare<[], ClickRow>(`SELECT listing_id, count FROM clicks`)
    .all();
  return new Map(rows.map((row) => [row.listing_id, row.count]));
}

/** Increment by 1 after a confirmed click. Never seed or copy another listing. */
export function incrementClick(
  db: AppDb,
  listingId: string,
): { click: Click; url: string } {
  const listing = getListingById(db, listingId);
  if (listing === undefined) {
    throw new ClickError("listing_not_found", "listing not found", 404);
  }
  db.prepare(
    `INSERT INTO clicks (listing_id, count) VALUES (?, 1)
     ON CONFLICT(listing_id) DO UPDATE SET count = count + 1`,
  ).run(listingId);
  return {
    click: { listingId, count: getClickCount(db, listingId) },
    url: listing.url,
  };
}

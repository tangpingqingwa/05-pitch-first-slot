import { randomUUID } from "node:crypto";
import type { AppDb } from "../db.js";
import { canonicalizeUrl, UrlError } from "./url.js";

export type Listing = {
  id: string;
  company: string;
  oneLiner: string;
  url: string;
  createdAt: string;
  contactEmail?: string;
};

export class ListingError extends Error {
  readonly code: string;
  readonly statusCode = 400;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ListingError";
    this.code = code;
  }
}

type ListingRow = {
  id: string;
  company: string;
  one_liner: string;
  url: string;
  created_at: string;
  contact_email: string | null;
};

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return value.trim();
}

function requireText(
  value: unknown,
  field: string,
  code: string,
  max: number,
): string {
  const text = asTrimmedString(value);
  if (text === undefined || text.length < 1 || text.length > max) {
    throw new ListingError(code, `${field} must be 1–${max} characters`);
  }
  return text;
}

function requireHttpsUrl(value: unknown): string {
  const text = asTrimmedString(value);
  if (text === undefined || text.length < 1) {
    throw new ListingError("invalid_url", "url must be an https URL");
  }
  try {
    return canonicalizeUrl(text);
  } catch (err) {
    if (err instanceof UrlError) {
      throw new ListingError(err.code, err.message);
    }
    throw err;
  }
}

function optionalContactEmail(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const text = asTrimmedString(value);
  if (text === undefined || text.length < 1) {
    return undefined;
  }
  if (!text.includes("@") || text.length > 254) {
    throw new ListingError("invalid_contact_email", "contact email is invalid");
  }
  return text;
}

export function validateListing(body: unknown): {
  company: string;
  oneLiner: string;
  url: string;
  contactEmail?: string;
} {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ListingError("invalid_listing", "listing body must be an object");
  }
  const input = body as Record<string, unknown>;
  const company = requireText(input.company, "company", "invalid_company", 80);
  const oneLiner = requireText(
    input.oneLiner,
    "oneLiner",
    "invalid_one_liner",
    140,
  );
  const url = requireHttpsUrl(input.url);
  const contactEmail = optionalContactEmail(input.contactEmail);
  return contactEmail === undefined
    ? { company, oneLiner, url }
    : { company, oneLiner, url, contactEmail };
}

function mapRow(row: ListingRow): Listing {
  return {
    id: row.id,
    company: row.company,
    oneLiner: row.one_liner,
    url: row.url,
    createdAt: row.created_at,
    ...(row.contact_email ? { contactEmail: row.contact_email } : {}),
  };
}

export function getListingById(db: AppDb, id: string): Listing | undefined {
  const row = db
    .prepare<[string], ListingRow>(
      `SELECT id, company, one_liner, url, created_at, contact_email
       FROM listings
       WHERE id = ?`,
    )
    .get(id);
  return row ? mapRow(row) : undefined;
}

export function getListingByUrl(db: AppDb, url: string): Listing | undefined {
  const row = db
    .prepare<[string], ListingRow>(
      `SELECT id, company, one_liner, url, created_at, contact_email
       FROM listings
       WHERE url = ?`,
    )
    .get(url);
  return row ? mapRow(row) : undefined;
}

export function listListings(db: AppDb): Listing[] {
  return db
    .prepare<[], ListingRow>(
      `SELECT id, company, one_liner, url, created_at, contact_email
       FROM listings
       ORDER BY created_at ASC, id ASC`,
    )
    .all()
    .map(mapRow);
}

export function createListing(
  db: AppDb,
  body: unknown,
  now: Date = new Date(),
): Listing {
  const input = validateListing(body);
  const existing = getListingByUrl(db, input.url);
  if (existing) {
    return existing;
  }
  const listing: Listing = {
    id: randomUUID(),
    company: input.company,
    oneLiner: input.oneLiner,
    url: input.url,
    createdAt: now.toISOString(),
    ...(input.contactEmail ? { contactEmail: input.contactEmail } : {}),
  };
  db.prepare(
    `INSERT INTO listings (id, company, one_liner, url, created_at, contact_email)
     VALUES (@id, @company, @oneLiner, @url, @createdAt, @contactEmail)`,
  ).run({
    id: listing.id,
    company: listing.company,
    oneLiner: listing.oneLiner,
    url: listing.url,
    createdAt: listing.createdAt,
    contactEmail: listing.contactEmail ?? null,
  });
  return listing;
}

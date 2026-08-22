import { randomUUID } from "node:crypto";
import { getListingById } from "../core/listing.js";
import { applyPaidBid, BidError, getBid, quoteBid } from "../core/rank.js";
import type { AppDb } from "../db.js";
import type { CheckoutStart, CreateCheckoutInput, PolarPort } from "./polar.js";

export type FixtureCheckoutStatus = "pending" | "paid";

export type FixtureCheckoutRecord = {
  checkoutId: string;
  listingId: string;
  weekId: string;
  chargeUsd: number;
  nextUsd: number;
  url: string;
  status: FixtureCheckoutStatus;
};

export type PolarFixtureOptions = {
  /** Default true: createCheckout immediately applyPaid. Tests may turn this off. */
  autoSettle?: boolean;
};

export function fixtureCheckoutUrl(checkoutId: string): string {
  return `/checkout/complete?checkoutId=${encodeURIComponent(checkoutId)}`;
}

export class PolarError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = "PolarError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

/** In-process Polar. No network. Completing a checkout writes the paid bid. */
export class PolarFixture implements PolarPort {
  private readonly sessions = new Map<string, FixtureCheckoutRecord>();
  private readonly autoSettle: boolean;

  constructor(
    private readonly db: AppDb,
    options: PolarFixtureOptions = {},
  ) {
    this.autoSettle = options.autoSettle ?? true;
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutStart> {
    if (getListingById(this.db, input.listingId) === undefined) {
      throw new BidError("listing_not_found", "listing not found", 404);
    }
    const current = getBid(this.db, input.listingId, input.weekId);
    const quote = quoteBid(current, input.nextUsd);
    if (quote.chargeUsd !== input.chargeUsd) {
      throw new PolarError(
        "charge_mismatch",
        `chargeUsd must be ${quote.chargeUsd}`,
      );
    }

    const checkoutId = `fix_${randomUUID()}`;
    const url = fixtureCheckoutUrl(checkoutId);
    this.sessions.set(checkoutId, {
      checkoutId,
      listingId: input.listingId,
      weekId: input.weekId,
      chargeUsd: quote.chargeUsd,
      nextUsd: quote.nextUsd,
      url,
      status: "pending",
    });

    if (this.autoSettle) {
      await this.applyPaid(checkoutId, new Date().toISOString());
    }

    return { checkoutId, url };
  }

  getCheckout(checkoutId: string): FixtureCheckoutRecord | undefined {
    const session = this.sessions.get(checkoutId);
    return session ? { ...session } : undefined;
  }

  async applyPaid(checkoutId: string, paidAt: string): Promise<void> {
    const session = this.sessions.get(checkoutId);
    if (!session) {
      throw new PolarError(
        "unknown_checkout",
        `unknown checkout ${checkoutId}`,
        404,
      );
    }
    if (session.status === "paid") {
      return;
    }
    applyPaidBid(
      this.db,
      session.listingId,
      session.weekId,
      session.nextUsd,
      paidAt,
    );
    session.status = "paid";
  }
}

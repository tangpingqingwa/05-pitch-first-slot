import { randomUUID } from "node:crypto";
import { getListingById } from "../core/listing.js";
import { applyPaidBid, BidError, getBidInRollingWeek, quoteBid } from "../core/rank.js";
import type { AppDb } from "../db.js";
import type {
  CheckoutStart,
  CreateCheckoutInput,
  PolarPort,
  PolarWebhookResult,
} from "./polar.js";

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
  now?: () => Date;
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
  readonly kind = "fixture" as const;
  private readonly sessions = new Map<string, FixtureCheckoutRecord>();
  private readonly autoSettle: boolean;
  private readonly now: () => Date;

  constructor(
    private readonly db: AppDb,
    options: PolarFixtureOptions = {},
  ) {
    this.autoSettle = options.autoSettle ?? true;
    this.now = options.now ?? (() => new Date());
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutStart> {
    if (getListingById(this.db, input.listingId) === undefined) {
      throw new BidError("listing_not_found", "listing not found", 404);
    }
    // Same listing still inside last 7 days is a raise. weekId is not the raise key.
    const current = getBidInRollingWeek(this.db, input.listingId, this.now());
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
      weekId: current?.weekId ?? input.weekId,
      chargeUsd: quote.chargeUsd,
      nextUsd: quote.nextUsd,
      url,
      status: "pending",
    });

    if (this.autoSettle) {
      await this.applyPaid(checkoutId, this.now().toISOString());
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
      this.now(),
    );
    session.status = "paid";
  }

  async handleWebhook(
    rawBody: string,
    _headers: Record<string, string>,
    paidAt: string,
  ): Promise<PolarWebhookResult> {
    const checkoutId = extractFixtureCheckoutId(parseFixtureWebhookJson(rawBody));
    if (!checkoutId) {
      throw new PolarError("invalid_webhook", "webhook missing checkout id");
    }
    await this.applyPaid(checkoutId, paidAt);
    return { checkoutId, paidAt };
  }
}

function parseFixtureWebhookJson(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return null;
  }
}

function extractFixtureCheckoutId(body: unknown): string | undefined {
  if (!isRecord(body)) {
    return undefined;
  }
  const direct =
    readString(body.checkoutId) ??
    readString(body.polarCheckoutId) ??
    readString(body.checkout_id) ??
    readString(body.id);
  if (direct) {
    return direct;
  }
  const data = isRecord(body.data) ? body.data : undefined;
  if (!data) {
    return undefined;
  }
  const nestedCheckout = isRecord(data.checkout) ? data.checkout : undefined;
  return (
    readString(data.checkoutId) ??
    readString(data.checkout_id) ??
    readString(data.id) ??
    (nestedCheckout ? readString(nestedCheckout.id) : undefined)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

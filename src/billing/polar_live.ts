import { createHmac, timingSafeEqual } from "node:crypto";
import {
  polarAccessToken,
  polarApiBase,
  polarFixtureOnly,
  polarLiveEnabled,
  polarProductId,
  polarWebhookSecret,
  publicBaseUrl,
  type PolarEnv,
} from "../config.js";
import { getListingById } from "../core/listing.js";
import { applyPaidBid, BidError, getBidInRollingWeek, quoteBid } from "../core/rank.js";
import { nowUtc } from "../core/week.js";
import type { AppDb } from "../db.js";
import type {
  CheckoutStart,
  CreateCheckoutInput,
  PolarPort,
  PolarWebhookResult,
} from "./polar.js";
import { PolarError } from "./polar_fixture.js";

export type LiveCheckoutStatus = "pending" | "paid";

export type LiveCheckoutRecord = {
  checkoutId: string;
  listingId: string;
  weekId: string;
  chargeUsd: number;
  nextUsd: number;
  url: string;
  status: LiveCheckoutStatus;
};

export type PolarLiveOptions = {
  env?: PolarEnv;
  fetch?: typeof fetch;
  now?: () => Date;
};

/** Live Polar Checkout. Constructor refuses unless `POLAR_LIVE=1` and fixture-only is off. */
export class PolarLive implements PolarPort {
  readonly kind = "live" as const;
  private readonly env: PolarEnv;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => Date;
  private readonly sessions = new Map<string, LiveCheckoutRecord>();

  constructor(
    private readonly db: AppDb,
    options: PolarLiveOptions = {},
  ) {
    this.env = options.env ?? process.env;
    this.fetchFn = options.fetch ?? fetch;
    this.now = options.now ?? nowUtc;
    if (polarFixtureOnly(this.env)) {
      throw new Error("PolarLive is disabled when POLAR_FIXTURE_ONLY=1");
    }
    if (!polarLiveEnabled(this.env)) {
      throw new Error("PolarLive requires POLAR_LIVE=1");
    }
    if (!polarAccessToken(this.env)) {
      throw new Error("BLOCKED-SECRET: POLAR_ACCESS_TOKEN");
    }
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutStart> {
    if (polarFixtureOnly(this.env) || !polarLiveEnabled(this.env)) {
      throw new Error("PolarLive createCheckout is env-gated");
    }
    const token = polarAccessToken(this.env);
    if (!token) {
      throw new Error("BLOCKED-SECRET: POLAR_ACCESS_TOKEN");
    }
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

    let response: Response;
    try {
      response = await this.fetchFn(`${polarApiBase(this.env)}/v1/checkouts/`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(liveCheckoutBody(this.env, quote, input)),
      });
    } catch {
      throw new PolarError("polar_unavailable", "polar checkout failed closed", 503);
    }
    if (!response.ok) {
      throw new PolarError("polar_unavailable", "polar checkout failed closed", 503);
    }
    const payload = (await response.json()) as Record<string, unknown>;
    const checkoutId = readString(payload.id);
    const url = readString(payload.url);
    if (!checkoutId || !url) {
      throw new PolarError("polar_unavailable", "polar checkout failed closed", 503);
    }
    this.sessions.set(checkoutId, {
      checkoutId,
      listingId: input.listingId,
      weekId: current?.weekId ?? input.weekId,
      chargeUsd: quote.chargeUsd,
      nextUsd: quote.nextUsd,
      url,
      status: "pending",
    });
    return { checkoutId, url };
  }

  getCheckout(checkoutId: string): LiveCheckoutRecord | undefined {
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
    headers: Record<string, string>,
    paidAt: string,
  ): Promise<PolarWebhookResult> {
    const secret = polarWebhookSecret(this.env);
    if (!secret) {
      throw new Error("BLOCKED-SECRET: POLAR_WEBHOOK_SECRET");
    }
    if (!verifyPolarSignature(rawBody, headers, secret)) {
      throw new PolarError("invalid_webhook", "invalid Polar webhook signature");
    }
    const event = parseLiveWebhookJson(rawBody);
    const checkoutId = extractLiveCheckoutId(event);
    if (!checkoutId) {
      throw new PolarError("invalid_webhook", "webhook missing checkout id");
    }
    if (!isPaidPolarEvent(event)) {
      throw new PolarError("invalid_webhook", "webhook is not a paid event");
    }
    this.rememberFromMetadata(checkoutId, event);
    await this.applyPaid(checkoutId, paidAtFromEvent(event) ?? paidAt);
    return { checkoutId, paidAt: paidAtFromEvent(event) ?? paidAt };
  }

  private rememberFromMetadata(checkoutId: string, event: unknown): void {
    if (this.sessions.has(checkoutId)) {
      return;
    }
    const data = eventData(event);
    if (!data) {
      return;
    }
    const metadata = isRecord(data.metadata) ? data.metadata : {};
    const listingId = readString(metadata.listingId);
    const weekId = readString(metadata.weekId);
    const nextUsd = readInt(metadata.nextUsd);
    const chargeUsd = readInt(metadata.chargeUsd);
    if (!listingId || !weekId || nextUsd === undefined || chargeUsd === undefined) {
      return;
    }
    this.sessions.set(checkoutId, {
      checkoutId,
      listingId,
      weekId,
      chargeUsd,
      nextUsd,
      url: "",
      status: "pending",
    });
  }
}

export function verifyPolarSignature(
  rawBody: string,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const id = header(headers, "webhook-id");
  const timestamp = header(headers, "webhook-timestamp");
  const signature = header(headers, "webhook-signature");
  if (!id || !timestamp || !signature) {
    return false;
  }
  const expected = createHmac("sha256", secret)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  for (const part of signature.split(" ")) {
    const value = part.startsWith("v1,") ? part.slice(3) : part;
    if (safeEqual(value, expected)) {
      return true;
    }
  }
  return false;
}

function header(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  const needle = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === needle && value.trim() !== "") {
      return value;
    }
  }
  return undefined;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function liveCheckoutBody(
  env: PolarEnv,
  quote: { chargeUsd: number; nextUsd: number },
  input: CreateCheckoutInput,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    amount: quote.chargeUsd * 100,
    currency: "usd",
    success_url: `${publicBaseUrl(env)}/checkout/complete?checkoutId={CHECKOUT_ID}`,
    metadata: {
      listingId: input.listingId,
      weekId: input.weekId,
      chargeUsd: String(quote.chargeUsd),
      nextUsd: String(quote.nextUsd),
    },
  };
  const productId = polarProductId(env);
  if (productId) {
    body.product_id = productId;
    body.products = [productId];
  }
  return body;
}

function parseLiveWebhookJson(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return null;
  }
}

function extractLiveCheckoutId(body: unknown): string | undefined {
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

function isPaidPolarEvent(event: unknown): boolean {
  if (!isRecord(event)) {
    return false;
  }
  if (event.type === "order.paid") {
    return true;
  }
  const data = eventData(event);
  const status = data ? (readString(data.status) ?? "") : "";
  return (
    status === "succeeded" ||
    status === "paid" ||
    status === "confirmed" ||
    status === "complete"
  );
}

function paidAtFromEvent(event: unknown): string | undefined {
  const data = eventData(event);
  if (!data) {
    return undefined;
  }
  return (
    readString(data.modified_at) ??
    readString(data.created_at) ??
    readString(data.paidAt)
  );
}

function eventData(event: unknown): Record<string, unknown> | undefined {
  if (!isRecord(event)) {
    return undefined;
  }
  return isRecord(event.data) ? event.data : event;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function readInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return undefined;
}

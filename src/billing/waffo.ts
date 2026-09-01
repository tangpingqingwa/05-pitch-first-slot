import { createHash, createPublicKey, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import {
  TaxCategory,
  WaffoPancake,
  WaffoPancakeError,
  type WebhookEvent,
  type WebhookEventData,
} from "@waffo/pancake-ts";
import {
  paymentMode,
  isMemoryDatabasePath,
  type PaymentMode,
  type WaffoEnv,
  waffoApiBase,
  waffoEnvironment,
  waffoMerchantId,
  waffoPrivateKey,
  waffoPrivateKeyFile,
  waffoProductId,
  waffoStoreId,
  waffoWebhookPublicKey,
  type WaffoEnvironment,
} from "../config.js";
import { getListingById, type Listing } from "../core/listing.js";
import {
  applyPaidBid,
  BidError,
  getBidInRollingWeek,
  quoteBid,
} from "../core/rank.js";
import { nowUtc } from "../core/week.js";
import type { AppDb } from "../db.js";
import type {
  CheckoutRecord,
  CheckoutStart,
  CreateCheckoutInput,
  PaymentPort,
  WebhookResult,
} from "./port.js";
import { PaymentError } from "./port.js";

type WaffoMode = Exclude<PaymentMode, "fixture">;

export type WaffoLiveOptions = {
  env?: WaffoEnv;
  mode?: WaffoMode;
  fetch?: typeof fetch;
  now?: () => Date;
  /** Bounds the complete provider response, including consumption of its body. */
  timeoutMs?: number;
  /** Required for waffo-prod; test mode may use an isolated in-memory DB. */
  databasePath?: string;
};

type IntentStatus =
  | "creating"
  | "open"
  | "unknown"
  | "paid"
  | "rejected"
  | "needs_reconciliation";

type WaffoIntentRow = {
  intent_id: string;
  intent_fingerprint: string;
  normalized_payload: string;
  listing_id: string;
  week_id: string;
  canonical_url: string;
  company: string;
  one_liner: string;
  base_bid_cents: number;
  base_week_id: string | null;
  base_paid_at: string | null;
  target_bid_cents: number;
  charge_cents: number;
  store_id: string;
  product_id: string;
  mode: WaffoMode;
  currency: "USD";
  tax_category: "digital_goods";
  status: IntentStatus;
  provider_checkout_id: string | null;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  provider_delivery_id: string | null;
  checkout_url: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
  failure_reason: string | null;
};

type WaffoEventRow = {
  delivery_id: string;
  event_type: string;
  event_id: string;
  raw_hash: string;
  normalized_hash: string;
  payment_id: string | null;
  order_id: string | null;
  intent_id: string | null;
  outcome:
    | "processing"
    | "accepted"
    | "duplicate"
    | "rejected"
    | "needs_reconciliation";
  reason: string | null;
  event_timestamp: string | null;
  received_at: string;
  payload: string;
};

type WaffoEventIdentity = {
  deliveryId: string;
  eventType: string;
  eventId: string;
  paymentId: string | null;
  orderId: string | null;
  intentId: string | null;
  eventTimestamp: string | null;
};

type SettlementDecision =
  | { kind: "result"; result: WebhookResult }
  | {
      kind: "error";
      code: string;
      message: string;
      statusCode: number;
    };

type WaffoOrderEvent = WebhookEvent<WebhookEventData>;

const intentSelect = `
  SELECT intent_id, intent_fingerprint, normalized_payload, listing_id,
         week_id, canonical_url, company, one_liner, base_bid_cents,
         base_week_id, base_paid_at, target_bid_cents, charge_cents,
         store_id, product_id, mode, currency, tax_category, status,
         provider_checkout_id, provider_order_id, provider_payment_id,
         provider_delivery_id, checkout_url, expires_at, created_at,
         updated_at, paid_at, failure_reason
  FROM waffo_checkout_intents`;

const eventSelect = `
  SELECT delivery_id, event_type, event_id, raw_hash, normalized_hash,
         payment_id, order_id, intent_id, outcome, reason, event_timestamp,
         received_at, payload
  FROM waffo_checkout_events`;

/** Waffo API-key checkout and webhook adapter. */
export class WaffoLive implements PaymentPort {
  readonly kind = "live" as const;
  private readonly env: WaffoEnv;
  private readonly mode: WaffoMode;
  private readonly environment: WaffoEnvironment;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => Date;
  private readonly timeoutMs: number;
  private readonly storeId: string;
  private readonly productId: string;
  private readonly publicUrl: string;
  private readonly client: WaffoPancake;
  private readonly webhookPublicKey: string;

  constructor(
    private readonly db: AppDb,
    options: WaffoLiveOptions = {},
  ) {
    this.env = options.env ?? process.env;
    const configuredMode = paymentMode(this.env);
    const selected = options.mode ?? configuredMode;
    if (selected !== configuredMode) {
      throw new Error("BLOCKED-CONFIG: Waffo mode override disagrees with WAFFO_MODE");
    }
    if (selected === "fixture") {
      throw new Error("WaffoLive requires WAFFO_MODE=waffo-test or waffo-prod");
    }
    this.mode = selected;
    const environment = waffoEnvironment(selected);
    if (!environment) {
      throw new Error("BLOCKED-CONFIG: invalid Waffo environment");
    }
    this.environment = environment;
    this.now = options.now ?? nowUtc;
    this.timeoutMs = providerTimeout(options.timeoutMs);
    this.fetchFn = withResponseDeadline(options.fetch ?? fetch, this.timeoutMs);

    const merchantId = waffoMerchantId(this.env);
    this.storeId = requiredShortId(
      waffoStoreId(this.env),
      "WAFFO_STORE_ID",
      "STO",
    );
    this.productId = requiredShortId(
      waffoProductId(this.env),
      "WAFFO_PRODUCT_ID",
      "PROD",
    );
    const validMerchantId = requiredShortId(merchantId, "WAFFO_MERCHANT_ID", "MER");
    const privateKey = readPrivateKey(this.env);
    this.webhookPublicKey = normalizeRsaPublicKey(
      waffoWebhookPublicKey(this.env, environment),
      `WAFFO_WEBHOOK_${environment.toUpperCase()}_PUBLIC_KEY`,
    );
    const baseUrl = validateApiBase(waffoApiBase(this.env), this.mode);
    const configuredPublicUrl = this.env.PUBLIC_BASE_URL?.trim();
    if (!configuredPublicUrl) {
      throw new Error("BLOCKED-CONFIG: Waffo live mode requires PUBLIC_BASE_URL");
    }
    const publicUrl = parseSafeHttpsUrl(configuredPublicUrl, { originOnly: true });
    if (!publicUrl) {
      throw new Error("BLOCKED-CONFIG: PUBLIC_BASE_URL must be a public HTTPS URL");
    }
    if (this.mode === "waffo-prod" && !isApprovedProductionPublicHost(publicUrl.hostname)) {
      throw new Error("BLOCKED-CONFIG: waffo-prod PUBLIC_BASE_URL host is not approved");
    }
    if (this.mode === "waffo-prod") {
      const durablePath = this.env.DATABASE_PATH?.trim();
      if (!durablePath || isMemoryDatabasePath(durablePath)) {
        throw new Error("BLOCKED-CONFIG: waffo-prod requires an explicit durable DATABASE_PATH");
      }
    }
    this.publicUrl = publicUrl.toString().replace(/\/$/, "");

    try {
      this.client = new WaffoPancake({
        merchantId: validMerchantId,
        privateKey,
        baseUrl,
        fetch: this.fetchFn,
        environment,
        webhookPublicKey: this.webhookPublicKey,
      });
    } catch (error) {
      if (error instanceof WaffoPancakeError) {
        throw new Error("BLOCKED-CONFIG: Waffo credentials were rejected");
      }
      throw new Error("BLOCKED-SECRET: WAFFO_PRIVATE_KEY");
    }

    // A process can exit after the local intent transaction and before the
    // provider response is observed. Treat every creating row present when
    // this instance starts as ambiguous, while retaining the immutable
    // intent and its listing reservation for signed reconciliation.
    recoverOrphanedCreatingIntents(this.db, this.now);
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutStart> {
    const listing = getListingById(this.db, input.listingId);
    if (!listing) {
      throw new BidError("listing_not_found", "listing not found", 404);
    }
    const reservation = this.reserveIntent(input, listing);
    let session: { sessionId?: unknown; checkoutUrl?: unknown; expiresAt?: unknown };
    try {
      session = await this.client.checkout.anonymous.create(
        checkoutParams(this.publicUrl, this.mode, this.productId, reservation),
      );
    } catch (error) {
      const status = error instanceof WaffoPancakeError ? error.status : undefined;
      const definitive = isDefinitiveCheckoutError(error);
      this.markCreateState(
        reservation.intentId,
        definitive ? "rejected" : "unknown",
        definitive
          ? `Waffo rejected checkout (HTTP ${status ?? "unknown"})`
          : "Waffo checkout outcome unknown",
      );
      if (definitive) {
        throw new PaymentError("waffo_rejected", "Waffo checkout was rejected", 400);
      }
      throw new PaymentError("waffo_unavailable", "Waffo checkout outcome is unknown", 503);
    }

    const sessionRecord = asRecord(session);
    const sessionId = exactString(sessionRecord?.sessionId);
    const checkoutUrl = exactString(sessionRecord?.checkoutUrl);
    const expiresAt = exactString(sessionRecord?.expiresAt);
    const usableExpiry = expiresAt ? futureExpiry(expiresAt, this.now()) : undefined;
    if (
      !sessionId ||
      !checkoutUrl ||
      !isSafeHttpsUrl(checkoutUrl, sessionId) ||
      !usableExpiry
    ) {
      this.markCreateState(
        reservation.intentId,
        "unknown",
        "Waffo returned an invalid checkout session",
      );
      throw new PaymentError("waffo_unavailable", "Waffo checkout response was invalid", 503);
    }

    try {
      this.db
        .transaction(() => {
          const saved = this.db
            .prepare(
              `UPDATE waffo_checkout_intents
               SET provider_checkout_id = @sessionId,
                   checkout_url = @checkoutUrl,
                   expires_at = @expiresAt,
                   status = 'open',
                   updated_at = @updatedAt
               WHERE intent_id = @intentId AND status = 'creating'`,
            )
            .run({
              sessionId,
              checkoutUrl,
              expiresAt: usableExpiry,
              updatedAt: this.now().toISOString(),
              intentId: reservation.intentId,
            });
          if (saved.changes !== 1) {
            throw new Error("local Waffo intent is no longer creating");
          }
        })
        .immediate();
    } catch {
      this.markCreateState(
        reservation.intentId,
        "unknown",
        "Waffo checkout was created but could not be recorded",
      );
      throw new PaymentError("waffo_unavailable", "Waffo checkout could not be recorded", 503);
    }
    return { checkoutId: sessionId, url: checkoutUrl };
  }

  getCheckout(token: string): CheckoutRecord | undefined {
    const row = this.db
      .prepare<[string, string], WaffoIntentRow>(
        `${intentSelect} WHERE provider_checkout_id = ? OR intent_id = ? LIMIT 1`,
      )
      .get(token, token);
    return row ? mapCheckout(row) : undefined;
  }

  async applyPaid(_checkoutId: string, _paidAt: string): Promise<void> {
    throw new PaymentError(
      "invalid_webhook",
      "live settlement requires a verified Waffo order.completed webhook",
    );
  }

  async handleWebhook(
    rawBody: string,
    headers: Record<string, string>,
    receivedAt: string,
  ): Promise<WebhookResult> {
    const signature = header(headers, "x-waffo-signature");
    let event: WaffoOrderEvent;
    try {
      const verified = this.client.webhooks.verify<WebhookEventData>(rawBody, signature, {
        environment: this.environment,
        publicKey: this.webhookPublicKey,
      });
      if (!asRecord(verified)) {
        throw new Error("Waffo webhook must be an object");
      }
      event = verified;
    } catch {
      throw new PaymentError("invalid_webhook", "invalid Waffo webhook signature or payload", 400);
    }

    const rawHash = sha256(rawBody);
    const observedIdentity = eventIdentity(event);
    // Keep malformed-but-authenticated deliveries in the durable ledger. A
    // later corrected payload must encounter the original provider identity
    // reservation instead of being reinterpreted as a fresh payment.
    const identity = durableEventIdentity(observedIdentity, rawHash);
    const normalizedHash = sha256(stableStringifyEvent(event));
    const validationReason =
      !observedIdentity.deliveryId || !observedIdentity.eventId
        ? "Waffo webhook is missing delivery or event identity"
        : validateEventShape(event, this.environment, this.now());
    const decision = this.db
      .transaction(() =>
        this.settleInTransaction(
          event,
          identity,
          rawBody,
          rawHash,
          normalizedHash,
          receivedAt,
          validationReason,
        ),
      )
      .immediate();
    if (decision.kind === "error") {
      throw new PaymentError(decision.code, decision.message, decision.statusCode);
    }
    return decision.result;
  }

  private reserveIntent(
    input: CreateCheckoutInput,
    listing: Listing,
  ): {
    intentId: string;
    listingId: string;
    canonicalUrl: string;
    company: string;
    oneLiner: string;
    weekId: string;
    targetBidCents: number;
    chargeCents: number;
    baseBidCents: number;
    baseWeekId: string | null;
    basePaidAt: string | null;
    intentFingerprint: string;
    storeId: string;
  } {
    const now = this.now();
    const current = getBidInRollingWeek(this.db, listing.id, now);
    const quote = quoteBid(current, input.nextUsd);
    if (quote.chargeUsd !== input.chargeUsd) {
      throw new PaymentError("charge_mismatch", `chargeUsd must be ${quote.chargeUsd}`);
    }
    const targetBidCents = dollarsToCents(quote.nextUsd, "nextUsd");
    const chargeCents = dollarsToCents(quote.chargeUsd, "chargeUsd");
    const baseBidCents = current ? dollarsToCents(current.amountUsd, "base bid") : 0;
    const baseWeekId = current?.weekId ?? null;
    const basePaidAt = current?.paidAt ?? null;
    const weekId = current?.weekId ?? input.weekId;
    const normalized = {
      listingId: listing.id,
      weekId,
      canonicalUrl: listing.url,
      company: listing.company,
      oneLiner: listing.oneLiner,
      baseBidCents,
      baseWeekId: baseWeekId ?? "",
      basePaidAt: basePaidAt ?? "",
      targetBidCents,
      chargeCents,
      storeId: this.storeId,
      productId: this.productId,
      mode: this.mode,
      currency: "USD",
      taxCategory: "digital_goods",
    } as const;
    const normalizedPayload = stableStringify(normalized);
    const intentFingerprint = sha256(normalizedPayload);
    const intentId = randomUUID();
    const createdAt = now.toISOString();

    try {
      this.db
        .transaction(() => {
          this.db
            .prepare(
              `INSERT INTO waffo_checkout_intents (
                 intent_id, intent_fingerprint, normalized_payload,
                 listing_id, week_id, canonical_url, company, one_liner,
                 base_bid_cents, base_week_id, base_paid_at, target_bid_cents,
                 charge_cents, store_id, product_id, mode, currency,
                 tax_category, status, provider_checkout_id,
                 provider_order_id, provider_payment_id, provider_delivery_id,
                 checkout_url, expires_at, created_at, updated_at, paid_at,
                 failure_reason
               ) VALUES (
                 @intentId, @intentFingerprint, @normalizedPayload,
                 @listingId, @weekId, @canonicalUrl, @company, @oneLiner,
                 @baseBidCents, @baseWeekId, @basePaidAt, @targetBidCents,
                 @chargeCents, @storeId, @productId, @mode, 'USD',
                 'digital_goods', 'creating', NULL, NULL, NULL, NULL,
                 NULL, NULL, @createdAt, @createdAt, NULL, NULL
               )`,
            )
            .run({
              intentId,
              intentFingerprint,
              normalizedPayload,
              listingId: listing.id,
              weekId,
              canonicalUrl: listing.url,
              company: listing.company,
              oneLiner: listing.oneLiner,
              baseBidCents,
              baseWeekId,
              basePaidAt,
              targetBidCents,
              chargeCents,
              storeId: this.storeId,
              productId: this.productId,
              mode: this.mode,
              createdAt,
            });
        })
        .immediate();
    } catch (error) {
      if (isUniqueConstraint(error)) {
        throw new PaymentError(
          "checkout_in_progress",
          "a checkout for this listing is already awaiting payment",
          409,
        );
      }
      throw error;
    }
    return {
      intentId,
      listingId: listing.id,
      canonicalUrl: listing.url,
      company: listing.company,
      oneLiner: listing.oneLiner,
      weekId,
      targetBidCents,
      chargeCents,
      baseBidCents,
      baseWeekId,
      basePaidAt,
      intentFingerprint,
      storeId: this.storeId,
    };
  }

  private markCreateState(
    intentId: string,
    status: "unknown" | "rejected",
    reason: string,
  ): void {
    try {
      this.db
        .prepare(
          `UPDATE waffo_checkout_intents
           SET status = @status, failure_reason = @reason,
               updated_at = @updatedAt
           WHERE intent_id = @intentId AND status = 'creating'`,
        )
        .run({ status, reason, updatedAt: this.now().toISOString(), intentId });
    } catch {
      // The creating row remains durable evidence if this diagnostic update
      // itself cannot be written.  Never release an ambiguous reservation.
    }
  }

  private settleInTransaction(
    event: WaffoOrderEvent,
    identity: WaffoEventIdentity,
    rawBody: string,
    rawHash: string,
    normalizedHash: string,
    receivedAt: string,
    validationReason: string | undefined,
  ): SettlementDecision {
    const existingDelivery = eventByDelivery(this.db, identity.deliveryId);
    if (existingDelivery) {
      if (existingDelivery.normalized_hash === normalizedHash) {
        recordAttempt(this.db, identity, rawHash, normalizedHash, "duplicate", "exact replay", receivedAt);
        return existingDecision(existingDelivery, this.db);
      }
      recordAttempt(this.db, identity, rawHash, normalizedHash, "rejected", "altered delivery replay", receivedAt);
      return failure("replay_rejected", "delivery ID was reused with a changed payload");
    }

    const existingIdentity = eventByAnyIdentity(this.db, identity);
    if (existingIdentity) {
      if (existingIdentity.normalized_hash === normalizedHash) {
        recordAttempt(this.db, identity, rawHash, normalizedHash, "duplicate", "exact identity replay", receivedAt);
        return existingDecision(existingIdentity, this.db);
      }
      recordAttempt(this.db, identity, rawHash, normalizedHash, "rejected", "altered provider identity replay", receivedAt);
      return failure("replay_rejected", "provider identity was reused with a changed payload");
    }

    const intent = identity.intentId ? intentById(this.db, identity.intentId) : undefined;
    let reason = validationReason;
    if (!reason && !intent) {
      reason = "unknown local intent";
    }
    if (!reason && intent) {
      reason = intentMismatch(event, identity, intent, this.environment);
    }

    if (reason) {
      const reconcileCaptured =
        intent !== undefined &&
        (isCapturedMoneyInconsistency(reason) || isCapturedTemporalInconsistency(reason));
      const outcome: WaffoEventRow["outcome"] = reconcileCaptured
        ? "needs_reconciliation"
        : "rejected";
      insertEvent(
        this.db,
        { ...identity, intentId: intent?.intent_id ?? null },
        rawHash,
        normalizedHash,
        outcome,
        reason,
        identity.eventTimestamp,
        receivedAt,
        rawBody,
      );
      if (reconcileCaptured && intent) {
        updateIntentProviderState(
          this.db,
          identity,
          intent.intent_id,
          "needs_reconciliation",
          reason,
          receivedAt,
        );
        recordAttempt(
          this.db,
          identity,
          rawHash,
          normalizedHash,
          "needs_reconciliation",
          reason,
          receivedAt,
        );
        return resultFor(intent, identity.eventTimestamp, "needs_reconciliation");
      }
      recordAttempt(this.db, identity, rawHash, normalizedHash, outcome, reason, receivedAt);
      return failure(
        reason === "unknown local intent" ? "unknown_checkout" : "checkout_mismatch",
        reason,
        reason === "unknown local intent" ? 404 : 400,
      );
    }

    if (!intent) {
      throw new Error("settlement invariant: validated event has no intent");
    }
    const current = getBidInRollingWeek(this.db, intent.listing_id, this.now());
    if (!baseMatches(intent, current)) {
      const staleReason = "captured payment is based on stale listing state";
      insertEvent(
        this.db,
        identity,
        rawHash,
        normalizedHash,
        "needs_reconciliation",
        staleReason,
        identity.eventTimestamp,
        receivedAt,
        rawBody,
      );
      updateIntentProviderState(this.db, identity, intent.intent_id, "needs_reconciliation", staleReason, receivedAt);
      recordAttempt(this.db, identity, rawHash, normalizedHash, "needs_reconciliation", staleReason, receivedAt);
      return resultFor(intent, identity.eventTimestamp, "needs_reconciliation");
    }

    insertEvent(
      this.db,
      identity,
      rawHash,
      normalizedHash,
      "processing",
      null,
      identity.eventTimestamp,
      receivedAt,
      rawBody,
    );
    try {
      applyPaidBid(
        this.db,
        intent.listing_id,
        intent.week_id,
        intent.target_bid_cents / 100,
        identity.eventTimestamp!,
        this.now(),
      );
    } catch (error) {
      const reconcileReason = `captured payment could not update rank: ${error instanceof Error ? error.message : "unknown database error"}`;
      this.db
        .prepare(
          `UPDATE waffo_checkout_events
           SET outcome = 'needs_reconciliation', reason = @reason
           WHERE delivery_id = @deliveryId AND outcome = 'processing'`,
        )
        .run({ reason: reconcileReason, deliveryId: identity.deliveryId });
      updateIntentProviderState(this.db, identity, intent.intent_id, "needs_reconciliation", reconcileReason, receivedAt);
      recordAttempt(this.db, identity, rawHash, normalizedHash, "needs_reconciliation", reconcileReason, receivedAt);
      return resultFor(intent, identity.eventTimestamp, "needs_reconciliation");
    }

    updateIntentProviderState(this.db, identity, intent.intent_id, "paid", null, receivedAt, identity.eventTimestamp!);
    const eventSaved = this.db
      .prepare(
        `UPDATE waffo_checkout_events
         SET outcome = 'accepted', reason = NULL
         WHERE delivery_id = @deliveryId AND outcome = 'processing'`,
      )
      .run({ deliveryId: identity.deliveryId });
    if (eventSaved.changes !== 1) {
      throw new Error("Waffo event ledger row was not finalized");
    }
    recordAttempt(this.db, identity, rawHash, normalizedHash, "accepted", null, receivedAt);
    return resultFor(intent, identity.eventTimestamp, "paid");
  }
}

function requiredShortId(value: string | undefined, key: string, prefix: string): string {
  if (!value || !new RegExp(`^${prefix}_[0-9A-Za-z]{22}$`).test(value)) {
    throw new Error(`BLOCKED-CONFIG: ${key}`);
  }
  return value;
}

function readPrivateKey(env: WaffoEnv): string {
  const direct = waffoPrivateKey(env);
  if (direct) {
    return normalizePem(direct, "WAFFO_PRIVATE_KEY");
  }
  const file = waffoPrivateKeyFile(env);
  if (!file) {
    throw new Error("BLOCKED-SECRET: WAFFO_PRIVATE_KEY");
  }
  try {
    return normalizePem(readFileSync(file, "utf8"), "WAFFO_PRIVATE_KEY_FILE");
  } catch {
    throw new Error("BLOCKED-SECRET: WAFFO_PRIVATE_KEY_FILE");
  }
}

function normalizePem(value: string | undefined, key: string): string {
  if (!value || value.trim() === "") {
    throw new Error(`BLOCKED-SECRET: ${key}`);
  }
  return value.replaceAll("\\n", "\n").trim();
}

function normalizeRsaPublicKey(value: string | undefined, key: string): string {
  const pem = normalizePem(value, key);
  try {
    const keyObject = createPublicKey(pem);
    if (keyObject.asymmetricKeyType !== "rsa") {
      throw new Error("Waffo webhook key must be RSA");
    }
  } catch {
    throw new Error(`BLOCKED-SECRET: ${key}`);
  }
  return pem;
}

function providerTimeout(timeoutMs: number | undefined): number {
  const value = timeoutMs ?? 15_000;
  if (!Number.isInteger(value) || value < 1 || value > 120_000) {
    throw new Error("BLOCKED-CONFIG: Waffo provider timeout must be 1-120000ms");
  }
  return value;
}

function isDefinitiveCheckoutError(error: unknown): boolean {
  if (!(error instanceof WaffoPancakeError)) return false;
  // These statuses can represent an accepted request whose response was
  // delayed or lost. A non-JSON response is likewise ambiguous regardless of
  // its HTTP status because the provider's outcome was not decoded.
  if ([408, 409, 425, 429].includes(error.status)) return false;
  if (error.errors.some((item) => /non-json/i.test(item.message))) return false;
  return error.status >= 400 && error.status < 500;
}

/**
 * The SDK's fetch hook is wrapped so the deadline covers both headers and the
 * response body. The reconstructed response preserves the body for the SDK's
 * JSON parser after the bounded read has completed.
 */
function withResponseDeadline(baseFetch: typeof fetch, timeoutMs: number): typeof fetch {
  return (async (input, init) => {
    const controller = new AbortController();
    const callerSignal = init?.signal;
    const abortFromCaller = () => controller.abort();
    if (callerSignal) {
      if (callerSignal.aborted) {
        controller.abort();
      } else {
        callerSignal.addEventListener("abort", abortFromCaller, { once: true });
      }
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("Waffo provider response timed out"));
      }, timeoutMs);
    });
    try {
      const request = (async () => {
        const response = await baseFetch(input, { ...init, signal: controller.signal });
        const body = await response.arrayBuffer();
        return new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      })();
      return await Promise.race([request, deadline]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      callerSignal?.removeEventListener("abort", abortFromCaller);
    }
  }) as typeof fetch;
}

function checkoutParams(
  publicUrl: string,
  mode: WaffoMode,
  productId: string,
  reservation: {
    intentId: string;
    listingId: string;
    canonicalUrl: string;
    company: string;
    oneLiner: string;
    weekId: string;
    targetBidCents: number;
    chargeCents: number;
    baseBidCents: number;
    baseWeekId: string | null;
    basePaidAt: string | null;
    intentFingerprint: string;
    storeId: string;
  },
): {
  productId: string;
  currency: "USD";
  priceSnapshot: { amount: string; taxCategory: TaxCategory };
  successUrl: string;
  orderMerchantExternalId: string;
  metadata: Record<string, string>;
} {
  const metadata: Record<string, string> = {
    intentId: reservation.intentId,
    intentFingerprint: reservation.intentFingerprint,
    targetBidCents: String(reservation.targetBidCents),
    chargeCents: String(reservation.chargeCents),
    baseBidCents: String(reservation.baseBidCents),
    baseWeekId: reservation.baseWeekId ?? "",
    basePaidAt: reservation.basePaidAt ?? "",
    listingId: reservation.listingId,
    canonicalUrl: reservation.canonicalUrl,
    company: reservation.company,
    oneLiner: reservation.oneLiner,
    weekId: reservation.weekId,
    storeId: reservation.storeId,
    productId,
    mode,
    currency: "USD",
    taxCategory: "digital_goods",
  };
  return {
    productId,
    currency: "USD",
    priceSnapshot: {
      amount: centsToDisplayString(reservation.chargeCents),
      taxCategory: TaxCategory.DigitalGoods,
    },
    successUrl: `${publicUrl}/checkout/complete?intent=${encodeURIComponent(reservation.intentId)}`,
    orderMerchantExternalId: reservation.intentId,
    metadata,
  };
}

function eventIdentity(event: WaffoOrderEvent): WaffoEventIdentity {
  const data = asRecord(event.data);
  const rawTimestamp = readString(event.timestamp);
  return {
    deliveryId: readString(event.id) ?? "",
    eventType: readString(event.eventType) ?? "",
    eventId: readString(event.eventId) ?? "",
    paymentId: readString(data?.paymentId) ?? null,
    orderId: readString(data?.orderId) ?? null,
    intentId: readString(data?.orderMerchantExternalId) ?? null,
    // Store one canonical UTC representation so the existing rank SQL range
    // query remains correct for provider timestamps carrying an offset.
    eventTimestamp: canonicalTimestamp(rawTimestamp),
  };
}

function durableEventIdentity(
  identity: WaffoEventIdentity,
  rawHash: string,
): WaffoEventIdentity {
  return {
    ...identity,
    deliveryId: identity.deliveryId || `invalid-delivery-${rawHash}`,
    eventId: identity.eventId || `invalid-event-${rawHash}`,
  };
}

function validateEventShape(
  event: WaffoOrderEvent,
  environment: WaffoEnvironment,
  now: Date,
): string | undefined {
  const data = asRecord(event.data);
  if (event.eventType !== "order.completed") return "unsupported Waffo event type";
  if (readString(event.mode) !== environment) return "Waffo event mode does not match the configured environment";
  if (!readString(event.storeId)) return "Waffo event is missing store identity";
  if (!data) return "Waffo event data is invalid";
  if (data.orderStatus !== "completed") return "Waffo order status is not completed";
  if (data.paymentStatus !== "succeeded") return "Waffo payment status is not succeeded";
  if (data.currency !== "USD") return "Waffo currency is not USD";
  if (!readString(data.productId)) return "Waffo event is missing product identity";
  if (!readString(data.buyerEmail)) return "Waffo event is missing buyer identity";
  if (!readString(data.productName)) return "Waffo event is missing product identity";
  if (!readString(data.paymentId)) return "Waffo event is missing payment identity";
  if (!readString(data.orderId)) return "Waffo event is missing order identity";
  if (!readString(data.orderMerchantExternalId)) return "Waffo event is missing local intent identity";
  if (event.eventId !== data.paymentId) return "Waffo event and payment identities do not match";
  const timestampReason = eventTimestampReason(event.timestamp, now);
  if (timestampReason) return timestampReason;
  const moneyReason = validateMoneyRelationships(data);
  if (moneyReason) return moneyReason;
  return undefined;
}

function intentMismatch(
  event: WaffoOrderEvent,
  identity: WaffoEventIdentity,
  intent: WaffoIntentRow,
  environment: WaffoEnvironment,
): string | undefined {
  if (!(["creating", "open", "unknown"] as IntentStatus[]).includes(intent.status)) {
    return "local intent is not awaiting settlement";
  }
  if (intent.mode !== (environment === "test" ? "waffo-test" : "waffo-prod")) return "local intent mode mismatch";
  if (event.storeId !== intent.store_id) return "Waffo store does not match the local intent";
  if (identity.intentId !== intent.intent_id) return "Waffo external intent ID does not match";
  if (intent.provider_order_id && intent.provider_order_id !== identity.orderId) {
    return "Waffo order identity does not match the local intent";
  }
  if (intent.provider_payment_id && intent.provider_payment_id !== identity.paymentId) {
    return "Waffo payment identity does not match the local intent";
  }
  if (intent.provider_delivery_id && intent.provider_delivery_id !== identity.deliveryId) {
    return "Waffo delivery identity does not match the local intent";
  }
  const data = asRecord(event.data);
  const providerProductId = readString(data?.productId);
  if (!providerProductId) return "Waffo product identity is missing";
  if (providerProductId !== intent.product_id) {
    return "Waffo product does not match the local intent";
  }
  const providerCheckoutId = readString(data?.checkoutId);
  if (
    providerCheckoutId &&
    intent.provider_checkout_id &&
    providerCheckoutId !== intent.provider_checkout_id
  ) {
    return "Waffo checkout identity does not match the local intent";
  }
  const timestampReason = eventTimestampBeforeIntent(identity.eventTimestamp, intent.created_at);
  if (timestampReason) return timestampReason;
  const metadata = asStringRecord(data?.orderMetadata);
  if (!metadata) return "Waffo order metadata is missing";
  const expected = expectedMetadata(intent);
  const actualKeys = Object.keys(metadata).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    return "Waffo order metadata shape does not match the local intent";
  }
  if (metadata.intentId !== intent.intent_id) return "Waffo metadata intent ID does not match";
  if (metadata.intentFingerprint !== intent.intent_fingerprint) return "Waffo metadata fingerprint does not match";
  for (const [key, value] of Object.entries(expected)) {
    if (metadata[key] !== value) return `Waffo metadata field ${key} does not match`;
  }
  const moneyReason = validateMoneyAgainstIntent(data, intent.charge_cents);
  if (moneyReason) return moneyReason;
  return undefined;
}

type ParsedMoneyFields = {
  amount: number;
  taxAmount: number;
  subtotal?: number;
  total?: number;
};

function parseMoneyFields(data: Record<string, unknown>): ParsedMoneyFields | string {
  const amount = decimalToCents(data.amount);
  const taxAmount = decimalToCents(data.taxAmount);
  if (amount === undefined || taxAmount === undefined) {
    return "Waffo amount and taxAmount must be exact USD decimals";
  }
  const subtotal = presentMoneyField(data, "subtotal");
  if (typeof subtotal === "string") return subtotal;
  const total = presentMoneyField(data, "total");
  if (typeof total === "string") return total;
  return { amount, taxAmount, ...(subtotal === undefined ? {} : { subtotal }), ...(total === undefined ? {} : { total }) };
}

function presentMoneyField(
  data: Record<string, unknown>,
  field: "subtotal" | "total",
): number | string | undefined {
  if (!Object.prototype.hasOwnProperty.call(data, field)) return undefined;
  const parsed = decimalToCents(data[field]);
  return parsed === undefined ? `Waffo ${field} is not an exact USD decimal` : parsed;
}

function validateMoneyRelationships(data: Record<string, unknown>): string | undefined {
  const parsed = parseMoneyFields(data);
  if (typeof parsed === "string") return parsed;
  const expectedTotal = parsed.subtotal === undefined
    ? addCents(parsed.amount, parsed.taxAmount)
    : addCents(parsed.subtotal, parsed.taxAmount);
  if (expectedTotal === undefined) return "Waffo money fields exceed the safe USD range";
  if (
    parsed.subtotal !== undefined &&
    parsed.amount !== parsed.subtotal &&
    parsed.amount !== expectedTotal
  ) {
    return "Waffo amount does not equal subtotal or subtotal plus tax";
  }
  if (parsed.total !== undefined && parsed.total !== expectedTotal) {
    return "Waffo total does not equal subtotal plus tax";
  }
  return undefined;
}

function validateMoneyAgainstIntent(
  data: Record<string, unknown> | undefined,
  expectedCharge: number,
): string | undefined {
  if (!data) return "Waffo event data is invalid";
  const parsed = parseMoneyFields(data);
  if (typeof parsed === "string") return parsed;
  if (parsed.subtotal !== undefined) {
    if (parsed.subtotal !== expectedCharge) return "Waffo subtotal does not match the local charge";
    const expectedTotal = addCents(parsed.subtotal, parsed.taxAmount);
    if (
      expectedTotal === undefined ||
      (parsed.amount !== parsed.subtotal && parsed.amount !== expectedTotal)
    ) {
      return "Waffo amount does not match the local subtotal or subtotal plus tax";
    }
    if (parsed.total !== undefined && parsed.total !== expectedTotal) {
      return "Waffo total does not match the local subtotal and tax";
    }
    return undefined;
  }
  if (parsed.taxAmount !== 0 || parsed.amount !== expectedCharge) {
    return "Waffo amount or tax does not match the local charge";
  }
  if (parsed.total !== undefined && parsed.total !== parsed.amount) {
    return "Waffo total does not match the local amount";
  }
  return undefined;
}

function isCapturedMoneyInconsistency(reason: string): boolean {
  return (
    reason.startsWith("Waffo amount") ||
    reason.startsWith("Waffo subtotal") ||
    reason.startsWith("Waffo total") ||
    reason.startsWith("Waffo money")
  );
}

function isCapturedTemporalInconsistency(reason: string): boolean {
  return reason === "Waffo event timestamp predates the local checkout intent";
}

const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const EVENT_CLOCK_SKEW_MS = 5 * 60 * 1000;
const EVENT_MAX_AGE_MS = 8 * 24 * 60 * 60 * 1000;

function eventTimestampReason(value: unknown, now: Date): string | undefined {
  if (typeof value !== "string" || value.trim() !== value || !ISO_TIMESTAMP.test(value)) {
    return "Waffo event timestamp is invalid";
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "Waffo event timestamp is invalid";
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return "Waffo event timestamp is invalid";
  if (parsed > nowMs + EVENT_CLOCK_SKEW_MS) return "Waffo event timestamp is in the future";
  if (parsed < nowMs - EVENT_MAX_AGE_MS) return "Waffo event timestamp is too old";
  return undefined;
}

function eventTimestampBeforeIntent(
  eventTimestamp: string | null,
  intentCreatedAt: string,
): string | undefined {
  if (!eventTimestamp) return "Waffo event timestamp is missing";
  const eventMs = Date.parse(eventTimestamp);
  const intentMs = Date.parse(intentCreatedAt);
  if (!Number.isFinite(eventMs) || !Number.isFinite(intentMs)) {
    return "Waffo event timestamp cannot be compared with the local checkout intent";
  }
  return eventMs < intentMs
    ? "Waffo event timestamp predates the local checkout intent"
    : undefined;
}

function futureExpiry(value: string, now: Date): string | undefined {
  if (!ISO_TIMESTAMP.test(value) || value.trim() !== value) return undefined;
  const parsed = Date.parse(value);
  const nowMs = now.getTime();
  if (!Number.isFinite(parsed) || !Number.isFinite(nowMs) || parsed <= nowMs) {
    return undefined;
  }
  return new Date(parsed).toISOString();
}

function addCents(left: number, right: number): number | undefined {
  const result = left + right;
  return Number.isSafeInteger(result) ? result : undefined;
}

function expectedMetadata(intent: WaffoIntentRow): Record<string, string> {
  return {
    intentId: intent.intent_id,
    intentFingerprint: intent.intent_fingerprint,
    targetBidCents: String(intent.target_bid_cents),
    chargeCents: String(intent.charge_cents),
    baseBidCents: String(intent.base_bid_cents),
    baseWeekId: intent.base_week_id ?? "",
    basePaidAt: intent.base_paid_at ?? "",
    listingId: intent.listing_id,
    weekId: intent.week_id,
    canonicalUrl: intent.canonical_url,
    company: intent.company,
    oneLiner: intent.one_liner,
    storeId: intent.store_id,
    productId: intent.product_id,
    mode: intent.mode,
    currency: intent.currency,
    taxCategory: intent.tax_category,
  };
}

function baseMatches(intent: WaffoIntentRow, current: ReturnType<typeof getBidInRollingWeek>): boolean {
  if (intent.base_bid_cents === 0) {
    return current === undefined;
  }
  return (
    current !== undefined &&
    current.amountUsd * 100 === intent.base_bid_cents &&
    current.weekId === intent.base_week_id &&
    current.paidAt === intent.base_paid_at
  );
}

function resultFor(
  intent: WaffoIntentRow,
  paidAt: string | null,
  status: "paid" | "duplicate" | "needs_reconciliation",
): { kind: "result"; result: WebhookResult } {
  return {
    kind: "result",
    result: {
      checkoutId: intent.provider_checkout_id ?? intent.intent_id,
      paidAt: paidAt ?? intent.paid_at ?? intent.created_at,
      status,
    },
  };
}

function existingDecision(row: WaffoEventRow, db: AppDb): SettlementDecision {
  const intent = row.intent_id ? intentById(db, row.intent_id) : undefined;
  if (row.outcome === "needs_reconciliation") {
    return intent
      ? resultFor(intent, row.event_timestamp, "needs_reconciliation")
      : failure("checkout_conflict", "captured payment needs reconciliation", 409);
  }
  if (row.outcome === "accepted" || row.outcome === "processing" || row.outcome === "duplicate") {
    return intent
      ? resultFor(intent, row.event_timestamp, "duplicate")
      : failure("checkout_conflict", "provider event was already recorded", 409);
  }
  // Re-delivering an already-audited rejection is still an exact no-op. The
  // original rejection remains durable, while a changed payload is rejected
  // by the fingerprint checks before this branch.
  return {
    kind: "result",
    result: {
      checkoutId: intent?.provider_checkout_id ?? intent?.intent_id ?? row.event_id,
      paidAt: row.event_timestamp ?? row.received_at,
      status: "duplicate",
    },
  };
}

function failure(code: string, message: string, statusCode = 400): SettlementDecision {
  return { kind: "error", code, message, statusCode };
}

function updateIntentProviderState(
  db: AppDb,
  identity: WaffoEventIdentity,
  intentId: string,
  status: "paid" | "needs_reconciliation",
  reason: string | null,
  updatedAt: string,
  paidAt?: string,
): void {
  const updated = db
    .prepare(
      `UPDATE waffo_checkout_intents
       SET provider_order_id = COALESCE(provider_order_id, @orderId),
           provider_payment_id = COALESCE(provider_payment_id, @paymentId),
           provider_delivery_id = COALESCE(provider_delivery_id, @deliveryId),
           status = @status,
           failure_reason = @reason,
           paid_at = CASE WHEN @paidAt IS NULL THEN paid_at ELSE @paidAt END,
           updated_at = @updatedAt
       WHERE intent_id = @intentId AND status IN ('creating', 'open', 'unknown')`,
    )
    .run({
      orderId: identity.orderId,
      paymentId: identity.paymentId,
      deliveryId: identity.deliveryId,
      status,
      reason,
      paidAt: paidAt ?? null,
      updatedAt,
      intentId,
    });
  if (updated.changes !== 1) {
    throw new Error("local Waffo intent was changed during settlement");
  }
}

function insertEvent(
  db: AppDb,
  identity: WaffoEventIdentity,
  rawHash: string,
  normalizedHash: string,
  outcome: WaffoEventRow["outcome"],
  reason: string | null,
  eventTimestamp: string | null,
  receivedAt: string,
  payload: string,
): void {
  db.prepare(
    `INSERT INTO waffo_checkout_events (
       delivery_id, event_type, event_id, raw_hash, normalized_hash,
       payment_id, order_id, intent_id, outcome, reason, event_timestamp,
       received_at, payload
     ) VALUES (
       @deliveryId, @eventType, @eventId, @rawHash, @normalizedHash,
       @paymentId, @orderId, @intentId, @outcome, @reason, @eventTimestamp,
       @receivedAt, @payload
     )`,
  ).run({
    deliveryId: identity.deliveryId,
    eventType: identity.eventType,
    eventId: identity.eventId,
    rawHash,
    normalizedHash,
    paymentId: identity.paymentId,
    orderId: identity.orderId,
    intentId: identity.intentId,
    outcome,
    reason,
    eventTimestamp,
    receivedAt,
    payload,
  });
}

function recordAttempt(
  db: AppDb,
  identity: WaffoEventIdentity,
  rawHash: string,
  normalizedHash: string,
  outcome: string,
  reason: string | null,
  receivedAt: string,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO waffo_webhook_attempts (
       delivery_id, raw_hash, normalized_hash, outcome, reason, received_at
     ) VALUES (@deliveryId, @rawHash, @normalizedHash, @outcome, @reason, @receivedAt)`,
  ).run({
    deliveryId: identity.deliveryId,
    rawHash,
    normalizedHash,
    outcome,
    reason,
    receivedAt,
  });
}

function eventByDelivery(db: AppDb, deliveryId: string): WaffoEventRow | undefined {
  return db
    .prepare<[string], WaffoEventRow>(`${eventSelect} WHERE delivery_id = ?`)
    .get(deliveryId);
}

function eventByAnyIdentity(
  db: AppDb,
  identity: WaffoEventIdentity,
): WaffoEventRow | undefined {
  return (
    db
      .prepare<[string, string], WaffoEventRow>(
        `${eventSelect} WHERE event_type = ? AND event_id = ? LIMIT 1`,
      )
      .get(identity.eventType, identity.eventId) ??
    (identity.paymentId
      ? db
          .prepare<[string], WaffoEventRow>(
            `${eventSelect} WHERE payment_id = ? LIMIT 1`,
          )
          .get(identity.paymentId)
      : undefined) ??
    (identity.orderId
      ? db
          .prepare<[string], WaffoEventRow>(
            `${eventSelect} WHERE order_id = ? LIMIT 1`,
          )
          .get(identity.orderId)
      : undefined) ??
    (identity.intentId
      ? db
          .prepare<[string], WaffoEventRow>(
            `${eventSelect} WHERE intent_id = ? LIMIT 1`,
          )
          .get(identity.intentId)
      : undefined)
  );
}

function intentById(db: AppDb, intentId: string): WaffoIntentRow | undefined {
  return db.prepare<[string], WaffoIntentRow>(`${intentSelect} WHERE intent_id = ?`).get(intentId);
}

function recoverOrphanedCreatingIntents(db: AppDb, now: () => Date): void {
  const updatedAt = now().toISOString();
  db
    .transaction(() => {
      db
        .prepare(
          `UPDATE waffo_checkout_intents
           SET status = 'unknown',
               failure_reason = @reason,
               updated_at = @updatedAt
           WHERE status = 'creating'`,
        )
        .run({
          reason: "Waffo checkout creation was interrupted before a provider result was recorded",
          updatedAt,
        });
    })
    .immediate();
}

function mapCheckout(row: WaffoIntentRow): CheckoutRecord {
  return {
    checkoutId: row.provider_checkout_id ?? row.intent_id,
    intentId: row.intent_id,
    listingId: row.listing_id,
    weekId: row.week_id,
    chargeUsd: row.charge_cents / 100,
    nextUsd: row.target_bid_cents / 100,
    url: row.checkout_url ?? "",
    status: row.status === "paid" ? "paid" : "pending",
  };
}

function header(headers: Record<string, string>, name: string): string | undefined {
  const needle = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === needle && value.trim() !== "") return value;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
  const object = asRecord(value);
  if (!object) return undefined;
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(object)) {
    if (typeof item !== "string") return undefined;
    out[key] = item;
  }
  return out;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function exactString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && value.trim() === value
    ? value
    : undefined;
}

function canonicalTimestamp(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

function stableStringifyEvent(event: WaffoOrderEvent): string {
  const copy = { ...event } as Record<string, unknown>;
  // Waffo's delivery id changes when the same business event is retried. It is
  // deliberately the only event field omitted from the business fingerprint.
  delete copy.id;
  const timestamp = canonicalTimestamp(readString(event.timestamp));
  if (timestamp) copy.timestamp = timestamp;
  return stableStringify(copy);
}

function validateApiBase(value: string, mode: WaffoMode): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hostname === "") {
      throw new Error("Waffo API base must be HTTPS without credentials");
    }
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw new Error("Waffo API base must be an origin");
    }
    if (mode === "waffo-prod" && parsed.origin !== "https://api.waffo.ai") {
      throw new Error("waffo-prod requires the official Waffo API origin");
    }
    return parsed.origin;
  } catch {
    throw new Error(
      mode === "waffo-prod"
        ? "BLOCKED-CONFIG: waffo-prod requires the official HTTPS Waffo API origin"
        : "BLOCKED-CONFIG: WAFFO_API_BASE must be an HTTPS origin",
    );
  }
}

function isSafeHttpsUrl(value: string, sessionId: string): boolean {
  try {
    const parsed = parseSafeHttpsUrl(value);
    if (!parsed) return false;
    if (
      parsed.port !== "" ||
      hasExplicitPort(value) ||
      parsed.search ||
      parsed.hash ||
      !isApprovedCheckoutHost(parsed.hostname)
    ) {
      return false;
    }
    if (parsed.pathname === "/" || parsed.pathname.endsWith("/") || parsed.pathname.includes("//")) {
      return false;
    }
    const segments = parsed.pathname.split("/");
    if (segments.length !== 5 || segments[1] !== "store" || segments[3] !== "checkout") {
      return false;
    }
    let slug: string;
    let lastSegment: string;
    try {
      slug = decodeURIComponent(segments[2] ?? "");
      lastSegment = decodeURIComponent(parsed.pathname.slice(parsed.pathname.lastIndexOf("/") + 1));
    } catch {
      return false;
    }
    return slug.length > 0 && !slug.includes("/") && lastSegment === sessionId;
  } catch {
    return false;
  }
}

function parseSafeHttpsUrl(
  value: string,
  options: { originOnly?: boolean } = {},
): URL | undefined {
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.hostname === "" ||
      isPrivateHost(parsed.hostname)
    ) {
      return undefined;
    }
    if (
      options.originOnly === true &&
      (parsed.port !== "" ||
        hasExplicitPort(value) ||
        parsed.pathname !== "/" ||
        parsed.search ||
        parsed.hash)
    ) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function isApprovedProductionPublicHost(hostname: string): boolean {
  // The app's public origin is deployment-specific. A real production host
  // must be a routable HTTPS name rather than a local/test/private address.
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const reservedSuffixes = [
    ".test",
    ".example",
    ".example.com",
    ".example.net",
    ".example.org",
    ".invalid",
    ".local",
    ".internal",
  ];
  return host !== "example.com" && !reservedSuffixes.some((suffix) => host.endsWith(suffix));
}

function isApprovedCheckoutHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  // The official anonymous checkout currently resolves on Pancake's hosted
  // checkout origin. Never accept an arbitrary redirect host.
  return host === "pancake.waffo.ai";
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "local" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  const version = isIP(host);
  if (version === 4) {
    const octets = host.split(".").map(Number);
    const [first, second] = octets;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 192 && second === 0) ||
      (first === 198 && (second === 18 || second === 19)) ||
      (first === 198 && second === 51) ||
      (first === 203 && second === 0) ||
      first >= 224
    );
  }
  if (version === 6) {
    const mappedIpv4 = ipv4FromMappedIpv6(host);
    if (mappedIpv4 !== undefined) return isPrivateHost(mappedIpv4);
    return (
      host === "::" ||
      host === "::1" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      /^fe[89ab]/.test(host) ||
      host.startsWith("2001:db8:") ||
      host.startsWith("ff") ||
      host.startsWith("::ffff:127.") ||
      host.startsWith("::ffff:10.") ||
      host.startsWith("::ffff:192.168.")
    );
  }
  return false;
}

function hasExplicitPort(value: string): boolean {
  return /^https:\/\/[^/?#]*:\d+(?:[/?#]|$)/i.test(value);
}

function ipv4FromMappedIpv6(host: string): string | undefined {
  if (!host.startsWith("::ffff:")) return undefined;
  const suffix = host.slice("::ffff:".length);
  if (/^\d+\.\d+\.\d+\.\d+$/.test(suffix)) return suffix;
  const pieces = suffix.split(":");
  if (pieces.length !== 2 || pieces.some((piece) => !/^[0-9a-f]{1,4}$/.test(piece))) {
    return undefined;
  }
  const high = Number.parseInt(pieces[0]!, 16);
  const low = Number.parseInt(pieces[1]!, 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

function dollarsToCents(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new PaymentError("invalid_amount", `${field} must be a non-negative whole dollar amount`);
  }
  const cents = value * 100;
  if (!Number.isSafeInteger(cents)) {
    throw new PaymentError("invalid_amount", `${field} must fit safely in USD cents`);
  }
  return cents;
}

function centsToDisplayString(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("invalid cents");
  const raw = BigInt(cents).toString();
  if (raw.length <= 2) return `0.${raw.padStart(2, "0")}`;
  return `${raw.slice(0, -2)}.${raw.slice(-2)}`;
}

function decimalToCents(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value)) return undefined;
  const [whole, fraction = ""] = value.split(".");
  try {
    const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
    if (cents > BigInt(Number.MAX_SAFE_INTEGER)) return undefined;
    return Number(cents);
  } catch {
    return undefined;
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isUniqueConstraint(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: unknown }).code;
  return code === "SQLITE_CONSTRAINT_UNIQUE" || error.message.includes("UNIQUE constraint failed");
}

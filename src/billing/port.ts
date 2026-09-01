import type { AppDb } from "../db.js";

export type CreateCheckoutInput = {
  listingId: string;
  weekId: string;
  chargeUsd: number;
  nextUsd: number;
};

export type CheckoutStart = {
  checkoutId: string;
  url: string;
};

export type CheckoutRecord = {
  checkoutId: string;
  intentId?: string;
  listingId: string;
  weekId: string;
  chargeUsd: number;
  nextUsd: number;
  url: string;
  status: "pending" | "paid";
};

export type WebhookResult = {
  checkoutId: string;
  paidAt: string;
  status?: "paid" | "duplicate" | "needs_reconciliation";
};

export type PaymentPort = {
  readonly kind: "fixture" | "live";
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutStart>;
  applyPaid(checkoutId: string, paidAt: string): Promise<void>;
  getCheckout(checkoutId: string): CheckoutRecord | undefined;
  handleWebhook(
    rawBody: string,
    headers: Record<string, string>,
    receivedAt: string,
  ): Promise<WebhookResult>;
  database?(): AppDb;
};

export class PaymentError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = "PaymentError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

/** The only SKU is this week's opening slot. */

export const OPENING_SLOT_SKU = "opening_slot";

export class ShowError extends Error {
  readonly code = "cannot_buy_show";
  readonly statusCode = 400;

  constructor(message = "cannot buy the rest of the show") {
    super(message);
    this.name = "ShowError";
  }
}

const ALLOWED_SKUS = new Set([
  OPENING_SLOT_SKU,
  "opening",
  "first_slot",
  "deal_list_1",
]);

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function rejectUnknownSku(value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value !== "string") {
    throw new ShowError();
  }
  const token = normalizeToken(value);
  if (token.length === 0 || ALLOWED_SKUS.has(token)) {
    return;
  }
  throw new ShowError();
}

/**
 * Refuse checkout for anything except the allowlisted opening-slot product.
 * Absent / blank / opening-slot aliases are allowed; every other selector is
 * rejected before checkout.
 */
export function assertOpeningSlotOnly(body: unknown): void {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return;
  }
  const input = body as Record<string, unknown>;

  if (
    input.buyShow === true ||
    input.hostShow === true ||
    input.hideOthers === true ||
    input.hideOtherListings === true
  ) {
    throw new ShowError();
  }

  if (typeof input.weeks === "number" && input.weeks > 1) {
    throw new ShowError();
  }
  if (typeof input.pinWeeks === "number" && input.pinWeeks > 1) {
    throw new ShowError();
  }
  if (
    input.slots !== undefined &&
    input.slots !== 1 &&
    input.slots !== "1" &&
    input.slots !== OPENING_SLOT_SKU &&
    input.slots !== "opening"
  ) {
    throw new ShowError();
  }

  rejectUnknownSku(input.sku);
  rejectUnknownSku(input.product);
  rejectUnknownSku(input.item);
  rejectUnknownSku(input.checkout);
}

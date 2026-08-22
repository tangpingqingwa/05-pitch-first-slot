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

const FORBIDDEN_SKU_TOKENS = [
  "all_remaining_slots",
  "remaining_slots",
  "remaining_slot",
  "whole_show",
  "host_the_show",
  "host_show",
  "all_slots",
  "every_pitch",
  "pin_multiple_weeks",
  "hide_others",
  "hide_other_listings",
];

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isForbiddenSku(value: string): boolean {
  const token = normalizeToken(value);
  if (token.length === 0 || ALLOWED_SKUS.has(token)) {
    return false;
  }
  return FORBIDDEN_SKU_TOKENS.some(
    (forbidden) => token === forbidden || token.includes(forbidden),
  );
}

function rejectIfForbiddenSku(value: unknown): void {
  if (typeof value === "string" && isForbiddenSku(value)) {
    throw new ShowError();
  }
}

/**
 * Refuse checkout for remaining slots, the whole show, multi-week pins,
 * or hiding other listings. Absent / opening-slot SKU is allowed.
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

  rejectIfForbiddenSku(input.sku);
  rejectIfForbiddenSku(input.product);
  rejectIfForbiddenSku(input.item);
  rejectIfForbiddenSku(input.checkout);
}

import type { AppDb } from "../db.js";
import { paymentMode, type WaffoEnv } from "../config.js";
import type { PaymentPort } from "./port.js";
import { WaffoFixture } from "./waffo-fixture.js";
import { WaffoLive, type WaffoLiveOptions } from "./waffo.js";

export { PaymentError } from "./port.js";
export type {
  CheckoutRecord,
  CheckoutStart,
  CreateCheckoutInput,
  PaymentPort,
  WebhookResult,
} from "./port.js";
export { WaffoFixture } from "./waffo-fixture.js";
export { WaffoLive } from "./waffo.js";

export type CreatePaymentPortOptions = Omit<WaffoLiveOptions, "env"> & {
  env?: WaffoEnv;
  autoSettle?: boolean;
};

/** Canonical provider factory. Only WAFFO_MODE selects the implementation. */
export function createPaymentPort(
  db: AppDb,
  options: CreatePaymentPortOptions = {},
): PaymentPort {
  const env = options.env ?? process.env;
  const mode = paymentMode(env);
  if (mode === "fixture") {
    return new WaffoFixture(db, {
      autoSettle: options.autoSettle,
      now: options.now,
    });
  }
  return new WaffoLive(db, {
    env,
    mode,
    fetch: options.fetch,
    now: options.now,
    timeoutMs: options.timeoutMs,
    databasePath: options.databasePath,
  });
}

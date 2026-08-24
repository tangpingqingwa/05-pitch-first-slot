import {
  polarAccessToken,
  polarLiveEnabled,
  type PolarEnv,
} from "../config.js";
import type { AppDb } from "../db.js";
import { PolarLive } from "./polar_live.js";
import { PolarError, PolarFixture } from "./polar_fixture.js";

export type { PolarEnv };
export { PolarError };
export {
  polarAccessToken,
  polarFixtureOnly,
  polarLiveEnabled,
} from "../config.js";

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

export type PolarWebhookResult = {
  checkoutId: string;
  paidAt: string;
};

/** BUILD PolarPort. HTTP never imports the live Polar client. */
export type PolarPort = {
  readonly kind: "fixture" | "live";
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutStart>;
  applyPaid(checkoutId: string, paidAt: string): Promise<void>;
  handleWebhook(
    rawBody: string,
    headers: Record<string, string>,
    paidAt: string,
  ): Promise<PolarWebhookResult>;
};

export type CreatePolarPortOptions = {
  env?: PolarEnv;
  autoSettle?: boolean;
  fetch?: typeof fetch;
  now?: () => Date;
};

/** Fixture unless `POLAR_LIVE=1`. `POLAR_FIXTURE_ONLY=1` always wins. Missing secrets fail closed. */
export function createPolarPort(
  db: AppDb,
  options: CreatePolarPortOptions = {},
): PolarPort {
  const env = options.env ?? process.env;
  if (polarLiveEnabled(env)) {
    if (!polarAccessToken(env)) {
      throw new Error("BLOCKED-SECRET: POLAR_ACCESS_TOKEN");
    }
    return new PolarLive(db, { env, fetch: options.fetch, now: options.now });
  }
  return new PolarFixture(db, {
    autoSettle: options.autoSettle,
    now: options.now,
  });
}

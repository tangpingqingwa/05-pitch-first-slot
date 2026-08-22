import type { AppDb } from "../db.js";
import { PolarFixture } from "./polar_fixture.js";

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

/** BUILD PolarPort. HTTP never imports the live Polar client. */
export type PolarPort = {
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutStart>;
  applyPaid(checkoutId: string, paidAt: string): Promise<void>;
};

export type PolarEnv = NodeJS.ProcessEnv;

export function polarFixtureOnly(env: PolarEnv = process.env): boolean {
  return env.POLAR_FIXTURE_ONLY === "1";
}

/** Live Polar only when POLAR_LIVE=1. POLAR_FIXTURE_ONLY=1 always wins. */
export function polarLiveEnabled(env: PolarEnv = process.env): boolean {
  if (polarFixtureOnly(env)) {
    return false;
  }
  return env.POLAR_LIVE === "1";
}

export type CreatePolarPortOptions = {
  env?: PolarEnv;
  autoSettle?: boolean;
};

/**
 * Fixture unless live is enabled. Live adapter is PR 6; this factory
 * fails closed and never opens a Polar network connection.
 */
export function createPolarPort(
  db: AppDb,
  options: CreatePolarPortOptions = {},
): PolarPort {
  const env = options.env ?? process.env;
  if (polarLiveEnabled(env)) {
    if (!env.POLAR_ACCESS_TOKEN?.trim()) {
      throw new Error("BLOCKED-SECRET: POLAR_ACCESS_TOKEN");
    }
    throw new Error("live Polar is env-gated and must not run in tests");
  }
  return new PolarFixture(db, { autoSettle: options.autoSettle });
}

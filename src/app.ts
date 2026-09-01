import Fastify, { type FastifyInstance } from "fastify";
import { createPaymentPort } from "./billing/index.js";
import type { PaymentPort } from "./billing/port.js";
import { isMemoryDatabasePath, paymentMode } from "./config.js";
import { nowUtc } from "./core/week.js";
import { openDatabase, type AppDb } from "./db.js";
import { assetRoutes } from "./http/assets.js";
import { bidRoutes } from "./http/bids.js";
import { clickRoutes } from "./http/clicks.js";
import { healthRoutes } from "./http/health.js";
import { listingRoutes } from "./http/listings.js";
import { pageRoutes } from "./http/pages.js";
import { webhookRoutes } from "./http/webhook.js";

declare module "fastify" {
  interface FastifyInstance {
    db: AppDb;
    now: () => Date;
    payment: PaymentPort;
  }
}

export type BuildAppOptions = {
  logger?: boolean;
  db?: AppDb;
  databasePath?: string;
  now?: () => Date;
  payment?: PaymentPort;
};

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  const ownsDb = options.db === undefined;
  const configuredDatabasePath = options.databasePath ?? process.env.DATABASE_PATH?.trim();
  const production = process.env.NODE_ENV === "production";
  const mode = production || options.payment === undefined
    ? paymentMode(process.env)
    : undefined;
  if (production && mode !== "waffo-prod") {
    throw new Error("BLOCKED-CONFIG: production requires WAFFO_MODE=waffo-prod");
  }
  if (
    production &&
    (!process.env.DATABASE_PATH?.trim() ||
      isMemoryDatabasePath(process.env.DATABASE_PATH) ||
      !configuredDatabasePath ||
      isMemoryDatabasePath(configuredDatabasePath))
  ) {
    throw new Error("BLOCKED-CONFIG: production requires an explicit durable DATABASE_PATH");
  }
  const db = options.db ?? openDatabase(configuredDatabasePath ?? ":memory:");
  const now = options.now ?? nowUtc;
  const payment = options.payment ?? createPaymentPort(db, {
    now,
    databasePath: configuredDatabasePath,
  });
  if (production && payment.kind !== "live") {
    throw new Error("BLOCKED-CONFIG: production cannot use the fixture payment rail");
  }
  app.decorate("db", db);
  app.decorate("now", now);
  app.decorate("payment", payment);
  if (ownsDb) {
    app.addHook("onClose", async () => {
      db.close();
    });
  }
  await app.register(healthRoutes);
  await app.register(assetRoutes);
  await app.register(listingRoutes);
  await app.register(bidRoutes);
  await app.register(clickRoutes);
  await app.register(pageRoutes);
  await app.register(webhookRoutes);
  return app;
}

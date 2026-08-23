import Fastify, { type FastifyInstance } from "fastify";
import { createPolarPort, type PolarPort } from "./billing/polar.js";
import { nowUtc } from "./core/week.js";
import { openDatabase, type AppDb } from "./db.js";
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
    polar: PolarPort;
  }
}

export type BuildAppOptions = {
  logger?: boolean;
  db?: AppDb;
  databasePath?: string;
  now?: () => Date;
  polar?: PolarPort;
};

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  const ownsDb = options.db === undefined;
  const db = options.db ?? openDatabase(options.databasePath ?? ":memory:");
  const now = options.now ?? nowUtc;
  const polar = options.polar ?? createPolarPort(db, { now });
  app.decorate("db", db);
  app.decorate("now", now);
  app.decorate("polar", polar);
  if (ownsDb) {
    app.addHook("onClose", async () => {
      db.close();
    });
  }
  await app.register(healthRoutes);
  await app.register(listingRoutes);
  await app.register(bidRoutes);
  await app.register(clickRoutes);
  await app.register(pageRoutes);
  await app.register(webhookRoutes);
  return app;
}

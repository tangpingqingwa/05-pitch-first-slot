import Fastify, { type FastifyInstance } from "fastify";
import { openDatabase, type AppDb } from "./db.js";
import { nowUtc } from "./core/week.js";
import { bidRoutes } from "./http/bids.js";
import { healthRoutes } from "./http/health.js";
import { listingRoutes } from "./http/listings.js";
import { pageRoutes } from "./http/pages.js";

declare module "fastify" {
  interface FastifyInstance {
    db: AppDb;
    now: () => Date;
  }
}

export type BuildAppOptions = {
  logger?: boolean;
  db?: AppDb;
  databasePath?: string;
  now?: () => Date;
};

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  const ownsDb = options.db === undefined;
  const db = options.db ?? openDatabase(options.databasePath ?? ":memory:");
  app.decorate("db", db);
  app.decorate("now", options.now ?? nowUtc);
  if (ownsDb) {
    app.addHook("onClose", async () => {
      db.close();
    });
  }
  await app.register(healthRoutes);
  await app.register(listingRoutes);
  await app.register(bidRoutes);
  await app.register(pageRoutes);
  return app;
}

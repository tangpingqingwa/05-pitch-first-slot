import { buildApp } from "./app.js";
import { isMemoryDatabasePath } from "./config.js";
import { defaultDatabasePath } from "./db.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`invalid PORT: ${process.env.PORT ?? ""}`);
}

const databasePath = process.env.NODE_ENV === "production"
  ? process.env.DATABASE_PATH?.trim()
  : process.env.DATABASE_PATH?.trim() ?? defaultDatabasePath();
if (process.env.NODE_ENV === "production" && (!databasePath || isMemoryDatabasePath(databasePath))) {
  throw new Error("BLOCKED-CONFIG: production requires an explicit durable DATABASE_PATH");
}

const app = await buildApp({
  logger: true,
  databasePath,
});
await app.listen({ host: "127.0.0.1", port });

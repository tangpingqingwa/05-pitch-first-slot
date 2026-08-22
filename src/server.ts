import { buildApp } from "./app.js";
import { defaultDatabasePath } from "./db.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`invalid PORT: ${process.env.PORT ?? ""}`);
}

const app = await buildApp({
  logger: true,
  databasePath: process.env.DATABASE_PATH ?? defaultDatabasePath(),
});
await app.listen({ host: "0.0.0.0", port });

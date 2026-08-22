import { buildApp } from "./app.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`invalid PORT: ${process.env.PORT ?? ""}`);
}

const app = await buildApp({ logger: true });
await app.listen({ host: "0.0.0.0", port });

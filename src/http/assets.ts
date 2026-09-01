import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FastifyPluginAsync } from "fastify";

const PUBLIC_ROOT = resolve(process.cwd(), "public");
const ICONS = new Set([
  "bitcoin.svg",
  "bot.svg",
  "chevron-down.svg",
  "chevron-right.svg",
  "code-xml.svg",
  "globe.svg",
  "heart-pulse.svg",
  "layout-grid-light.svg",
  "linkie.svg",
  "megaphone.svg",
  "moon.svg",
  "outbid-mark.svg",
  "rail-bot.svg",
  "rail-megaphone.svg",
  "scale.svg",
  "search-check-accent.svg",
  "search-check.svg",
  "search.svg",
  "share-2.svg",
  "shield-check.svg",
  "trophy.svg",
]);

/** Small allow-listed asset surface; no arbitrary filesystem path is accepted. */
export const assetRoutes: FastifyPluginAsync = async (app) => {
  app.get("/fonts/dm-sans-latin-variable.woff2", async (_request, reply) =>
    reply
      .header("cache-control", "public, max-age=31536000, immutable")
      .type("font/woff2")
      .send(readFileSync(resolve(PUBLIC_ROOT, "fonts/dm-sans-latin-variable.woff2"))),
  );

  app.get<{ Params: { name: string } }>("/icons/:name", async (request, reply) => {
    if (!ICONS.has(request.params.name)) {
      return reply.status(404).type("text/plain; charset=utf-8").send("not found");
    }
    return reply
      .header("cache-control", "public, max-age=31536000, immutable")
      .type("image/svg+xml; charset=utf-8")
      .send(readFileSync(resolve(PUBLIC_ROOT, "icons", request.params.name)));
  });
};

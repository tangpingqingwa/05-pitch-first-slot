import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FastifyPluginAsync } from "fastify";

const PUBLIC_ROOT = resolve(process.cwd(), "public");
const INDEXNOW_KEY = "80a743f63f883a8a08398597572d438b";
const ICONS = new Set([
  "brand-mark.svg",
  "brand-mark.png",
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
  app.get(`/${INDEXNOW_KEY}.txt`, async (_request, reply) =>
    reply
      .header("cache-control", "public, max-age=86400")
      .type("text/plain; charset=utf-8")
      .send(`${INDEXNOW_KEY}\n`),
  );

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
      .type(request.params.name.endsWith(".png") ? "image/png" : "image/svg+xml; charset=utf-8")
      .send(readFileSync(resolve(PUBLIC_ROOT, "icons", request.params.name)));
  });

  app.get("/favicon.ico", async (_request, reply) =>
    reply
      .header("cache-control", "public, max-age=86400")
      .type("image/png")
      .send(readFileSync(resolve(PUBLIC_ROOT, "icons", "brand-mark.png"))),
  );

  app.get("/robots.txt", async (_request, reply) =>
    reply
      .header("cache-control", "public, max-age=3600")
      .type("text/plain; charset=utf-8")
      .send("User-agent: *\nAllow: /\nDisallow: /checkout/\nDisallow: /click/\nSitemap: https://pitchslot.lol/sitemap.xml\n"),
  );

  app.get("/sitemap.xml", async (_request, reply) =>
    reply
      .header("cache-control", "public, max-age=3600")
      .type("application/xml; charset=utf-8")
      .send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://pitchslot.lol</loc><changefreq>daily</changefreq><priority>1.0</priority></url><url><loc>https://pitchslot.lol/about</loc><changefreq>monthly</changefreq></url><url><loc>https://pitchslot.lol/rules</loc><changefreq>monthly</changefreq></url></urlset>'),
  );

  app.get("/site.webmanifest", async (_request, reply) =>
    reply
      .header("cache-control", "public, max-age=3600")
      .type("application/manifest+json")
      .send({ name: "Pitch First Slot", short_name: "Pitch Slot", start_url: "/", display: "standalone", background_color: "#1f1511", theme_color: "#d9775f", icons: [{ src: "/icons/brand-mark.png", sizes: "512x512", type: "image/png" }] }),
  );
};

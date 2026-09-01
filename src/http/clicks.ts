import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { ClickError, incrementClick } from "../core/clicks.js";
import { getListingById } from "../core/listing.js";
import { getBidInRollingWeek } from "../core/rank.js";
import type { AppDb } from "../db.js";

async function recordClickAndRedirect(
  db: AppDb,
  listingId: string,
  reply: FastifyReply,
) {
  try {
    const { url } = incrementClick(db, listingId);
    return reply.redirect(url);
  } catch (err) {
    if (err instanceof ClickError) {
      return reply.code(err.statusCode).send({ error: err.code });
    }
    throw err;
  }
}

export const clickRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { id: string } }>(
    "/listings/:id/clicks",
    async (request, reply) =>
      recordClickAndRedirect(app.db, request.params.id, reply),
  );

  // The board's visible paid-card anchor is a confirmed public click. Keep an
  // unpaid/hidden listing navigable, but do not turn that fallback navigation
  // into a click fact. The existing POST endpoint remains compatible.
  app.get<{ Params: { id: string } }>(
    "/listings/:id/clicks",
    async (request, reply) => {
      const listing = getListingById(app.db, request.params.id);
      if (listing === undefined) {
        return reply.code(404).send({ error: "listing_not_found" });
      }
      if (getBidInRollingWeek(app.db, listing.id, app.now()) === undefined) {
        return reply.redirect(listing.url);
      }
      return recordClickAndRedirect(app.db, listing.id, reply);
    },
  );
};

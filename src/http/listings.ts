import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { PolarError } from "../billing/polar.js";
import { createListing, ListingError } from "../core/listing.js";
import { BidError, getBid, parseBidUsd, quoteBid } from "../core/rank.js";
import { ShowError, assertOpeningSlotOnly } from "../core/show.js";
import { currentWeekId } from "../core/week.js";

function isHtmlForm(request: FastifyRequest): boolean {
  const type = String(request.headers["content-type"] ?? "");
  const accept = String(request.headers.accept ?? "");
  return (
    type.includes("application/x-www-form-urlencoded") ||
    (/\btext\/html\b/.test(accept) && !/\bapplication\/json\b/.test(accept))
  );
}

function sendError(
  request: FastifyRequest,
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
) {
  if (isHtmlForm(request)) {
    return reply
      .code(statusCode)
      .type("text/html; charset=utf-8")
      .send(
        `<!DOCTYPE html><html lang="en"><body><p>${message}</p><p><a href="/">Back to the room</a></p></body></html>`,
      );
  }
  return reply.code(statusCode).send({ error: code });
}

export const listingRoutes: FastifyPluginAsync = async (app) => {
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_request, body, done) => {
      const raw = typeof body === "string" ? body : body.toString("utf8");
      done(null, Object.fromEntries(new URLSearchParams(raw)));
    },
  );

  app.post("/listings", async (request, reply) => {
    try {
      const listing = createListing(app.db, request.body, app.now());
      const body = (request.body ?? {}) as Record<string, unknown>;
      const hasFormBid =
        body.amountUsd !== undefined || body.nextUsd !== undefined;
      if (isHtmlForm(request) && hasFormBid) {
        const weekId = currentWeekId(app.now());
        const nextUsd = parseBidUsd(body.amountUsd ?? body.nextUsd);
        const quote = quoteBid(getBid(app.db, listing.id, weekId), nextUsd);
        assertOpeningSlotOnly(body);
        const started = await app.polar.createCheckout({
          listingId: listing.id,
          weekId,
          chargeUsd: quote.chargeUsd,
          nextUsd: quote.nextUsd,
        });
        return reply.redirect(started.url, 303);
      }
      return listing;
    } catch (err) {
      if (
        err instanceof ListingError ||
        err instanceof BidError ||
        err instanceof ShowError ||
        err instanceof PolarError
      ) {
        return sendError(request, reply, err.statusCode, err.code, err.message);
      }
      const message = err instanceof Error ? err.message : "";
      if (message.startsWith("BLOCKED-SECRET")) {
        return sendError(request, reply, 503, "polar_unavailable", message);
      }
      throw err;
    }
  });
};

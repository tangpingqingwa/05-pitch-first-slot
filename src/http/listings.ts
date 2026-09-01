import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { PaymentError } from "../billing/port.js";
import { createListing, ListingError } from "../core/listing.js";
import { BidError, checkoutWeekId, parseBidUsd, quoteBid } from "../core/rank.js";
import { ShowError, assertOpeningSlotOnly } from "../core/show.js";

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
      const body = (request.body ?? {}) as Record<string, unknown>;
      const htmlForm = isHtmlForm(request);
      const hasFormBid =
        body.amountUsd !== undefined || body.nextUsd !== undefined;
      let validatedNextUsd: number | undefined;
      if (htmlForm && hasFormBid) {
        // Validate every bid-only field before creating a listing. An invalid
        // form must not leave an unranked durable row behind.
        validatedNextUsd = parseBidUsd(body.amountUsd ?? body.nextUsd);
        quoteBid(undefined, validatedNextUsd);
        assertOpeningSlotOnly(body);
      }

      const listing = createListing(app.db, request.body, app.now());
      if (htmlForm && hasFormBid) {
        // Raise identity is checkoutWeekId (last 7 days), not currentWeekId.
        const { current, weekId } = checkoutWeekId(app.db, listing.id, app.now());
        const nextUsd = validatedNextUsd!;
        const quote = quoteBid(current, nextUsd);
        const started = await app.payment.createCheckout({
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
        err instanceof PaymentError
      ) {
        return sendError(request, reply, err.statusCode, err.code, err.message);
      }
      const message = err instanceof Error ? err.message : "";
      if (message.startsWith("BLOCKED-SECRET")) {
        return sendError(request, reply, 503, "payment_unavailable", message);
      }
      throw err;
    }
  });
};

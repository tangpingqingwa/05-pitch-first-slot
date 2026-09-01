import type { FastifyPluginAsync } from "fastify";
import { PaymentError } from "../billing/port.js";
import { getListingById } from "../core/listing.js";
import {
  BidError,
  checkoutWeekId,
  getBidInRollingWeek,
  parseBidUsd,
  quoteBid,
} from "../core/rank.js";
import { ShowError, assertOpeningSlotOnly } from "../core/show.js";

type BidBody = {
  amountUsd?: unknown;
  nextUsd?: unknown;
};

export const bidRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { id: string }; Body: BidBody }>(
    "/listings/:id/bids",
    async (request, reply) => {
      try {
        const body = request.body ?? {};
        assertOpeningSlotOnly(body);
        const listing = getListingById(app.db, request.params.id);
        if (listing === undefined) {
          throw new BidError("listing_not_found", "listing not found", 404);
        }
        // Raise identity is checkoutWeekId (last 7 days), not currentWeekId.
        const { current, weekId } = checkoutWeekId(app.db, listing.id, app.now());
        const nextUsd = parseBidUsd(
          body.amountUsd !== undefined ? body.amountUsd : body.nextUsd,
        );
        const quote = quoteBid(current, nextUsd);
        const started = await app.payment.createCheckout({
          listingId: listing.id,
          weekId,
          chargeUsd: quote.chargeUsd,
          nextUsd: quote.nextUsd,
        });
        const paid = getBidInRollingWeek(app.db, listing.id, app.now());
        if (app.payment.kind === "live" || paid === undefined) {
          return reply.code(303).header("location", started.url).send({
            listingId: listing.id,
            weekId,
            amountUsd: quote.nextUsd,
            chargeUsd: quote.chargeUsd,
            checkoutId: started.checkoutId,
            url: started.url,
          });
        }
        return {
          listingId: paid.listingId,
          weekId: paid.weekId,
          amountUsd: paid.amountUsd,
          chargeUsd: quote.chargeUsd,
          paidAt: paid.paidAt,
          checkoutId: started.checkoutId,
          url: started.url,
        };
      } catch (err) {
        if (
          err instanceof BidError ||
          err instanceof ShowError ||
          err instanceof PaymentError
        ) {
          return reply.code(err.statusCode).send({ error: err.code });
        }
        const message = err instanceof Error ? err.message : "";
        if (message.startsWith("BLOCKED-SECRET")) {
          return reply.code(503).send({ error: "payment_unavailable" });
        }
        throw err;
      }
    },
  );
};

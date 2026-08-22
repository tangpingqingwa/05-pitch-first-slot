import type { FastifyPluginAsync } from "fastify";
import { BidError, placePaidBid } from "../core/rank.js";
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
        const nextUsd =
          body.amountUsd !== undefined ? body.amountUsd : body.nextUsd;
        const placed = placePaidBid(
          app.db,
          request.params.id,
          nextUsd,
          app.now(),
        );
        return {
          listingId: placed.bid.listingId,
          weekId: placed.bid.weekId,
          amountUsd: placed.bid.amountUsd,
          chargeUsd: placed.chargeUsd,
          paidAt: placed.bid.paidAt,
        };
      } catch (err) {
        if (err instanceof BidError || err instanceof ShowError) {
          return reply.code(err.statusCode).send({ error: err.code });
        }
        throw err;
      }
    },
  );
};

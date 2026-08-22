import type { FastifyPluginAsync } from "fastify";
import { createListing, ListingError } from "../core/listing.js";

export const listingRoutes: FastifyPluginAsync = async (app) => {
  app.post("/listings", async (request, reply) => {
    try {
      const listing = createListing(app.db, request.body);
      return listing;
    } catch (err) {
      if (err instanceof ListingError) {
        return reply.code(err.statusCode).send({ error: err.code });
      }
      throw err;
    }
  });
};

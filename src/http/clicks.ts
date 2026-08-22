import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { ClickError, incrementClick } from "../core/clicks.js";
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

  // Board <a> is GET; same increment-then-redirect as POST.
  app.get<{ Params: { id: string } }>(
    "/listings/:id/clicks",
    async (request, reply) =>
      recordClickAndRedirect(app.db, request.params.id, reply),
  );
};

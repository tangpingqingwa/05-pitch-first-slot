import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { PaymentError } from "../billing/port.js";
import { BidError } from "../core/rank.js";

export const WAFFO_WEBHOOK_PATH = "/api/webhooks/waffo" as const;

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_request, body, done) => {
      done(null, body);
    },
  );

  const receiveWebhook = async (request: FastifyRequest, reply: FastifyReply) => {
    const rawBody = rawWebhookBody(request.body);
    const headers = headerMap(request.headers);
    try {
      const result = await app.payment.handleWebhook(
        rawBody,
        headers,
        app.now().toISOString(),
      );
      return {
        ok: true,
        status: result.status ?? "paid",
        checkoutId: result.checkoutId,
      };
    } catch (err) {
      if (err instanceof PaymentError || err instanceof BidError) {
        return reply.code(err.statusCode).send({ error: err.code });
      }
      const message = err instanceof Error ? err.message : "";
      if (message.startsWith("BLOCKED-SECRET")) {
        return reply.code(503).send({ error: "payment_unavailable" });
      }
      throw err;
    }
  };

  app.post(WAFFO_WEBHOOK_PATH, receiveWebhook);
};

function rawWebhookBody(body: unknown): string {
  if (typeof body === "string") {
    return body;
  }
  if (Buffer.isBuffer(body)) {
    return body.toString("utf8");
  }
  return JSON.stringify(body ?? {});
}

function headerMap(headers: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      out[key] = value;
    } else if (Array.isArray(value) && typeof value[0] === "string") {
      out[key] = value[0];
    }
  }
  return out;
}

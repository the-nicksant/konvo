import { createHmac, timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";

/**
 * Hono middleware that verifies the X-Hub-Signature-256 header on incoming
 * webhook requests. Meta (WhatsApp Cloud API) signs every POST payload with
 * HMAC-SHA256 using the app secret.
 *
 * Returns 401 if the header is missing or the signature does not match.
 * The request body is consumed here, but Hono caches it — downstream handlers
 * can still call c.req.json() to access the parsed payload.
 */
export function verifySignature(appSecret: string): MiddlewareHandler {
  return async (c, next) => {
    const signature = c.req.header("x-hub-signature-256");
    if (!signature) return c.text("Missing signature", 401);

    const body = await c.req.text();
    const expected = `sha256=${createHmac("sha256", appSecret).update(body).digest("hex")}`;

    // Use timingSafeEqual to prevent timing attacks that could leak the app secret
    const sigBuf = Buffer.from(signature, "utf8");
    const expBuf = Buffer.from(expected, "utf8");
    const valid = sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);
    if (!valid) return c.text("Invalid signature", 401);

    return next();
  };
}

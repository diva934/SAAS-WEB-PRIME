import { createHmac, timingSafeEqual } from "node:crypto";
import { plans, readRawBody, saveSubscription, sendJson } from "./_shared.js";

export const config = { api: { bodyParser: false } };

function verifySignature(payload, signatureHeader) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret || !signatureHeader) return false;
  const parts = signatureHeader.split(",").map((part) => part.split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return signatures.some((signature) => {
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const rawBody = await readRawBody(req);
  if (!verifySignature(rawBody, req.headers["stripe-signature"])) {
    sendJson(res, 400, { error: "Signature Stripe invalide." });
    return;
  }

  try {
    const event = JSON.parse(rawBody.toString("utf8"));
    const object = event.data?.object || {};
    const metadata = object.metadata || {};
    const userId = object.client_reference_id || metadata.user_id;
    const plan = metadata.expertly_plan;

    if (event.type === "checkout.session.completed" && object.payment_status === "paid") {
      await saveSubscription({ userId, plan, status: "active" });
    }

    if (["customer.subscription.updated", "customer.subscription.deleted"].includes(event.type) && plans[plan]) {
      const active = ["active", "trialing"].includes(object.status);
      await saveSubscription({ userId, plan, status: active ? "active" : "inactive" });
    }

    sendJson(res, 200, { received: true });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Webhook Stripe indisponible." });
  }
}

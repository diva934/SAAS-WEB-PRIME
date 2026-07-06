import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import {
  accessUrlFor,
  makeAccessToken,
  readCreatorRecordBySlug,
  saveCreatorState,
  sendAccessEmail,
  sendJson,
  sendPlausibleEvent,
  updateOrderEmailStatus,
} from "./_shared.js";

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function validStripeSignature(payload, signatureHeader) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret || !signatureHeader) return false;
  const parts = signatureHeader.split(",").map((part) => part.split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return signatures.some((signature) => {
    const actual = Buffer.from(signature);
    const wanted = Buffer.from(expected);
    return actual.length === wanted.length && timingSafeEqual(actual, wanted);
  });
}

function frDate(date) {
  return date.toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// POST /api/stripe-webhook
// Idempotent via order.stripeSessionId. Creates contact + paid order + sends email.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    const rawBody = await readRawBody(req);
    if (!validStripeSignature(rawBody, req.headers["stripe-signature"])) {
      sendJson(res, 400, { error: "Signature Stripe invalide." });
      return;
    }
    const event = JSON.parse(rawBody.toString("utf8"));
    if (event.type !== "checkout.session.completed") {
      sendJson(res, 200, { received: true, ignored: event.type || "unknown" });
      return;
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      sendJson(res, 503, { error: "Stripe non configure." });
      return;
    }

    const sessionId = event.data?.object?.id;
    if (!sessionId) {
      sendJson(res, 400, { error: "Session absente." });
      return;
    }

    const stripeResponse = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          ...(event.account ? { "Stripe-Account": event.account } : {}),
        },
      },
    );
    const session = await stripeResponse.json();
    if (!stripeResponse.ok) {
      sendJson(res, 400, { error: session?.error?.message || "Session Stripe invalide." });
      return;
    }
    if (session.payment_status !== "paid") {
      sendJson(res, 200, { received: true, pending: session.payment_status || "unpaid" });
      return;
    }

    const slug = session.metadata?.creator_slug;
    const productId = session.metadata?.product_id;
    const customerName = session.metadata?.customer_name || session.customer_details?.name || "Client";
    const customerEmail = session.customer_details?.email || session.customer_email || "";
    if (!slug || !productId || !customerEmail) {
      sendJson(res, 200, { received: true, skipped: "metadonnees incompletes" });
      return;
    }

    const record = await readCreatorRecordBySlug(slug);
    if (!record) {
      sendJson(res, 404, { error: "Boutique introuvable." });
      return;
    }
    const { userId, state } = record;

    // Idempotency: Stripe may deliver the same event multiple times.
    const already = state.orders.find((item) => item.stripeSessionId === session.id);
    if (already) {
      // Final status (sent/not_configured/failed) -> duplicate, no resend.
      if (already.emailStatus !== "pending") {
        sendJson(res, 200, { received: true, duplicate: already.id, emailStatus: already.emailStatus });
        return;
      }
      // emailStatus=pending: CAS save succeeded but RPC failed last time.
      // Retry delivery using the SAME Resend idempotency key (orderId + "initial").
      // Do NOT recreate the order or increment analytics.
      const retryProduct = state.products.find((item) => item.id === already.productId);
      const retryContact = state.contacts.find((item) => item.id === already.contactId);
      if (!retryProduct || !retryContact) {
        sendJson(res, 200, { received: true, duplicate: already.id, skipped: "contact/product not found at retry" });
        return;
      }
      let retryEmailStatus = "pending";
      let retryEmailId = null;
      let retryEmailError = null;
      let retryDeliveredAt = null;
      try {
        const email = await sendAccessEmail({
          customerName: retryContact.name,
          customerEmail: retryContact.email,
          product: retryProduct,
          url: accessUrlFor(req, already.accessToken),
          orderId: already.id,
          // deliveryKey="initial" -> same Resend key as original attempt
        });
        retryEmailStatus = email.sent ? "sent" : "not_configured";
        retryEmailId = email.id || null;
        retryDeliveredAt = email.sent ? new Date().toISOString() : null;
      } catch (err) {
        retryEmailStatus = "failed";
        retryEmailError = err.message;
      }
      // If RPC fails again -> throw -> outer catch -> 500 -> Stripe retries.
      await updateOrderEmailStatus(userId, {
        orderId: already.id,
        emailStatus: retryEmailStatus,
        emailId: retryEmailId,
        emailError: retryEmailError,
        deliveredAt: retryDeliveredAt,
      });
      sendJson(res, 200, { received: true, retried: already.id, emailStatus: retryEmailStatus });
      return;
    }

    const product = state.products.find((item) => item.id === productId);
    if (!product) {
      sendJson(res, 200, { received: true, skipped: "produit introuvable" });
      return;
    }

    const amount = Math.round(Number(session.amount_total || 0)) / 100;
    const now = new Date();

    let contact = state.contacts.find((item) => (item.email || "").toLowerCase() === customerEmail.toLowerCase());
    if (!contact) {
      contact = {
        id: `c_${randomBytes(6).toString("hex")}`,
        name: customerName,
        email: customerEmail,
        segment: "Client",
        activity: "Achat via boutique",
        value: 0,
        joined: frDate(now),
      };
      state.contacts.unshift(contact);
    }
    contact.segment = "Client";
    contact.value = Number(contact.value || 0) + amount;
    contact.activity = `Achat - ${product.title}`;

    const order = {
      id: `EXP-${randomBytes(3).toString("hex").toUpperCase()}`,
      contactId: contact.id,
      productId: product.id,
      date: frDate(now),
      amount,
      status: "paid",
      stripeSessionId: session.id,
      accessToken: makeAccessToken(slug),
      createdAt: now.toISOString(),
    };

    state.analytics.purchases = Number(state.analytics.purchases || 0) + 1;
    product.sales = Number(product.sales || 0) + 1;
    const revenueSeries = Array.isArray(state.analytics.revenueSeries)
      ? state.analytics.revenueSeries
      : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const currentRevenueIndex = Math.max(revenueSeries.length - 1, 0);
    revenueSeries[currentRevenueIndex] = Number(revenueSeries[currentRevenueIndex] || 0) + amount;
    state.analytics.revenueSeries = revenueSeries;

    // Step 1: persist order with emailStatus=pending (single CAS write).
    order.emailStatus = "pending";
    state.orders.unshift(order);
    await saveCreatorState(userId, state);

    // Step 2: send email with stable idempotency key (orderId + "initial").
    let emailStatus = "pending";
    let emailId = null;
    let emailError = null;
    let deliveredAt = null;
    try {
      const email = await sendAccessEmail({
        customerName: contact.name,
        customerEmail: contact.email,
        product,
        url: accessUrlFor(req, order.accessToken),
        orderId: order.id,
      });
      emailStatus = email.sent ? "sent" : "not_configured";
      emailId = email.id || null;
      deliveredAt = email.sent ? now.toISOString() : null;
    } catch (err) {
      emailStatus = "failed";
      emailError = err.message;
    }

    // Step 3: update email status via atomic SQL RPC.
    // RPC increments state.revision -> stale client cannot overwrite this patch.
    // If RPC fails -> throws -> outer catch -> 500 -> Stripe retries.
    // On retry the duplicate+pending branch resends with the same Resend idempotency key.
    await updateOrderEmailStatus(userId, { orderId: order.id, emailStatus, emailId, emailError, deliveredAt });

    await sendPlausibleEvent(req, {
      name: "Purchase",
      url: `https://${req.headers.host}/b/${encodeURIComponent(slug)}`,
      props: { store_slug: slug, product_id: product.id, order_id: order.id, source: session.metadata?.source || "store" },
      revenue: { currency: String(session.currency || "eur").toUpperCase(), amount },
    });
    sendJson(res, 200, { received: true, orderId: order.id, emailStatus });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "Erreur interne." });
  }
}

import { requireActiveSubscription, sendJson, userFromRequest } from "./_shared.js";

function appOrigin(req) {
  if (process.env.APP_URL?.startsWith("http")) return new URL(process.env.APP_URL).origin;
  return `https://${req.headers.host}`;
}

async function stripeGet(path) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
  });
  return { ok: response.ok, data: await response.json().catch(() => ({})) };
}

async function findCustomerId(user) {
  const fromMeta = user.app_metadata?.stripe_customer_id;
  if (fromMeta) return fromMeta;
  if (!user.email) return null;
  const customers = await stripeGet(`/customers?email=${encodeURIComponent(user.email)}&limit=1`);
  return customers.ok ? customers.data?.data?.[0]?.id || null : null;
}

// POST /api/billing-portal -> { url } : ouvre le portail Stripe de gestion d'abonnement.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    const user = await userFromRequest(req);
    await requireActiveSubscription(user.id);

    if (!process.env.STRIPE_SECRET_KEY) {
      sendJson(res, 503, { error: "Stripe n'est pas configuré." });
      return;
    }
    const customerId = await findCustomerId(user);
    if (!customerId) {
      sendJson(res, 404, { error: "Aucun client Stripe associé à ce compte." });
      return;
    }

    const form = new URLSearchParams({
      customer: customerId,
      return_url: `${appOrigin(req)}/#settings`,
    });
    const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
    const session = await response.json();
    if (!response.ok || !session.url) {
      sendJson(res, 502, { error: session?.error?.message || "Portail Stripe indisponible." });
      return;
    }
    sendJson(res, 200, { url: session.url });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "Erreur interne." });
  }
}

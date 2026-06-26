import { readCreatorStateBySlug, sendJson } from "./_shared.js";

function appOrigin(req) {
  if (process.env.APP_URL?.startsWith("http")) return new URL(process.env.APP_URL).origin;
  return `https://${req.headers.host}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { productId, customerName, customerEmail, creatorSlug } = req.body || {};
    const state = await readCreatorStateBySlug(creatorSlug);
    if (!state) {
      sendJson(res, 404, { error: "Boutique introuvable." });
      return;
    }
    const product = state.products.find((item) => item.id === productId && item.status === "published");
    if (!product) {
      sendJson(res, 404, { error: "Produit indisponible." });
      return;
    }

    if (!Number(product.price)) {
      sendJson(res, 200, { free: true, accessUrl: product.fileName || `/b/${state.profile.slug}` });
      return;
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      sendJson(res, 503, { error: "Stripe n'est pas configure." });
      return;
    }

    const origin = appOrigin(req);
    const form = new URLSearchParams({
      mode: "payment",
      success_url: `${origin}/success.html?store=${encodeURIComponent(state.profile.slug)}`,
      cancel_url: `${origin}/b/${encodeURIComponent(state.profile.slug)}?payment=cancelled`,
      locale: "fr",
      customer_email: String(customerEmail || "").slice(0, 180),
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "eur",
      "line_items[0][price_data][unit_amount]": String(Math.round(Number(product.price) * 100)),
      "line_items[0][price_data][product_data][name]": product.title,
      "line_items[0][price_data][product_data][description]": product.description || product.type || "Produit Expertly",
      "metadata[creator_slug]": state.profile.slug,
      "metadata[product_id]": product.id,
      "metadata[customer_name]": String(customerName || "").slice(0, 120),
    });

    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
    const session = await stripeResponse.json();
    if (!stripeResponse.ok || !session.url) {
      sendJson(res, 502, { error: session?.error?.message || "Stripe n'a pas pu creer le paiement." });
      return;
    }
    sendJson(res, 200, { url: session.url });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "Erreur interne." });
  }
}

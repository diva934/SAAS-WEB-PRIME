const { appOrigin, cleanAffiliateRef, plans, readJson, sendJson } = require("./_shared");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { plan: planId, affiliateRef, visitorId } = await readJson(req);
    const plan = plans[planId];
    if (!plan) {
      sendJson(res, 400, { error: "Formule inconnue." });
      return;
    }
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      sendJson(res, 503, { error: "Stripe n'est pas configure." });
      return;
    }

    const origin = appOrigin(req);
    const affiliateSlug = cleanAffiliateRef(affiliateRef);
    const form = new URLSearchParams({
      mode: "subscription",
      success_url: `${origin}/api/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/index.html?payment=cancelled#pricing`,
      locale: "fr",
      billing_address_collection: "required",
      allow_promotion_codes: "true",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "eur",
      "line_items[0][price_data][unit_amount]": String(plan.amount),
      "line_items[0][price_data][recurring][interval]": "month",
      "line_items[0][price_data][product_data][name]": plan.name,
      "line_items[0][price_data][product_data][description]": plan.description,
      "metadata[offerlab_plan]": planId,
      "metadata[affiliate_ref]": affiliateSlug,
      "metadata[visitor_id]": String(visitorId || "").slice(0, 80),
      "subscription_data[metadata][offerlab_plan]": planId,
      "subscription_data[metadata][affiliate_ref]": affiliateSlug,
      "subscription_data[metadata][visitor_id]": String(visitorId || "").slice(0, 80),
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
      sendJson(res, 502, { error: session?.error?.message || "Stripe n'a pas pu creer la page de paiement." });
      return;
    }
    sendJson(res, 200, { url: session.url });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Erreur interne du serveur." });
  }
};

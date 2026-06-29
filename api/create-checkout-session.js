import {
  appOrigin,
  ensureCreatorAccount,
  plans,
  publicError,
  readJson,
  sendJson,
  stripeRequest,
} from "./_shared.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { plan: planId, email, password, firstName } = await readJson(req);
    const plan = plans[planId];
    if (!plan) {
      sendJson(res, 400, { error: "Formule inconnue." });
      return;
    }

    const account = await ensureCreatorAccount({ email, password, firstName });
    const origin = appOrigin(req);
    const form = new URLSearchParams({
      mode: "subscription",
      success_url: `${origin}/api/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?payment=cancelled#pricing`,
      locale: "fr",
      customer_email: account.email,
      client_reference_id: account.user.id,
      billing_address_collection: "required",
      allow_promotion_codes: "true",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "eur",
      "line_items[0][price_data][unit_amount]": String(plan.amount),
      "line_items[0][price_data][recurring][interval]": "month",
      "line_items[0][price_data][product_data][name]": plan.name,
      "line_items[0][price_data][product_data][description]": plan.description,
      "metadata[user_id]": account.user.id,
      "metadata[expertly_plan]": planId,
      "metadata[first_name]": account.firstName,
      "subscription_data[metadata][user_id]": account.user.id,
      "subscription_data[metadata][expertly_plan]": planId,
      "subscription_data[trial_period_days]": "14",
    });

    const session = await stripeRequest("/checkout/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    sendJson(res, 200, { url: session.url });
  } catch (error) {
    const result = publicError(error);
    sendJson(res, result.status, { error: result.message });
  }
}

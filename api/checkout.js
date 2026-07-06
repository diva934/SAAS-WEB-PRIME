import { assertRateLimit, makeAccessToken, readCreatorRecordBySlug, saveCreatorState, sendAccessEmail, sendJson, supabaseRequest } from "./_shared.js";

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
    await assertRateLimit(req, "store-checkout", 12, 10 * 60_000);
    const { productId, customerName, customerEmail, creatorSlug, distinctId, salesPageSlug, source } = req.body || {};
    const cleanEmail = String(customerEmail || "").trim().toLowerCase().slice(0, 180);
    const cleanName = String(customerName || "").trim().slice(0, 120);
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      sendJson(res, 400, { error: "Adresse email invalide." });
      return;
    }
    const record = await readCreatorRecordBySlug(creatorSlug);
    if (!record) {
      sendJson(res, 404, { error: "Boutique introuvable." });
      return;
    }
    const { userId, state } = record;
    const product = state.products.find((item) => item.id === productId && item.status === "published");
    if (!product) {
      sendJson(res, 404, { error: "Produit indisponible." });
      return;
    }

    if (!Number(product.price)) {
      // Produit gratuit : créer un lead + enregistrer l'accès
      const accessToken = makeAccessToken(state.profile.slug);
      const contactId = `c_${Date.now()}`;
      const existing = state.contacts.find((c) => c.email?.toLowerCase() === cleanEmail);
      const contact = existing || {
        id: contactId,
        name: cleanName || "Lead",
        email: cleanEmail,
        segment: "Lead",
        activity: "Ressource gratuite obtenue",
        value: 0,
        joined: new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
        tags: [],
        buyingScore: 10,
      };
      if (!existing) state.contacts.push(contact);
      const order = {
        id: `ORD-${Date.now()}`,
        contactId: contact.id,
        productId: product.id,
        amount: 0,
        date: new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
        status: "paid",
        accessToken,
        emailStatus: "pending",
        source: source || "store",
      };
      state.orders.unshift(order);
      state.analytics.leads = (state.analytics.leads || 0) + 1;
      product.sales = (product.sales || 0) + 1;
      const accessUrl = `${appOrigin(req)}/access.html?token=${encodeURIComponent(accessToken)}`;
      const savedState = await saveCreatorState(userId, state);
      const savedOrder = savedState.orders.find((item) => item.id === order.id);
      try {
        const emailResult = await sendAccessEmail({ customerName: cleanName || "Client", customerEmail: cleanEmail, product, url: accessUrl, orderId: order.id });
        if (savedOrder) savedOrder.emailStatus = emailResult.sent ? "sent" : "not_configured";
      } catch (error) {
        if (savedOrder) {
          savedOrder.emailStatus = "failed";
          savedOrder.emailError = error.message;
        }
      }
      if (savedOrder) await saveCreatorState(userId, savedState).catch(() => {});
      sendJson(res, 200, { free: true, accessUrl });
      return;
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      sendJson(res, 503, { error: "Stripe n'est pas configure." });
      return;
    }

    const paymentRows = await supabaseRequest(
      `/rest/v1/creator_payments?select=stripe_account_id,charges_enabled&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    );
    const payment = paymentRows?.[0];
    if (!payment?.stripe_account_id || !payment.charges_enabled) {
      sendJson(res, 409, { error: "Le créateur doit terminer la connexion de son compte Stripe avant de vendre." });
      return;
    }
    const subscriptions = await supabaseRequest(
      `/rest/v1/subscriptions?select=plan&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&limit=1`,
    );
    const platformFee = subscriptions?.[0]?.plan === "launch" ? Math.round(Number(product.price) * 100 * 0.03) : 0;

    const origin = appOrigin(req);
    const form = new URLSearchParams({
      mode: "payment",
      success_url: `${origin}/success.html?store=${encodeURIComponent(state.profile.slug)}`,
      cancel_url: `${origin}/b/${encodeURIComponent(state.profile.slug)}?payment=cancelled`,
      locale: "fr",
      customer_email: cleanEmail,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "eur",
      "line_items[0][price_data][unit_amount]": String(Math.round(Number(product.price) * 100)),
      "line_items[0][price_data][product_data][name]": product.title,
      "line_items[0][price_data][product_data][description]": product.description || product.type || "Produit Expertly",
      "metadata[creator_slug]": state.profile.slug,
      "metadata[product_id]": product.id,
      "metadata[customer_name]": cleanName,
      "metadata[sales_page_slug]": String(salesPageSlug || ""),
      "metadata[source]": String(source || "store"),
      ...(platformFee ? { "payment_intent_data[application_fee_amount]": String(platformFee) } : {}),
    });

    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Stripe-Account": payment.stripe_account_id,
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

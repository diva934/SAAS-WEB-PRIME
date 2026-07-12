import { commissionRateForPlan, getActiveSubscription, makeAccessToken, readCreatorRecordBySlug, readCreatorStateBySlug, saveCreatorState, sendAccessEmail, sendJson } from "./_shared.js";

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
    const { productId, customerName, customerEmail, creatorSlug, distinctId, salesPageSlug, source } = req.body || {};
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
      const existing = state.contacts.find((c) => c.email?.toLowerCase() === customerEmail?.toLowerCase());
      const contact = existing || {
        id: contactId,
        name: customerName || "Lead",
        email: customerEmail || "",
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
      const emailResult = await sendAccessEmail({ customerName: customerName || "Client", customerEmail, product, url: accessUrl, orderId: order.id });
      order.emailStatus = emailResult.sent ? "sent" : "not_configured";
      await saveCreatorState(userId, state);
      sendJson(res, 200, { free: true, accessUrl });
      return;
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      sendJson(res, 503, { error: "Stripe n'est pas configure." });
      return;
    }

    // Compte Stripe connecte du createur : si l'onboarding est termine (charges_enabled),
    // les fonds sont transferes directement sur SON compte (destination charge). La session
    // reste creee sur la plateforme -> le webhook de livraison actuel fonctionne inchange.
    const connect = state.profile?.stripeConnect;
    const destinationAcct = connect?.accountId && connect?.chargesEnabled ? connect.accountId : null;

    const unitAmount = Math.round(Number(product.price) * 100);

    // Commission plateforme : on preleve un pourcentage selon la formule du CREATEUR
    // (Launch = 3 %). On lit sa formule au moment de la vente ; en cas de doute -> 0 %.
    let applicationFeeAmount = 0;
    if (destinationAcct) {
      try {
        const sub = await getActiveSubscription(userId);
        const rate = commissionRateForPlan(sub?.plan);
        if (rate > 0) applicationFeeAmount = Math.round(unitAmount * rate);
      } catch {
        // en cas d'erreur de lecture de l'abonnement : pas de commission (securite cote createur).
      }
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
      "line_items[0][price_data][unit_amount]": String(unitAmount),
      "line_items[0][price_data][product_data][name]": product.title,
      "line_items[0][price_data][product_data][description]": product.description || product.type || "Produit Expertly",
      "metadata[creator_slug]": state.profile.slug,
      "metadata[product_id]": product.id,
      "metadata[customer_name]": String(customerName || "").slice(0, 120),
      "metadata[sales_page_slug]": String(salesPageSlug || ""),
      "metadata[source]": String(source || "store"),
    });

    if (destinationAcct) {
      form.set("payment_intent_data[transfer_data][destination]", destinationAcct);
      // Commission plateforme (ex. Launch 3 %) : prelevee automatiquement par Stripe,
      // le reste va sur le compte connecte du createur.
      if (applicationFeeAmount > 0) {
        form.set("payment_intent_data[application_fee_amount]", String(applicationFeeAmount));
      }
    }

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

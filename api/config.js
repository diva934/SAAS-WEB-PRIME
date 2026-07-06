import { appOrigin, requireActiveSubscription, sendJson, supabaseRequest, userFromRequest } from "./_shared.js";

async function stripeRequest(path, options = {}) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(options.headers || {}),
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "Stripe Connect est indisponible.");
  return data;
}

async function paymentRecord(userId) {
  const rows = await supabaseRequest(
    `/rest/v1/creator_payments?select=stripe_account_id,charges_enabled,details_submitted&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
  );
  return rows?.[0] || null;
}

async function savePaymentRecord(userId, account) {
  await supabaseRequest("/rest/v1/creator_payments?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{
      user_id: userId,
      stripe_account_id: account.id,
      charges_enabled: Boolean(account.charges_enabled),
      details_submitted: Boolean(account.details_submitted),
      updated_at: new Date().toISOString(),
    }]),
  });
}

export default async function handler(req, res) {
  if (req.method === "POST") {
    try {
      if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe n'est pas configuré.");
      const user = await userFromRequest(req);
      await requireActiveSubscription(user.id);
      let record = await paymentRecord(user.id);
      let account;
      if (record?.stripe_account_id) {
        account = await stripeRequest(`/accounts/${encodeURIComponent(record.stripe_account_id)}`);
      } else {
        const form = new URLSearchParams({
          type: "express",
          country: "FR",
          email: user.email || "",
          "capabilities[card_payments][requested]": "true",
          "capabilities[transfers][requested]": "true",
          "metadata[expertly_user_id]": user.id,
        });
        account = await stripeRequest("/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form,
        });
      }
      await savePaymentRecord(user.id, account);
      if (account.charges_enabled && account.details_submitted) {
        const login = await stripeRequest(`/accounts/${encodeURIComponent(account.id)}/login_links`, {
          method: "POST",
        });
        sendJson(res, 200, { url: login.url });
        return;
      }
      const origin = appOrigin(req);
      const link = await stripeRequest("/account_links", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          account: account.id,
          refresh_url: `${origin}/?stripe=refresh`,
          return_url: `${origin}/?stripe=connected`,
          type: "account_onboarding",
        }),
      });
      sendJson(res, 200, { url: link.url });
    } catch (error) {
      sendJson(res, error.status || 500, { error: error.message || "Stripe Connect est indisponible." });
    }
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  let stripeConnected = false;
  if (req.headers.authorization && process.env.STRIPE_SECRET_KEY) {
    try {
      const user = await userFromRequest(req);
      const record = await paymentRecord(user.id);
      if (record?.stripe_account_id) {
        const account = await stripeRequest(`/accounts/${encodeURIComponent(record.stripe_account_id)}`);
        stripeConnected = Boolean(account.charges_enabled && account.details_submitted);
        await savePaymentRecord(user.id, account);
      }
    } catch {
      stripeConnected = false;
    }
  }

  sendJson(res, 200, {
    stripe: stripeConnected,
    stripePlatform: Boolean(process.env.STRIPE_SECRET_KEY),
    stripeWebhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    email: Boolean(process.env.RESEND_API_KEY),
    plausible: {
      enabled: Boolean(process.env.PLAUSIBLE_DOMAIN),
      domain: process.env.PLAUSIBLE_DOMAIN || "",
    },
    umami: {
      enabled: false,
      websiteId: null,
      hostUrl: "",
      boutiqueSlug: "",
    },
    // Config publique (ex-/api/public-config, fusionnee ici pour rester sous la limite
    // de 12 fonctions serverless du plan Hobby).
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
    marketingUrl: process.env.MARKETING_URL || "https://saas-web-prime.vercel.app",
  });
}

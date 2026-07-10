import {
  appOrigin,
  readCreatorState,
  requireActiveSubscription,
  saveCreatorState,
  sendJson,
  userFromRequest,
} from "./_shared.js";

// Appel Stripe minimal (form-encoded). GET si pas de params, POST sinon.
async function stripeApi(path, params) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    const e = new Error("Stripe n'est pas configuré.");
    e.status = 503;
    throw e;
  }
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: params ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const e = new Error(data?.error?.message || "Erreur Stripe.");
    e.status = 502;
    throw e;
  }
  return data;
}

function connectSummary(state) {
  const c = (state.profile && state.profile.stripeConnect) || {};
  return {
    connected: Boolean(c.accountId),
    chargesEnabled: Boolean(c.chargesEnabled),
    detailsSubmitted: Boolean(c.detailsSubmitted),
    payoutsEnabled: Boolean(c.payoutsEnabled),
  };
}

// Relit le compte connecte chez Stripe et met a jour les indicateurs dans le state.
async function refreshConnect(userId, state) {
  const acct = state.profile?.stripeConnect?.accountId;
  if (!acct) return;
  const account = await stripeApi(`accounts/${encodeURIComponent(acct)}`);
  state.profile.stripeConnect = {
    ...(state.profile.stripeConnect || {}),
    accountId: acct,
    chargesEnabled: Boolean(account.charges_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    payoutsEnabled: Boolean(account.payouts_enabled),
    updatedAt: new Date().toISOString(),
  };
  await saveCreatorState(userId, state);
}

export default async function handler(req, res) {
  try {
    const user = await userFromRequest(req);
    await requireActiveSubscription(user.id);

    if (req.method === "GET") {
      sendJson(res, 200, await readCreatorState(user.id));
      return;
    }

    if (req.method === "PUT") {
      const saved = await saveCreatorState(user.id, req.body || {});
      sendJson(res, 200, { saved: true, state: saved });
      return;
    }

    if (req.method === "POST") {
      const action = (req.body && req.body.action) || "";

      // Statut du compte Stripe connecte du createur (rafraichi depuis Stripe).
      if (action === "connect-status") {
        const state = await readCreatorState(user.id);
        try {
          await refreshConnect(user.id, state);
        } catch {
          /* on renvoie le dernier statut connu si Stripe ne repond pas */
        }
        sendJson(res, 200, connectSummary(state));
        return;
      }

      // Cree (si besoin) le compte Standard connecte + un lien d'onboarding Stripe.
      if (action === "connect-onboard") {
        const state = await readCreatorState(user.id);
        let acct = state.profile?.stripeConnect?.accountId;
        if (!acct) {
          const account = await stripeApi("accounts", {
            type: "standard",
            email: user.email || "",
            "business_profile[url]": `${appOrigin(req)}/b/${encodeURIComponent(state.profile.slug)}`,
            "metadata[creator_slug]": state.profile.slug,
            "metadata[user_id]": user.id,
          });
          acct = account.id;
          state.profile.stripeConnect = {
            accountId: acct,
            chargesEnabled: false,
            detailsSubmitted: false,
            payoutsEnabled: false,
            createdAt: new Date().toISOString(),
          };
          await saveCreatorState(user.id, state);
        }
        const origin = appOrigin(req);
        const link = await stripeApi("account_links", {
          account: acct,
          type: "account_onboarding",
          refresh_url: `${origin}/app?connect=refresh`,
          return_url: `${origin}/app?connect=done`,
        });
        sendJson(res, 200, { url: link.url });
        return;
      }

      sendJson(res, 400, { error: "Action inconnue." });
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "Erreur interne." });
  }
}

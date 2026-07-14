import { createHash } from "crypto";
import {
  appOrigin,
  limitsForPlan,
  readCreatorState,
  requireActiveSubscription,
  saveCreatorState,
  sendJson,
  supabaseRequest,
  userFromRequest,
} from "./_shared.js";

// Lit UNIQUEMENT la date de derniere modification (quelques octets), pas tout l'etat.
// L'etat complet contient les images en base64 (~centaines de Ko) : le relire a chaque
// sondage du CRM faisait exploser l'egress Supabase, meme quand on repondait 304.
async function readStateStamp(userId) {
  try {
    const rows = await supabaseRequest(
      `/rest/v1/creator_states?select=updated_at&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    );
    if (Array.isArray(rows) && rows[0] && rows[0].updated_at) return String(rows[0].updated_at);
  } catch {
    // En cas d'echec on renvoie null : on retombe sur la lecture complete (comportement d'origine).
  }
  return null;
}

// Applique les limites de la formule au state entrant AVANT sauvegarde.
// - Plafond de produits (Launch = 5) : bloque l'ajout au-dela, mais laisse
//   sauvegarder un compte qui aurait deja plus (ex. retrogradation) tant qu'il
//   n'augmente pas son nombre de produits.
// - Fonctionnalites reservees (emails automatises...) : desactivees pour Launch.
function enforcePlanLimits(incoming, current, limits) {
  const next = incoming || {};
  const products = Array.isArray(next.products) ? next.products : [];
  const currentCount = Array.isArray(current?.products) ? current.products.length : 0;

  if (limits.maxProducts != null && products.length > limits.maxProducts && products.length > currentCount) {
    const e = new Error(
      `Ta formule ${limits.label} est limitee a ${limits.maxProducts} produits. Passe a une formule superieure pour en ajouter davantage.`,
    );
    e.status = 403;
    e.code = "plan_product_limit";
    throw e;
  }

  // Automatisation d'emails reservee aux formules superieures : on force l'etat inactif.
  if (!limits.emailAutomation && Array.isArray(next.emails)) {
    next.emails = next.emails.map((em) => (em && em.active ? { ...em, active: false } : em));
  }

  return next;
}

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
    const subscription = await requireActiveSubscription(user.id);
    const limits = limitsForPlan(subscription?.plan);

    if (req.method === "GET") {
      // Reponse conditionnelle (ETag). Le CRM sonde cet endpoint en continu.
      // On calcule d'abord l'ETag a partir de la seule date de modification :
      // si rien n'a change, on repond 304 SANS jamais lire l'etat complet.
      // -> economise l'egress Vercel ET l'egress Supabase.
      res.setHeader("Cache-Control", "no-store");
      const stamp = await readStateStamp(user.id);
      if (stamp) {
        const etag = '"' + createHash("sha1").update("v2:" + user.id + ":" + stamp).digest("hex") + '"';
        res.setHeader("ETag", etag);
        if (req.headers["if-none-match"] === etag) {
          res.status(304).end();
          return;
        }
        const current = await readCreatorState(user.id);
        sendJson(res, 200, current);
        return;
      }
      // Pas d'horodatage exploitable : on garde le comportement d'origine.
      const current = await readCreatorState(user.id);
      const etag = '"' + createHash("sha1").update(JSON.stringify(current)).digest("hex") + '"';
      res.setHeader("ETag", etag);
      if (req.headers["if-none-match"] === etag) {
        res.status(304).end();
        return;
      }
      sendJson(res, 200, current);
      return;
    }

    if (req.method === "PUT") {
      const current = await readCreatorState(user.id);
      const guarded = enforcePlanLimits(req.body || {}, current, limits);
      const saved = await saveCreatorState(user.id, guarded);
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

import {
  appOrigin,
  limitsForPlan,
  requireActiveSubscription,
  sendJson,
  supabaseRequest,
  userFromRequest,
} from "./_shared.js";

// Formules disponibles (montants en centimes, mensuel EUR).
const PLANS = {
  launch: { name: "Lancement", amount: 1900, description: "Boutique, CRM et tunnels pour demarrer." },
  scale: { name: "Croissance", amount: 4900, description: "Produits illimites, emails automatises et IA." },
  studio: { name: "Studio", amount: 14900, description: "Tout Croissance + domaine et priorite support." },
};

// Affiliation influenceurs : commission versee UNE FOIS sur le 1er paiement d'un client.
// Suivi + paiement manuel (aucune base : Stripe est la source de verite via les metadonnees).
const ADMIN_EMAIL = "unknown35225+admin@gmail.com";
const AFFILIATE_RATE = 0.20;

// Cree une session Stripe Checkout (abonnement + essai) pour l'utilisateur connecte.
async function createTrialCheckout({ user, planId, origin }) {
  const plan = PLANS[planId];
  if (!plan) { const e = new Error("Formule inconnue."); e.status = 400; throw e; }
  const form = new URLSearchParams({
    mode: "subscription",
    success_url: `${origin}/app?trial=started`,
    cancel_url: `${origin}/app?trial=cancelled`,
    locale: "fr",
    customer_email: user.email || "",
    client_reference_id: user.id,
    billing_address_collection: "required",
    allow_promotion_codes: "true",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(plan.amount),
    "line_items[0][price_data][recurring][interval]": "month",
    "line_items[0][price_data][product_data][name]": `Expertly ${plan.name}`,
    "line_items[0][price_data][product_data][description]": plan.description,
    "metadata[user_id]": user.id,
    "metadata[expertly_plan]": planId,
    "subscription_data[metadata][user_id]": user.id,
    "subscription_data[metadata][expertly_plan]": planId,
    "subscription_data[trial_period_days]": "14",
  });
  // Attribution influenceur : reportee dans les metadonnees de l'abonnement Stripe.
  const ref = (user.user_metadata && user.user_metadata.referral_code) || "";
  if (ref) {
    form.set("metadata[referral_code]", ref);
    form.set("subscription_data[metadata][referral_code]", ref);
  }
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const e = new Error(data?.error?.message || "Erreur Stripe."); e.status = 502; throw e; }
  return data.url;
}

// Retrouve un compte par son email (API admin GoTrue). Renvoie null si introuvable.
async function findUserByEmail(email) {
  const target = String(email || "").trim().toLowerCase();
  if (!target) return null;
  for (let page = 1; page <= 10; page += 1) {
    const data = await supabaseRequest(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const users = (data && Array.isArray(data.users)) ? data.users : (Array.isArray(data) ? data : []);
    if (!users.length) return null;
    const hit = users.find((u) => String(u.email || "").toLowerCase() === target);
    if (hit) return hit;
    if (users.length < 200) return null;
  }
  return null;
}

// Upsert (insert si absent) de l'état d'abonnement — robuste même si aucune
// ligne n'existe encore pour ce créateur.
async function upsertStatus(userId, status, plan) {
  await supabaseRequest(`/rest/v1/subscriptions?on_conflict=user_id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ user_id: userId, status, plan: plan || "scale" }]),
  });
}

// Mémorise la liaison Stripe sur le compte pour accélérer les prochaines vérifs.
async function saveBillingMetadata(userId, { plan, subscriptionId, customerId }) {
  await supabaseRequest(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    body: JSON.stringify({
      app_metadata: {
        expertly_plan: plan,
        stripe_subscription_id: subscriptionId,
        stripe_customer_id: customerId || "",
      },
    }),
  });
}

async function stripeGet(path) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
  });
  return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) };
}

function planFromSubscription(sub, fallback = "scale") {
  return (
    sub?.metadata?.expertly_plan ||
    sub?.items?.data?.[0]?.price?.metadata?.expertly_plan ||
    fallback
  );
}

// Réconciliation : retrouve un abonnement Stripe actif pour cet email, même si
// le redirect post-paiement et le webhook ont échoué. C'est ce qui garantit
// l'activation automatique pour tout client réellement payant.
async function findActiveStripeByEmail(email) {
  if (!email) return null;
  const customers = await stripeGet(`/customers?email=${encodeURIComponent(email)}&limit=10`);
  if (!customers.ok || !Array.isArray(customers.data?.data)) return null;
  for (const customer of customers.data.data) {
    const subs = await stripeGet(`/subscriptions?customer=${encodeURIComponent(customer.id)}&status=all&limit=10`);
    if (!subs.ok) continue;
    const active = (subs.data?.data || []).find((sub) => ["active", "trialing"].includes(sub.status));
    if (active) {
      return { customerId: customer.id, subscriptionId: active.id, plan: planFromSubscription(active) };
    }
  }
  return null;
}

// Construit le rapport d'affiliation : chaque abonnement portant un referral_code,
// avec la commission (20% du 1er paiement) et si elle est deja "gagnee" (1er paiement passe).
async function affiliateReport() {
  const res = await stripeGet("/subscriptions?status=all&limit=100&expand[]=data.customer");
  if (!res.ok || !Array.isArray(res.data && res.data.data)) return [];
  const rows = [];
  for (const sub of res.data.data) {
    const code = sub.metadata && sub.metadata.referral_code;
    if (!code) continue;
    const item = sub.items && sub.items.data && sub.items.data[0];
    const amount = item && item.price ? (Number(item.price.unit_amount) || 0) : 0;
    const plan = (sub.metadata && sub.metadata.expertly_plan) || "";
    const earned = ["active", "past_due", "unpaid"].includes(sub.status); // 1er paiement encaisse (hors essai)
    const email = (sub.customer && typeof sub.customer === "object" && sub.customer.email) || "";
    rows.push({
      code: String(code),
      email: email,
      plan: plan,
      status: sub.status,
      firstPaymentCents: amount,
      commissionCents: Math.round(amount * AFFILIATE_RATE),
      earned: earned
    });
  }
  return rows;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const user = await userFromRequest(req);

    // POST : demarrage d'un essai payant (checkout Stripe) directement depuis le CRM.
    if (req.method === "POST") {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const action = body.action || "";
      // Acces de test offert (reserve a l'admin). Aucune trace cote Stripe :
      // on marque le plan en base et on note "offert" dans les metadonnees du compte,
      // pour pouvoir distinguer plus tard un acces offert d'un vrai client payant.
      if (action === "grant-test-access") {
        if (String(user.email || "").toLowerCase() !== ADMIN_EMAIL) {
          sendJson(res, 403, { error: "Acces reserve." });
          return;
        }
        const email = String(body.email || "").trim();
        const plan = ["launch", "scale", "studio"].includes(String(body.plan || "")) ? String(body.plan) : "studio";
        if (!email) { sendJson(res, 400, { error: "Email requis." }); return; }
        const target = await findUserByEmail(email);
        if (!target) {
          sendJson(res, 404, { error: "Aucun compte avec cet email. Il doit d'abord s'inscrire sur /inscription." });
          return;
        }
        await upsertStatus(target.id, "active", plan);
        try {
          await supabaseRequest(`/auth/v1/admin/users/${encodeURIComponent(target.id)}`, {
            method: "PUT",
            body: JSON.stringify({ app_metadata: { expertly_plan: plan, comp_access: true, comp_granted_at: new Date().toISOString() } }),
          });
        } catch { /* le marquage est un confort, pas un bloquant */ }
        sendJson(res, 200, { granted: true, email: target.email, userId: target.id, plan });
        return;
      }

      // Rapport d'affiliation (reserve a l'admin).
      if (action === "affiliate-report") {
        if (String(user.email || "").toLowerCase() !== ADMIN_EMAIL) {
          sendJson(res, 403, { error: "Acces reserve." });
          return;
        }
        if (!process.env.STRIPE_SECRET_KEY) { sendJson(res, 503, { error: "Stripe non configure." }); return; }
        sendJson(res, 200, { rate: AFFILIATE_RATE, rows: await affiliateReport() });
        return;
      }
      if (action !== "start-trial") {
        sendJson(res, 400, { error: "Action inconnue." });
        return;
      }
      if (!process.env.STRIPE_SECRET_KEY) {
        sendJson(res, 503, { error: "Paiement non configure." });
        return;
      }
      // Deja abonne : inutile de relancer un essai, on le signale.
      try {
        await requireActiveSubscription(user.id);
        sendJson(res, 409, { error: "Ton abonnement est deja actif." });
        return;
      } catch { /* pas encore actif : on peut demarrer l'essai */ }
      const url = await createTrialCheckout({ user, planId: body.plan || "scale", origin: appOrigin(req) });
      sendJson(res, 200, { url });
      return;
    }

    const metadata = user.app_metadata || {};

    // 1. Déjà actif en base : réponse immédiate.
    try {
      const row = await requireActiveSubscription(user.id);
      const plan = metadata.expertly_plan || row?.plan || "";
      sendJson(res, 200, { active: true, plan, limits: limitsForPlan(plan) });
      return;
    } catch {
      // pas (encore) actif en base : on tente une réconciliation Stripe.
    }

    if (process.env.STRIPE_SECRET_KEY) {
      let found = null;

      // 2a. Via l'abonnement déjà lié au compte.
      if (metadata.stripe_subscription_id) {
        const sub = await stripeGet(`/subscriptions/${encodeURIComponent(metadata.stripe_subscription_id)}`);
        if (sub.ok && ["active", "trialing"].includes(sub.data?.status)) {
          found = {
            subscriptionId: sub.data.id,
            customerId: typeof sub.data.customer === "string" ? sub.data.customer : sub.data.customer?.id,
            plan: planFromSubscription(sub.data, metadata.expertly_plan || "scale"),
          };
        }
      }

      // 2b. Sinon, on cherche par email (auto-réparation : indépendant du webhook/redirect).
      if (!found) found = await findActiveStripeByEmail(user.email);

      if (found) {
        await upsertStatus(user.id, "active", found.plan);
        try {
          await saveBillingMetadata(user.id, found);
        } catch {
          // non bloquant : la ligne d'abonnement active suffit.
        }
        sendJson(res, 200, { active: true, plan: found.plan, limits: limitsForPlan(found.plan) });
        return;
      }
    }

    sendJson(res, 403, { active: false });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "Erreur interne." });
  }
}

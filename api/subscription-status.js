import {
  appOrigin,
  limitsForPlan,
  requireActiveSubscription,
  sendJson,
  upsertSubscription,
  userFromRequest,
} from "./_shared.js";
import { fsGet } from "./_firebase.js";

// Comptes administrateurs : acces Studio automatique, sans paiement.
const ADMIN_EMAILS = ["unknown35225@gmail.com"];
function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(String(email || "").trim().toLowerCase());
}

// Formules disponibles (montants en centimes, mensuel EUR).
const PLANS = {
  launch: { name: "Lancement", amount: 1900, description: "Boutique, CRM et tunnels pour demarrer." },
  scale: { name: "Croissance", amount: 4900, description: "Produits illimites, emails automatises et IA." },
  studio: { name: "Studio", amount: 14900, description: "Tout Croissance + domaine et priorite support." },
};

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

// Upsert (insert si absent) de l'état d'abonnement — robuste même si aucune
// ligne n'existe encore pour ce créateur.
async function upsertStatus(userId, status, plan) {
  await upsertSubscription(userId, { status, plan: plan || "scale" });
}

// Mémorise la liaison Stripe sur le compte pour accélérer les prochaines vérifs.
async function saveBillingMetadata(userId, { plan, subscriptionId, customerId }) {
  await upsertSubscription(userId, {
    plan,
    stripe_subscription_id: subscriptionId,
    stripe_customer_id: customerId || "",
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
      if ((body.action || "") !== "start-trial") {
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

    // Admin : acces Studio garanti, active automatiquement au premier passage.
    if (isAdminEmail(user.email)) {
      await upsertSubscription(user.id, { status: "active", plan: "studio", admin: true }).catch(() => {});
      sendJson(res, 200, { active: true, plan: "studio", admin: true, limits: limitsForPlan("studio") });
      return;
    }

    const metadata = (await fsGet(`subscriptions/${user.id}`).catch(() => null)) || {};

    // 1. Déjà actif en base : réponse immédiate.
    try {
      const row = await requireActiveSubscription(user.id);
      const plan = row?.plan || metadata.plan || "";
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
            plan: planFromSubscription(sub.data, metadata.plan || "scale"),
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

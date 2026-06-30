import {
  requireActiveSubscription,
  sendJson,
  supabaseRequest,
  userFromRequest,
} from "./_shared.js";

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

export default async function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const user = await userFromRequest(req);
    const metadata = user.app_metadata || {};

    // 1. Déjà actif en base : réponse immédiate.
    try {
      await requireActiveSubscription(user.id);
      sendJson(res, 200, { active: true, plan: metadata.expertly_plan || "" });
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
        sendJson(res, 200, { active: true, plan: found.plan });
        return;
      }
    }

    sendJson(res, 403, { active: false });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "Erreur interne." });
  }
}

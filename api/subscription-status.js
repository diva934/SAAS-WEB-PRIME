import {
  requireActiveSubscription,
  sendJson,
  supabaseRequest,
  userFromRequest,
} from "./_shared.js";

async function updateStoredStatus(userId, status, plan) {
  await supabaseRequest(`/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status, ...(plan ? { plan } : {}) }),
  });
}

async function stripeSubscription(subscriptionId) {
  const response = await fetch(
    `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } },
  );
  const data = await response.json();
  return { response, data };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const user = await userFromRequest(req);
    const metadata = user.app_metadata || {};
    const subscriptionId = metadata.stripe_subscription_id;

    if (subscriptionId && process.env.STRIPE_SECRET_KEY) {
      const { response, data } = await stripeSubscription(subscriptionId);
      if (response.ok) {
        const active = ["active", "trialing"].includes(data.status);
        const plan = data.metadata?.expertly_plan || metadata.expertly_plan || "";
        await updateStoredStatus(user.id, active ? "active" : "inactive", plan);
        sendJson(res, active ? 200 : 403, { active, plan });
        return;
      }

      if (response.status === 404) {
        await updateStoredStatus(user.id, "inactive", metadata.expertly_plan || "");
        sendJson(res, 403, { active: false });
        return;
      }
    }

    await requireActiveSubscription(user.id);
    sendJson(res, 200, { active: true, plan: metadata.expertly_plan || "" });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "Erreur interne." });
  }
}

import { crmOrigin, plans, saveCreatorBillingMetadata, saveSubscription, stripeRequest } from "./_shared.js";

export default async function handler(req, res) {
  const sessionId = String(req.query?.session_id || "");
  const marketingOrigin = process.env.APP_URL?.startsWith("http")
    ? new URL(process.env.APP_URL).origin
    : `https://${req.headers.host}`;

  try {
    if (!sessionId.startsWith("cs_")) throw new Error("Session Stripe invalide.");
    const session = await stripeRequest(`/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription`);
    const userId = session.client_reference_id || session.metadata?.user_id;
    const plan = session.metadata?.expertly_plan;
    const stripeSubscriptionId =
      typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    const stripeCustomerId = typeof session.customer === "string" ? session.customer : session.customer?.id;

    if (
      session.status !== "complete" ||
      session.payment_status !== "paid" ||
      !userId ||
      !plans[plan] ||
      !stripeSubscriptionId
    ) {
      throw new Error("Paiement non confirmé.");
    }

    await saveSubscription({ userId, plan, status: "active" });
    await saveCreatorBillingMetadata({ userId, plan, stripeSubscriptionId, stripeCustomerId });
    res.redirect(302, `${crmOrigin()}/?checkout=success`);
  } catch {
    res.redirect(302, `${marketingOrigin}/?payment=provisioning_error#pricing`);
  }
}

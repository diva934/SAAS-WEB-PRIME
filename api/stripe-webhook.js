import { randomBytes } from "crypto";
import {
  accessUrlFor,
  makeAccessToken,
  readCreatorRecordBySlug,
  saveCreatorState,
  sendAccessEmail,
  sendJson,
  supabaseRequest,
} from "./_shared.js";

/* ---------------------------------------------------------------------------
 * Cycle de vie des ABONNEMENTS (annulation, echec de prelevement, reprise).
 * Sans ca, un client qui annule ou dont la carte est refusee garderait son
 * acces indefiniment : la ligne `subscriptions` resterait "active" en base.
 * ------------------------------------------------------------------------- */

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.deleted",
  "customer.subscription.updated",
  "invoice.payment_failed",
  "invoice.payment_succeeded",
]);

async function stripeGet(path) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
  });
  return { ok: response.ok, data: await response.json().catch(() => ({})) };
}

// Retrouve le compte Expertly a partir de l'email du client Stripe.
async function findUserIdByEmail(email) {
  const target = String(email || "").trim().toLowerCase();
  if (!target) return null;
  for (let page = 1; page <= 10; page += 1) {
    const data = await supabaseRequest(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const users = (data && Array.isArray(data.users)) ? data.users : (Array.isArray(data) ? data : []);
    if (!users.length) return null;
    const hit = users.find((u) => String(u.email || "").toLowerCase() === target);
    if (hit) return hit.id;
    if (users.length < 200) return null;
  }
  return null;
}

function planOfSubscription(sub) {
  return (
    (sub && sub.metadata && sub.metadata.expertly_plan) ||
    (sub && sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price
      && sub.items.data[0].price.metadata && sub.items.data[0].price.metadata.expertly_plan) ||
    "scale"
  );
}

// Statut Stripe -> statut Expertly. Seuls "active" et "trialing" ouvrent l'acces.
function expertlyStatus(stripeStatus) {
  if (["active", "trialing"].includes(stripeStatus)) return "active";
  if (["past_due", "unpaid", "incomplete"].includes(stripeStatus)) return "past_due";
  return "canceled"; // canceled, incomplete_expired, paused...
}

// Relit l'abonnement chez Stripe (source de verite) et aligne la base.
async function syncSubscription(subscriptionId) {
  if (!subscriptionId) return { skipped: "pas d'abonnement dans l'event" };
  const sub = await stripeGet(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
  if (!sub.ok || !sub.data || !sub.data.id) return { skipped: "abonnement Stripe introuvable" };

  const customerId = typeof sub.data.customer === "string" ? sub.data.customer : (sub.data.customer && sub.data.customer.id);
  const customer = customerId ? await stripeGet(`/customers/${encodeURIComponent(customerId)}`) : { ok: false };
  const email = (customer.ok && customer.data && customer.data.email) || "";

  const userId = await findUserIdByEmail(email);
  if (!userId) return { skipped: "aucun compte Expertly pour " + (email || "(email absent)") };

  const status = expertlyStatus(sub.data.status);
  await supabaseRequest(`/rest/v1/subscriptions?on_conflict=user_id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ user_id: userId, status, plan: planOfSubscription(sub.data) }]),
  });
  console.log(`[stripe-webhook] abonnement ${subscriptionId} : Stripe=${sub.data.status} -> Expertly=${status} (user ${userId})`);
  return { userId, stripeStatus: sub.data.status, status };
}

// L'id d'abonnement se trouve a des endroits differents selon le type d'event.
function subscriptionIdFromEvent(event) {
  const obj = (event && event.data && event.data.object) || {};
  if (String(event.type || "").startsWith("customer.subscription.")) return obj.id || null;
  // invoice.* : ancien champ `subscription`, ou nouveau `parent.subscription_details.subscription`.
  return (
    obj.subscription ||
    (obj.parent && obj.parent.subscription_details && obj.parent.subscription_details.subscription) ||
    null
  );
}

function frDate(date) {
  return date.toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// POST /api/stripe-webhook — event Stripe checkout.session.completed.
// Authentifie l'event en relisant la session directement chez Stripe (pas besoin de
// STRIPE_WEBHOOK_SECRET ni du corps brut) : une session « paid » ne peut pas etre forgee.
// Idempotent via order.stripeSessionId. Cree contact + commande « paid » + envoie l'email.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    const event = req.body || {};

    // Cycle de vie des abonnements : annulation, echec de prelevement, reprise.
    if (SUBSCRIPTION_EVENTS.has(event.type)) {
      if (!process.env.STRIPE_SECRET_KEY) {
        sendJson(res, 503, { error: "Stripe n'est pas configuré." });
        return;
      }
      const result = await syncSubscription(subscriptionIdFromEvent(event));
      sendJson(res, 200, { received: true, type: event.type, ...result });
      return;
    }

    if (event.type !== "checkout.session.completed") {
      sendJson(res, 200, { received: true, ignored: event.type || "unknown" });
      return;
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      sendJson(res, 503, { error: "Stripe n'est pas configuré." });
      return;
    }

    const sessionId = event.data?.object?.id;
    if (!sessionId) {
      sendJson(res, 400, { error: "Session absente de l'événement." });
      return;
    }

    // Relit la session chez Stripe : source de vérité (montant, statut) + authentification.
    const stripeResponse = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      { headers: { Authorization: `Bearer ${secretKey}` } },
    );
    const session = await stripeResponse.json();
    if (!stripeResponse.ok) {
      sendJson(res, 400, { error: session?.error?.message || "Session Stripe invalide." });
      return;
    }
    if (session.payment_status !== "paid") {
      sendJson(res, 200, { received: true, pending: session.payment_status || "unpaid" });
      return;
    }

    const slug = session.metadata?.creator_slug;
    const productId = session.metadata?.product_id;
    const customerName =
      session.metadata?.customer_name || session.customer_details?.name || "Client";
    const customerEmail = session.customer_details?.email || session.customer_email || "";
    if (!slug || !productId || !customerEmail) {
      sendJson(res, 200, { received: true, skipped: "métadonnées incomplètes" });
      return;
    }

    const record = await readCreatorRecordBySlug(slug);
    if (!record) {
      sendJson(res, 404, { error: "Boutique introuvable." });
      return;
    }
    const { userId, state } = record;

    // Idempotence : Stripe peut renvoyer plusieurs fois le meme event.
    const already = state.orders.find((item) => item.stripeSessionId === session.id);
    if (already) {
      sendJson(res, 200, { received: true, duplicate: already.id });
      return;
    }

    const product = state.products.find((item) => item.id === productId);
    if (!product) {
      sendJson(res, 200, { received: true, skipped: "produit introuvable" });
      return;
    }

    const amount = Math.round(Number(session.amount_total || 0)) / 100;
    const now = new Date();

    // Contact : reutilise s'il existe (par email), sinon cree.
    let contact = state.contacts.find(
      (item) => (item.email || "").toLowerCase() === customerEmail.toLowerCase(),
    );
    if (!contact) {
      contact = {
        id: `c_${randomBytes(6).toString("hex")}`,
        name: customerName,
        email: customerEmail,
        segment: "Client",
        activity: "Achat via boutique",
        value: 0,
        joined: frDate(now),
      };
      state.contacts.unshift(contact);
    }
    contact.segment = "Client";
    contact.value = Number(contact.value || 0) + amount;
    contact.activity = `Achat · ${product.title}`;

    const order = {
      id: `EXP-${randomBytes(3).toString("hex").toUpperCase()}`,
      contactId: contact.id,
      productId: product.id,
      date: frDate(now),
      amount,
      status: "paid",
      stripeSessionId: session.id,
      accessToken: makeAccessToken(slug),
      createdAt: now.toISOString(),
    };

    state.analytics.purchases = Number(state.analytics.purchases || 0) + 1;

    try {
      const email = await sendAccessEmail({
        customerName: contact.name,
        customerEmail: contact.email,
        product,
        url: accessUrlFor(req, order.accessToken),
        orderId: order.id,
      });
      order.emailStatus = email.sent ? "sent" : "not_configured";
      order.deliveredAt = email.sent ? now.toISOString() : null;
      order.emailId = email.id || null;
      order.emailError = "";
    } catch (error) {
      order.emailStatus = "failed";
      order.emailError = error.message;
    }

    state.orders.unshift(order);
    await saveCreatorState(userId, state);
    sendJson(res, 200, { received: true, orderId: order.id, emailStatus: order.emailStatus });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "Erreur interne." });
  }
}

import {
  accessUrlFor,
  makeAccessToken,
  readCreatorState,
  requireActiveSubscription,
  saveCreatorState,
  sendAccessEmail,
  sendJson,
  userFromRequest,
} from "../_shared.js";

// POST /api/orders/resend-access { orderId } -> renvoie l'email d'accès au client.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    const user = await userFromRequest(req);
    await requireActiveSubscription(user.id);

    const { orderId } = req.body || {};
    const state = await readCreatorState(user.id);
    const order = state.orders.find((item) => item.id === orderId && item.status === "paid");
    const product = order && state.products.find((item) => item.id === order.productId);
    const contact = order && state.contacts.find((item) => item.id === order.contactId);
    if (!order || !product || !contact) {
      sendJson(res, 404, { error: "Commande introuvable ou accès indisponible." });
      return;
    }

    if (!order.accessToken) order.accessToken = makeAccessToken(state.profile.slug);
    try {
      const email = await sendAccessEmail({
        customerName: contact.name,
        customerEmail: contact.email,
        product,
        url: accessUrlFor(req, order.accessToken),
        orderId: order.id,
      });
      order.emailStatus = email.sent ? "sent" : "not_configured";
      order.deliveredAt = email.sent ? new Date().toISOString() : order.deliveredAt || null;
      order.emailId = email.id || order.emailId || null;
      order.emailError = "";
    } catch (error) {
      order.emailStatus = "failed";
      order.emailError = error.message;
    }

    await saveCreatorState(user.id, state);
    sendJson(res, 200, { order });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "Erreur interne." });
  }
}

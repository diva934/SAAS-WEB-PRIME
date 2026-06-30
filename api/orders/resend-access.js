import { randomBytes } from "crypto";
import {
  readCreatorState,
  requireActiveSubscription,
  saveCreatorState,
  sendJson,
  userFromRequest,
} from "../_shared.js";

function appOrigin(req) {
  if (process.env.APP_URL?.startsWith("http")) return new URL(process.env.APP_URL).origin;
  return `https://${req.headers.host}`;
}

function accessUrl(req, token) {
  return `${appOrigin(req)}/access.html?token=${encodeURIComponent(token)}`;
}

function emailHtml({ customerName, product, url }) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f6f6fb;font-family:Arial,sans-serif;color:#17172a">
    <div style="max-width:560px;margin:0 auto;padding:40px 20px">
      <div style="background:#fff;border-radius:18px;padding:32px;border:1px solid #e8e8ef">
        <div style="font-size:13px;font-weight:700;color:#6558f5;text-transform:uppercase">Expertly</div>
        <h1 style="font-size:26px;margin:14px 0 10px">Ton accès est disponible</h1>
        <p style="line-height:1.6;color:#646579">Bonjour ${customerName}, ton accès à <strong>${product.title}</strong> est prêt.</p>
        <a href="${url}" style="display:inline-block;margin-top:18px;padding:14px 20px;border-radius:10px;background:#6558f5;color:#fff;text-decoration:none;font-weight:700">Accéder au produit</a>
      </div>
    </div></body></html>`;
}

async function sendAccessEmail({ customerName, customerEmail, product, url, orderId }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "RESEND_API_KEY manquante" };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `expertly-access-${orderId}-${Date.now()}`,
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "Expertly <onboarding@resend.dev>",
      to: [customerEmail],
      subject: `Ton accès à ${product.title}`,
      html: emailHtml({ customerName, product, url }),
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.message || "Resend a refusé l'email.");
  return { sent: true, id: result.id };
}

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

    if (!order.accessToken) order.accessToken = randomBytes(24).toString("hex");
    try {
      const email = await sendAccessEmail({
        customerName: contact.name,
        customerEmail: contact.email,
        product,
        url: accessUrl(req, order.accessToken),
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

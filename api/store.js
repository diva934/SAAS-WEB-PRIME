import { publicStoreState, readCreatorStateBySlug, sendJson, slugFromAccessToken } from "./_shared.js";

// Resolution d'un token d'acces client (ex-/api/access, fusionne ici pour rester sous la
// limite de 12 fonctions serverless du plan Hobby). GET /api/store?token=slug.hex
async function handleAccessToken(res, token) {
  const slug = slugFromAccessToken(token);
  if (!slug) {
    sendJson(res, 404, { error: "Accès invalide." });
    return;
  }
  const state = await readCreatorStateBySlug(slug);
  if (!state) {
    sendJson(res, 404, { error: "Accès introuvable." });
    return;
  }
  const order = state.orders.find((item) => item.accessToken === token && item.status === "paid");
  if (!order) {
    sendJson(res, 404, { error: "Accès introuvable ou paiement non confirmé." });
    return;
  }
  const product = state.products.find((item) => item.id === order.productId);
  if (!product) {
    sendJson(res, 404, { error: "Produit indisponible." });
    return;
  }
  sendJson(res, 200, {
    productTitle: product.title,
    orderId: order.id,
    access: (product.fileName || "").trim() || `/b/${encodeURIComponent(slug)}`,
  });
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    const token = String(req.query?.token || "").trim();
    if (token) {
      await handleAccessToken(res, token);
      return;
    }
    const slug = req.query?.slug || "";
    if (!slug) {
      sendJson(res, 400, { error: "Identifiant de boutique requis." });
      return;
    }
    const state = await readCreatorStateBySlug(slug);
    if (!state) {
      sendJson(res, 404, { error: "Boutique introuvable." });
      return;
    }
    sendJson(res, 200, publicStoreState(state));
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Erreur interne." });
  }
}

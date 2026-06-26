import { publicStoreState, readCreatorStateBySlug, sendJson } from "./_shared.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
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

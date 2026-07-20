import {
  requireActiveSubscription,
  sendJson,
  slugify,
  userFromRequest,
} from "./_shared.js";
import { fsQuery } from "./_firebase.js";

// GET /api/slug-available?slug=mon-slug
// Returns { slug, available } where `available` is true when the slug is free
// or already owned by the current creator. The authoritative guard remains the
// 409 thrown by saveCreatorState on PUT /api/state.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const user = await userFromRequest(req);
    await requireActiveSubscription(user.id);

    const slug = slugify(req.query?.slug || "");
    if (!slug) {
      sendJson(res, 400, { error: "Identifiant requis.", available: false });
      return;
    }

    const rows = await fsQuery("creators", "slug", slug, 2);
    const available = rows.every((row) => row.id === user.id);
    sendJson(res, 200, { slug, available });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "Erreur interne." });
  }
}

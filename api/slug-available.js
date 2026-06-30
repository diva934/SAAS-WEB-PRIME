import {
  requireActiveSubscription,
  sendJson,
  slugify,
  supabaseRequest,
  userFromRequest,
} from "./_shared.js";

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

    const rows = await supabaseRequest(
      `/rest/v1/creator_states?select=user_id&slug=eq.${encodeURIComponent(slug)}&limit=2`,
    );
    const available = !Array.isArray(rows) || rows.every((row) => row.user_id === user.id);
    sendJson(res, 200, { slug, available });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "Erreur interne." });
  }
}

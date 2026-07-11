import { normalizeState, sendJson, slugify, supabaseRequest } from "../_shared.js";

// POST /api/events/visit { slug } -> incrémente les visites de la boutique.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    const body = req.body || {};
    const slug = slugify(body.slug || "");
    if (!slug) {
      sendJson(res, 400, { error: "Boutique requise." });
      return;
    }
    const rows = await supabaseRequest(
      `/rest/v1/creator_states?select=user_id,state&slug=eq.${encodeURIComponent(slug)}&limit=1`,
    );
    if (!Array.isArray(rows) || !rows[0]) {
      sendJson(res, 404, { error: "Boutique introuvable." });
      return;
    }
    const row = rows[0];
    const state = normalizeState(row.state);
    const prevTotal = state.analytics.visits || 0;
    state.analytics.visits = prevTotal + 1;
    // Historique mensuel des visites (graphique Acquisition : orange = visites/mois).
    const monthKey = new Date().toISOString().slice(0, 7);
    if (!state.analytics.visitsByMonth || typeof state.analytics.visitsByMonth !== "object") {
      state.analytics.visitsByMonth = {};
    }
    const vbm = state.analytics.visitsByMonth;
    // Rattrape les visites historiques non datees (avant le suivi mensuel) sur le mois courant,
    // pour que la somme des mois corresponde toujours au total des visites.
    const summed = Object.keys(vbm).reduce((acc, k) => acc + (Number(vbm[k]) || 0), 0);
    if (summed < prevTotal) vbm[monthKey] = (vbm[monthKey] || 0) + (prevTotal - summed);
    vbm[monthKey] = (vbm[monthKey] || 0) + 1;
    // Journal horodate des visites (pour les fenetres courtes : 10 min / 1h / 24h / 7j / 30j).
    if (!Array.isArray(state.analytics.visitLog)) state.analytics.visitLog = [];
    state.analytics.visitLog.push(new Date().toISOString());
    if (state.analytics.visitLog.length > 1000) {
      state.analytics.visitLog = state.analytics.visitLog.slice(-1000);
    }
    state.products
      .filter((product) => product.status === "published")
      .forEach((product) => {
        product.views = (product.views || 0) + 1;
      });
    await supabaseRequest(`/rest/v1/creator_states?on_conflict=user_id`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([
        { user_id: row.user_id, slug, state, updated_at: new Date().toISOString() },
      ]),
    });
    sendJson(res, 200, { visits: state.analytics.visits });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "Erreur interne." });
  }
}

import { normalizeState, sendJson, slugify, supabaseRequest } from "./_shared.js";

// Donnée publique d'une page de vente, identique à server.mjs (publicSalesPage).
function publicSalesPage(state, slug) {
  const page = (state.pages || []).find((item) => item.slug === slug && item.status === "published");
  if (!page) return null;
  const product = (state.products || []).find(
    (item) => item.id === page.productId && item.status === "published",
  );
  if (!product) return null;
  const { fileName, ...publicProduct } = product;
  return {
    page,
    product: publicProduct,
    profile: {
      creatorName: state.profile.creatorName,
      creatorRole: state.profile.creatorRole,
    },
  };
}

// GET /api/page?slug=ma-page
// Les pages de vente vivent dans state.pages de chaque créateur. L'URL /p/{slug}
// ne porte pas de contexte créateur, on retrouve donc la boutique propriétaire
// via une recherche de containment JSONB sur le slug de page.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    const slug = slugify(req.query?.slug || "");
    if (!slug) {
      sendJson(res, 400, { error: "Page requise." });
      return;
    }

    const filter = encodeURIComponent(JSON.stringify({ pages: [{ slug }] }));
    const rows = await supabaseRequest(
      `/rest/v1/creator_states?select=state&state=cs.${filter}&limit=5`,
    );

    for (const row of Array.isArray(rows) ? rows : []) {
      const result = publicSalesPage(normalizeState(row.state), slug);
      if (result) {
        sendJson(res, 200, result);
        return;
      }
    }
    sendJson(res, 404, { error: "Page indisponible ou non publiée." });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "Erreur interne." });
  }
}

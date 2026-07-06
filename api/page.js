import { assertRateLimit, normalizeState, sendJson, slugify, supabaseRequest } from "./_shared.js";

function publicPayload(state, page, product) {
  const { fileName, ...publicProduct } = product;
  return {
    page,
    product: publicProduct,
    profile: {
      slug: state.profile.slug,
      creatorName: state.profile.creatorName,
      creatorRole: state.profile.creatorRole,
    },
  };
}

// Récupère les états créateurs susceptibles de contenir une page avec ce slug.
// Quand storeSlug est fourni : recherche directe par slug de boutique (O(1) via index unique).
// Sinon : recherche par containment JSONB indexée (requiert un index GIN sur creator_states.state).
// Zéro résultat = page inexistante, pas une erreur. Le scan global n'est jamais utilisé.
async function collectStates(slug, storeSlug = "") {
  if (storeSlug) {
    const rows = await supabaseRequest(
      `/rest/v1/creator_states?select=state&slug=eq.${encodeURIComponent(storeSlug)}&limit=1`,
    );
    return (Array.isArray(rows) ? rows : [])
      .filter((row) => row?.state)
      .map((row) => normalizeState(row.state));
  }

  const filter = encodeURIComponent(JSON.stringify({ pages: [{ slug }] }));
  const rows = await supabaseRequest(
    `/rest/v1/creator_states?select=state&state=cs.${filter}&limit=5`,
  );
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.state)
    .map((row) => normalizeState(row.state));
}

// Résout la page et explique précisément pourquoi elle n'est pas affichable.
async function resolveSalesPage(slug, storeSlug = "") {
  const states = await collectStates(slug, storeSlug);
  let sawPage = false;
  for (const state of states) {
    const page = (state.pages || []).find((item) => item.slug === slug);
    if (!page) continue;
    sawPage = true;
    const product = (state.products || []).find(
      (item) => item.id === page.productId && item.status === "published",
    );
    if (product) return { payload: publicPayload(state, page, product) };
  }
  if (!sawPage) {
    return { reason: "Page introuvable. Vérifie l'identifiant, et crée la page sur le site en ligne (pas en local)." };
  }
  return { reason: "Le produit associé à cette page n'est pas publié. Publie le produit dans l'onglet Produits." };
}

// GET /api/page?store=ma-boutique&slug=ma-page
// `store` reste optionnel pour préserver les anciens liens /p/ma-page.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    await assertRateLimit(req, "sales-page", 30, 60_000);
    const slug = slugify(req.query?.slug || "");
    const storeSlug = req.query?.store ? slugify(req.query.store) : "";
    if (!slug) {
      sendJson(res, 400, { error: "Page requise." });
      return;
    }
    const resolved = await resolveSalesPage(slug, storeSlug);
    if (resolved.payload) {
      sendJson(res, 200, resolved.payload);
      return;
    }
    sendJson(res, 404, { error: resolved.reason });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "Erreur interne." });
  }
}

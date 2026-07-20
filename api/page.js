import { normalizeState, sendJson, slugify } from "./_shared.js";
import { fsList } from "./_firebase.js";

function publicPayload(state, page, product) {
  const strip = (item) => { const { fileName, ...rest } = item; return rest; };
  const products = (state.products || [])
    .filter((item) => item.status === "published")
    .map(strip);
  return {
    page,
    product: strip(product),
    products,
    profile: {
      slug: state.profile.slug,
      creatorName: state.profile.creatorName,
      creatorRole: state.profile.creatorRole,
      bio: state.profile.bio || "",
      logo: state.profile.logo || "",
      accent: state.profile.accent || "#6558f5",
      instagram: state.profile.instagram || "",
      youtube: state.profile.youtube || "",
      tiktok: state.profile.tiktok || "",
    },
  };
}

// Récupère les états créateurs susceptibles de contenir une page avec ce slug :
// containment JSONB (efficace) puis scan borné (robuste).
async function collectStates(slug) {
  // Firestore : scan borne des createurs (le volume reste faible ; a indexer plus tard).
  const all = await fsList("creators", 1000);
  return all.filter((row) => row.data?.state).map((row) => normalizeState(row.data.state));
}

// Résout la page et explique précisément pourquoi elle n'est pas affichable.
async function resolveSalesPage(slug) {
  const states = await collectStates(slug);
  let sawPage = false;
  let sawPublishedPage = false;
  for (const state of states) {
    const page = (state.pages || []).find((item) => item.slug === slug);
    if (!page) continue;
    sawPage = true;
    if (page.status !== "published") continue;
    sawPublishedPage = true;
    const product = (state.products || []).find(
      (item) => item.id === page.productId && item.status === "published",
    );
    if (product) return { payload: publicPayload(state, page, product) };
  }
  if (!sawPage) {
    return { reason: "Page introuvable. Vérifie l'identifiant, et crée la page sur le site en ligne (pas en local)." };
  }
  if (!sawPublishedPage) {
    return { reason: "Cette page est en brouillon. Publie-la dans l'onglet Pages." };
  }
  return { reason: "La page est publiée mais le produit associé ne l'est pas. Publie le produit dans l'onglet Produits." };
}

// GET /api/page?slug=ma-page
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
    const resolved = await resolveSalesPage(slug);
    if (resolved.payload) {
      sendJson(res, 200, resolved.payload);
      return;
    }
    sendJson(res, 404, { error: resolved.reason });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "Erreur interne." });
  }
}

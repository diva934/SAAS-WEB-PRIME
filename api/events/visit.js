import {
  assertRateLimit,
  normalizeState,
  sendJson,
  sendPlausibleEvent,
  slugify,
  saveCreatorState,
  supabaseRequest,
} from "../_shared.js";

const eventNames = {
  pageview: "pageview",
  click: "Product Click",
  checkout: "Checkout Opened",
  lead: "Lead Captured",
};

function trafficSource(value = "") {
  const source = String(value).toLowerCase();
  if (/instagram|facebook|meta/.test(source)) return "Instagram";
  if (/youtube|youtu\.be/.test(source)) return "YouTube";
  if (/mail|newsletter|email/.test(source)) return "Email";
  if (!source || source === "direct") return "Direct";
  return "Other";
}

function updateSources(analytics) {
  const counts = analytics.sourceCounts || {};
  const total = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
  analytics.sources = ["Instagram", "YouTube", "Email", "Direct", "Other"].map((name) => ({
    name,
    value: total ? Math.round((Number(counts[name] || 0) / total) * 100) : 0,
  }));
}

// Collecteur first-party par boutique, compatible avec le modèle d'événements Plausible.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    await assertRateLimit(req, "analytics-event", 60, 60_000);
    const body = req.body || {};
    const slug = slugify(body.slug || "");
    const type = eventNames[body.type] ? body.type : "pageview";
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
    const analytics = state.analytics;
    if (type === "pageview") {
      analytics.visits = Number(analytics.visits || 0) + 1;
      const source = trafficSource(body.source || body.referrer);
      analytics.sourceCounts[source] = Number(analytics.sourceCounts[source] || 0) + 1;
      updateSources(analytics);
    }
    if (type === "click") analytics.clicks = Number(analytics.clicks || 0) + 1;
    if (type === "checkout") analytics.checkouts = Number(analytics.checkouts || 0) + 1;
    if (type === "lead") analytics.leads = Number(analytics.leads || 0) + 1;

    const product = body.productId
      ? state.products.find((item) => item.id === body.productId)
      : null;
    if (product && type === "pageview") product.views = Number(product.views || 0) + 1;
    if (product && type === "click") product.clicks = Number(product.clicks || 0) + 1;

    await saveCreatorState(row.user_id, state);

    const publicUrl = String(body.url || `/b/${slug}`).slice(0, 2000);
    await sendPlausibleEvent(req, {
      name: eventNames[type],
      url: publicUrl.startsWith("http") ? publicUrl : `https://${req.headers.host}${publicUrl}`,
      referrer: String(body.referrer || "").slice(0, 1000),
      props: {
        store_slug: slug,
        product_id: String(body.productId || "").slice(0, 100),
        page_slug: String(body.pageSlug || "").slice(0, 100),
        surface: String(body.surface || "store").slice(0, 40),
      },
    });

    sendJson(res, 200, {
      visits: analytics.visits,
      clicks: analytics.clicks,
      checkouts: analytics.checkouts,
      leads: analytics.leads,
    });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "Erreur interne." });
  }
}

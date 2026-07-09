import {
  readCreatorState,
  requireActiveSubscription,
  sendJson,
  supabaseRequest,
  userFromRequest,
} from "./_shared.js";

// Modele Gemini (surchargeable via env). 2.5 Flash = bon rapport cout/qualite.
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const RL_LIMIT = 30; // messages
const RL_WINDOW_MS = 3600000; // par heure et par utilisateur

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body || "{}"); } catch { return {}; }
  }
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 12000) break;
  }
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

// Memes formules que le dashboard (CA = commandes payees).
function computeMetrics(state) {
  const paid = (state.orders || []).filter((o) => o && o.status === "paid");
  const revenue = paid.reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const a = state.analytics || {};
  const visits = Number(a.visits) || 0;
  const purchases = Number(a.purchases) || 0;
  return {
    revenue,
    orders: paid.length,
    avg: paid.length ? Math.round(revenue / paid.length) : 0,
    visits,
    conv: visits ? (purchases / visits) * 100 : 0,
    products: (state.products || []).filter((p) => p && p.status === "published").length,
    contacts: (state.contacts || []).length,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    // Pas de cle -> le client bascule sur ses reponses locales.
    if (!apiKey) {
      sendJson(res, 503, { error: "assistant_unconfigured" });
      return;
    }

    const user = await userFromRequest(req);
    await requireActiveSubscription(user.id);

    // Rate limit durable (RPC assert_rate_limit, migration 0003) : 30 msg / h / utilisateur.
    try {
      await supabaseRequest("/rest/v1/rpc/assert_rate_limit", {
        method: "POST",
        body: JSON.stringify({
          p_ip: `assistant:${user.id}`,
          p_bucket: "assistant",
          p_limit: RL_LIMIT,
          p_window_ms: RL_WINDOW_MS,
        }),
      });
    } catch (e) {
      if (/rate_limit_exceeded/i.test(String(e && e.message))) {
        sendJson(res, 429, { error: "Trop de messages d'affilee. Reessaie dans quelques minutes." });
        return;
      }
      // Autre souci RPC : on n'empeche pas le chat (l'auth + l'abonnement limitent deja l'acces).
    }

    const body = await readBody(req);
    const question = String(body.question || "").slice(0, 800).trim();
    if (!question) {
      sendJson(res, 400, { error: "Question vide." });
      return;
    }

    const state = await readCreatorState(user.id);
    const m = computeMetrics(state);

    const system =
      "Tu es l'assistant IA d'Expertly, un CRM pour createurs et infopreneurs qui vendent des produits digitaux. " +
      "Tu aides le createur a developper ses ventes. Reponds en francais, ton amical et direct, 2 a 5 phrases maximum, concret et actionnable. " +
      "Appuie-toi sur ses chiffres reels ci-dessous et cite-les quand c'est pertinent. Ne donne pas de conseils juridiques ou financiers personnalises. " +
      "Fonctionnalites du CRM a suggerer si utile : Produits, Pages de vente, Tunnel (lead magnet -> offre -> upsell), Commandes, Contacts, Emails (Resend), connexion Stripe dans Reglages. " +
      `Chiffres actuels du createur -> CA: ${Math.round(m.revenue)} euros, commandes payees: ${m.orders}, panier moyen: ${m.avg} euros, visites: ${m.visits}, taux de conversion: ${m.conv.toFixed(1)}%, produits publies: ${m.products}, contacts: ${m.contacts}.`;

    const history = Array.isArray(body.history) ? body.history.slice(-6) : [];
    const contents = [];
    for (const h of history) {
      if (!h || !h.text) continue;
      contents.push({ role: h.role === "user" ? "user" : "model", parts: [{ text: String(h.text).slice(0, 700) }] });
    }
    contents.push({ role: "user", parts: [{ text: question }] });

    const payload = {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { temperature: 0.6, maxOutputTokens: 400 },
    };

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(MODEL) +
      ":generateContent?key=" +
      encodeURIComponent(apiKey);

    let gRes;
    try {
      gRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      sendJson(res, 502, { error: "assistant_unreachable" });
      return;
    }
    const data = await gRes.json().catch(() => null);
    if (!gRes.ok) {
      sendJson(res, 502, { error: "assistant_error" });
      return;
    }
    const parts =
      data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    const text = Array.isArray(parts) ? parts.map((p) => p.text || "").join("").trim() : "";
    if (!text) {
      sendJson(res, 502, { error: "assistant_empty" });
      return;
    }
    sendJson(res, 200, { answer: text });
  } catch (error) {
    sendJson(res, error && error.status ? error.status : 500, { error: (error && error.message) || "Erreur interne." });
  }
}

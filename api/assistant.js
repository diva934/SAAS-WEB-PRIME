import {
  readCreatorState,
  requireActiveSubscription,
  sendJson,
  supabaseRequest,
  userFromRequest,
} from "./_shared.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const RL_LIMIT = 30;
const RL_WINDOW_MS = 3600000;

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body || "{}"); } catch { return {}; } }
  let raw = "";
  for await (const chunk of req) { raw += chunk; if (raw.length > 12000) break; }
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

function computeMetrics(state) {
  const paid = (state.orders || []).filter((o) => o && o.status === "paid");
  const revenue = paid.reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const a = state.analytics || {};
  const visits = Number(a.visits) || 0;
  const purchases = Number(a.purchases) || 0;
  return {
    revenue, orders: paid.length, avg: paid.length ? Math.round(revenue / paid.length) : 0,
    visits, conv: visits ? (purchases / visits) * 100 : 0,
    products: (state.products || []).filter((p) => p && p.status === "published").length,
    contacts: (state.contacts || []).length,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") { sendJson(res, 405, { error: "Method not allowed" }); return; }
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { sendJson(res, 503, { error: "assistant_unconfigured" }); return; }

    const user = await userFromRequest(req);
    await requireActiveSubscription(user.id);

    try {
      await supabaseRequest("/rest/v1/rpc/assert_rate_limit", {
        method: "POST",
        body: JSON.stringify({ p_ip: `assistant:${user.id}`, p_bucket: "assistant", p_limit: RL_LIMIT, p_window_ms: RL_WINDOW_MS }),
      });
    } catch (e) {
      if (/rate_limit_exceeded/i.test(String(e && e.message))) {
        sendJson(res, 429, { error: "Trop de messages d'affilee. Reessaie dans quelques minutes." });
        return;
      }
    }

    const body = await readBody(req);
    const mode = String(body.mode || "").trim();
    let system = "";
    let question = "";
    let history = [];

    if (mode === "social") {
      const platform = String(body.platform || "Instagram").slice(0, 24).trim();
      const handle = String(body.handle || "").slice(0, 60).trim();
      const objective = String(body.objective || "").slice(0, 500).trim();
      if (!handle) { sendJson(res, 400, { error: "Pseudo requis." }); return; }
      system =
        "Tu es un coach reseaux sociaux pour createurs et infopreneurs qui vendent des produits digitaux avec Expertly. " +
        "TRES IMPORTANT: tu n'as PAS acces aux vraies statistiques du compte (abonnes, vues, engagement) : n'invente JAMAIS de chiffres ni de donnees du compte. " +
        "Donne un audit strategique et un plan de contenu concret, oriente vente, base uniquement sur la plateforme, le pseudo et l'objectif fournis. " +
        "Reponds en francais, ton direct et motivant, en texte simple SANS markdown (pas d'asterisques, pas de dieze). Utilise des tirets et des titres courts. " +
        "Structure ta reponse ainsi : 1) Positionnement conseille (1-2 phrases). 2) 5 idees de contenus concretes adaptees a la plateforme. 3) 3 accroches (hooks) pretes a copier. 4) Rythme de publication conseille. 5) Comment transformer l'audience en ventes (lien en bio vers la boutique Expertly, offre d'appel). " +
        "Plateforme: " + platform + ". Pseudo: " + handle + ". Objectif du createur: " + (objective || "developper mon audience et vendre mes produits") + ".";
      question = "Fais mon audit et mon plan de contenu pour " + handle + " sur " + platform + ".";
    } else {
      question = String(body.question || "").slice(0, 800).trim();
      if (!question) { sendJson(res, 400, { error: "Question vide." }); return; }
      const state = await readCreatorState(user.id);
      const m = computeMetrics(state);
      system =
        "Tu es l'assistant IA d'Expertly, un CRM pour createurs et infopreneurs qui vendent des produits digitaux. " +
        "Tu aides le createur a developper ses ventes. Reponds en francais, ton amical et direct, 2 a 5 phrases maximum, concret et actionnable. Ecris en texte simple et lisible, SANS markdown : pas d'asterisques, pas de gras, pas de dieze. Pour une courte liste utilise des tirets simples. " +
        "Appuie-toi sur ses chiffres reels ci-dessous et cite-les quand c'est pertinent. Ne donne pas de conseils juridiques ou financiers personnalises. " +
        "Fonctionnalites du CRM a suggerer si utile : Produits, Pages de vente, Tunnel (lead magnet -> offre -> upsell), Commandes, Contacts, Emails (Resend), connexion Stripe dans Reglages. " +
        `Chiffres actuels du createur -> CA: ${Math.round(m.revenue)} euros, commandes payees: ${m.orders}, panier moyen: ${m.avg} euros, visites: ${m.visits}, taux de conversion: ${m.conv.toFixed(1)}%, produits publies: ${m.products}, contacts: ${m.contacts}.`;
      history = Array.isArray(body.history) ? body.history.slice(-6) : [];
    }

    const contents = [];
    for (const h of history) {
      if (!h || !h.text) continue;
      contents.push({ role: h.role === "user" ? "user" : "model", parts: [{ text: String(h.text).slice(0, 700) }] });
    }
    contents.push({ role: "user", parts: [{ text: question }] });

    const payload = {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { temperature: 0.6, maxOutputTokens: mode === "social" ? 900 : 600, thinkingConfig: { thinkingBudget: 0 } },
    };

    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(MODEL) + ":generateContent?key=" + encodeURIComponent(apiKey);
    let gRes;
    try {
      gRes = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } catch {
      sendJson(res, 502, { error: "assistant_unreachable" });
      return;
    }
    const data = await gRes.json().catch(() => null);
    if (!gRes.ok) { sendJson(res, 502, { error: "assistant_error" }); return; }
    const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    const text = Array.isArray(parts) ? parts.map((p) => p.text || "").join("").trim() : "";
    if (!text) { sendJson(res, 502, { error: "assistant_empty" }); return; }
    sendJson(res, 200, { answer: text });
  } catch (error) {
    sendJson(res, error && error.status ? error.status : 500, { error: (error && error.message) || "Erreur interne." });
  }
}

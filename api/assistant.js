import {
  readCreatorState,
  requireActiveSubscription,
  sendJson,
  supabaseRequest,
  userFromRequest,
} from "./_shared.js";
import { fetchConnectedSocialSnapshot } from "./social/_shared.js";

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
      const snapshot = await fetchConnectedSocialSnapshot(user.id, platform, req);
      const accountHandle = snapshot.handle || handle;
      const followers = snapshot.followers === null || snapshot.followers === undefined ? "non renseigne" : String(snapshot.followers);
      const bio = snapshot.bio || "non renseignee";
      const bioLink = snapshot.bioLink || "non renseigne";
      const visibility = snapshot.visibility || "non renseigne";
      const posts = (snapshot.posts || []).slice(0, 10);
      const samples = posts.map((post, index) => {
        return [
          `Post ${index + 1}`,
          `Lien: ${post.url || "non renseigne"}`,
          `Legende: ${post.caption || "non renseignee"}`,
          `Hashtags: ${(post.hashtags || []).join(" ") || "aucun hashtag detecte"}`,
        ].join("\n");
      }).join("\n\n").slice(0, 7000);
      system =
        "Tu es un coach reseaux sociaux pour createurs et infopreneurs qui vendent des produits digitaux avec Expertly. " +
        "Tu analyses uniquement les donnees officielles recuperees via la connexion sociale du createur: statut, bio, lien en bio, nombre d'abonnes, posts, legendes et hashtags. " +
        "TRES IMPORTANT: n'invente JAMAIS de chiffres ni de donnees du compte. Si une info manque, indique 'non renseigne'. " +
        "Base toute ton analyse sur les donnees fournies ci-dessous, la plateforme, le pseudo et l'objectif. Reponds en francais, ton direct et professionnel, en texte simple SANS markdown (pas d'asterisques, pas de dieze). Utilise des tirets et des titres courts. " +
        "Structure ta reponse ainsi : 1) Infos du compte (plateforme, pseudo, public/prive, nombre d'abonnes, bio, lien en bio, objectif). 2) Posts et hashtags analyses (liste synthetique des posts fournis, legendes et hashtags recurrents). 3) Synthese du compte percu. 4) Ce qui ressort des contenus fournis. 5) Positionnement percu. 6) Forces. 7) Faiblesses / risques. 8) 5 recommandations concretes. 9) 5 idees de posts ou scripts adaptes. 10) Plan d'action 7 jours. " +
        "Plateforme: " + snapshot.provider + ". Pseudo: " + accountHandle + ". Statut du compte: " + visibility + ". Nombre d'abonnes: " + followers + ". Bio: " + bio + ". Lien en bio: " + bioLink + ". Objectif du createur: " + (objective || "developper mon audience et vendre mes produits") + ".";
      question =
        "Genere un compte rendu pour " + accountHandle + " sur " + snapshot.provider + " a partir des donnees officielles recuperees par le backend. " +
        "Statut public/prive: " + visibility + ". " +
        "Nombre d'abonnes: " + followers + ". " +
        "Bio du compte: " + bio + ". " +
        "Lien en bio: " + bioLink + ". " +
        "Objectif: " + (objective || "developper mon audience et vendre mes produits") + ".\n\nPosts, legendes et hashtags recuperes:\n" + (samples || "Aucun post disponible via l'API.");
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
      generationConfig: { temperature: 0.6, maxOutputTokens: mode === "social" ? 1200 : 600, thinkingConfig: { thinkingBudget: 0 } },
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

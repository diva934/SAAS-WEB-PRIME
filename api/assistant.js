import {
  readCreatorState,
  requireActiveSubscription,
  sendJson,
  supabaseRequest,
  userFromRequest,
} from "./_shared.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
// RapidAPI Instagram actif : parseur robuste (edge_followed_by + aplati). Verifie live sur @nasa.
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

async function fetchWithTimeout(url, options, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms || 6000);
  try { return await fetch(url, { ...(options || {}), signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

// Recherche recursive d'un nombre dont la cle matche `re` (gere aussi {count:N}).
function deepNumber(obj, re, avoid) {
  let out = null; const seen = new Set();
  (function walk(o) {
    if (out !== null || !o || typeof o !== "object" || seen.has(o)) return;
    seen.add(o);
    for (const k of Object.keys(o)) {
      if (out !== null) return;
      const v = o[k];
      if (re.test(k) && !(avoid && avoid.test(k))) {
        if (typeof v === "number" && v >= 0) { out = v; return; }
        if (v && typeof v === "object" && typeof v.count === "number") { out = v.count; return; }
      }
      if (v && typeof v === "object") walk(v);
    }
  })(obj);
  return out;
}
function deepBool(obj, re) {
  let out = false; const seen = new Set();
  (function walk(o) {
    if (out || !o || typeof o !== "object" || seen.has(o)) return;
    seen.add(o);
    for (const k of Object.keys(o)) {
      if (out) return;
      const v = o[k];
      if (typeof v === "boolean" && v && re.test(k)) { out = true; return; }
      if (v && typeof v === "object") walk(v);
    }
  })(obj);
  return out;
}
function deepString(obj, re) {
  let out = null; const seen = new Set();
  (function walk(o) {
    if (out || !o || typeof o !== "object" || seen.has(o)) return;
    seen.add(o);
    for (const k of Object.keys(o)) {
      if (out) return;
      const v = o[k];
      if (typeof v === "string" && v && re.test(k)) { out = v; return; }
      if (v && typeof v === "object") walk(v);
    }
  })(obj);
  return out;
}

// Convertit "1,234", "10.5K", "162M", "2.6B" -> nombre.
function parseCount(str) {
  if (str == null) return null;
  const m = String(str).replace(/ /g, " ").trim().match(/([\d.,]+)\s*([KMB])?/i);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/,/g, ""));
  if (!isFinite(n)) return null;
  const suf = (m[2] || "").toUpperCase();
  if (suf === "K") n *= 1e3; else if (suf === "M") n *= 1e6; else if (suf === "B") n *= 1e9;
  return Math.round(n);
}

// Tentative gratuite Instagram : plusieurs strategies (IG bloque souvent les IP serveurs).
async function scrapeInstagram(handle) {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
  // Strategie 1 : balise og:description de la page publique -> "X Followers, Y Following, Z Posts".
  try {
    const r = await fetchWithTimeout("https://www.instagram.com/" + encodeURIComponent(handle) + "/",
      { headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8" } }, 6500);
    if (r.ok) {
      const html = await r.text();
      const desc = (html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) || [])[1]
        || (html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i) || [])[1];
      if (desc) {
        const mm = desc.match(/([\d.,]+\s*[KMB]?)\s+Followers,\s+([\d.,]+\s*[KMB]?)\s+Following,\s+([\d.,]+\s*[KMB]?)\s+Posts/i);
        if (mm) {
          const title = (html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) || [])[1] || "";
          return {
            platform: "Instagram", handle, name: title.replace(/\s*\(@.*/i, "").trim(),
            followers: parseCount(mm[1]), following: parseCount(mm[2]), posts: parseCount(mm[3]),
            bio: "", verified: false, source: "og",
          };
        }
      }
    }
  } catch { /* passe a la strategie suivante */ }
  // Strategie 2 : endpoint JSON web_profile_info.
  try {
    const r = await fetchWithTimeout(
      "https://www.instagram.com/api/v1/users/web_profile_info/?username=" + encodeURIComponent(handle),
      { headers: { "x-ig-app-id": "936619743392459", "User-Agent": UA, "Accept": "*/*" } }, 6500);
    if (!r.ok) return null;
    const d = await r.json().catch(() => null);
    const u = d && d.data && d.data.user;
    if (!u) return null;
    return {
      platform: "Instagram", handle, name: u.full_name || "", verified: !!u.is_verified, private: !!u.is_private,
      followers: u.edge_followed_by ? u.edge_followed_by.count : null,
      following: u.edge_follow ? u.edge_follow.count : null,
      posts: u.edge_owner_to_timeline_media ? u.edge_owner_to_timeline_media.count : null,
      bio: u.biography || "", source: "web_profile_info",
    };
  } catch { return null; }
}

// Tentative gratuite : JSON embarque dans la page publique TikTok.
async function scrapeTiktok(handle) {
  try {
    const r = await fetchWithTimeout("https://www.tiktok.com/@" + encodeURIComponent(handle), {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36", "Accept": "text/html" },
    }, 6000);
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return null;
    const data = JSON.parse(m[1]);
    const detail = data && data.__DEFAULT_SCOPE__ && data.__DEFAULT_SCOPE__["webapp.user-detail"];
    const info = detail && detail.userInfo;
    if (!info) return null;
    const sv = info.statsV2 || {};
    const st = info.stats || {};
    // statsV2 = chaines (pas de depassement d'entier 32-bit sur les gros comptes) ; repli sur stats.
    const pick = function (k) { const a = sv[k], b = st[k]; const v = (a != null && a !== "") ? Number(a) : Number(b); return Number.isFinite(v) ? v : null; };
    return {
      platform: "TikTok", handle, name: (info.user && info.user.nickname) || "", verified: !!(info.user && info.user.verified),
      followers: pick("followerCount"),
      following: pick("followingCount"),
      posts: pick("videoCount"),
      likes: pick("heartCount"),
      bio: (info.user && info.user.signature) || "", source: "direct",
    };
  } catch { return null; }
}

// Premier nombre trouve parmi une liste de regex (dans l'ordre de priorite).
function firstNum(d, regexes, avoid) {
  for (const re of regexes) { const n = deepNumber(d, re, avoid); if (n != null) return n; }
  return null;
}

// Repli fiable : RapidAPI (host/path configurables via env). Parsing defensif.
// `dbg` (optionnel) : tableau ou l'on pousse des infos de diagnostic (sans jamais la cle).
async function scrapeRapidApi(platform, handle, dbg) {
  const key = process.env.RAPIDAPI_KEY;
  if (dbg) dbg.push("keyPresent=" + (!!key));
  if (!key) return null;
  const isTT = /tiktok/i.test(platform);
  // Defaut IG = Instagram Looter (rapidapi) ; surchargeable par env. TikTok deja gere en gratuit.
  const host = isTT ? process.env.RAPIDAPI_TT_HOST : (process.env.RAPIDAPI_IG_HOST || "instagram-looter2.p.rapidapi.com");
  const path = isTT ? process.env.RAPIDAPI_TT_PATH : (process.env.RAPIDAPI_IG_PATH || "/profile?username=");
  if (dbg) dbg.push("host=" + host, "path=" + path);
  if (!host || !path) return null;
  try {
    const url = "https://" + host + path + encodeURIComponent(handle);
    const r = await fetchWithTimeout(url, { headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": host } }, 8000);
    if (dbg) dbg.push("httpStatus=" + r.status);
    if (!r.ok) {
      if (dbg) { const tx = await r.text().catch(() => ""); dbg.push("errBody=" + String(tx).slice(0, 240)); }
      return null;
    }
    const d = await r.json().catch(() => null);
    if (!d) { if (dbg) dbg.push("jsonParse=failed"); return null; }
    if (dbg) dbg.push("topKeys=" + Object.keys(d).slice(0, 40).join(","));
    // Certains hosts enveloppent la reponse ({data:{...}} / {result:{...}} / {user:{...}}).
    // deepNumber/deepString sont recursifs, donc on parse directement `d`.
    // Instagram (GraphQL brut ou aplati) + TikTok.
    const followers = isTT
      ? firstNum(d, [/^followerCount$/i, /follower_count/i, /follower/i], /following/i)
      : firstNum(d, [/^edge_followed_by$/i, /follower_count/i, /follower/i, /followed_by/i], /following/i);
    if (dbg) dbg.push("followers=" + followers);
    if (followers == null) return null;
    const following = isTT
      ? firstNum(d, [/^followingCount$/i, /following_count/i, /following/i])
      : firstNum(d, [/^edge_follow$/i, /following_count/i, /following/i, /follows_count/i]);
    const posts = isTT
      ? firstNum(d, [/^videoCount$/i, /video_count/i, /media_count/i])
      : firstNum(d, [/timeline_media/i, /media_count/i, /posts?_count/i, /^post/i]);
    const likes = firstNum(d, [/^heartCount$/i, /heart/i, /total_favorited/i, /likes?_count/i]);
    return {
      platform: isTT ? "TikTok" : "Instagram", handle, followers,
      following, posts, likes,
      name: deepString(d, /full_name|nick_?name|display_name/i) || handle,
      bio: deepString(d, /biograph|signature/i) || "",
      verified: deepBool(d, /^is_verified$/i), source: "rapidapi",
    };
  } catch (e) { if (dbg) dbg.push("exception=" + String(e && e.message).slice(0, 160)); return null; }
}

async function fetchSocialStats(platform, rawHandle, dbg) {
  const handle = String(rawHandle || "").replace(/^@+/, "").trim();
  if (!handle) return null;
  const isTT = /tiktok/i.test(platform);
  let stats = isTT ? await scrapeTiktok(handle) : await scrapeInstagram(handle);
  if (dbg) dbg.push("freeScrape=" + (stats && stats.followers != null ? "ok" : "null"));
  if (!stats || stats.followers == null) {
    const rapid = await scrapeRapidApi(platform, handle, dbg);
    if (rapid) stats = rapid;
  }
  if (!stats || stats.followers == null) return null;
  return stats;
}

function statsPromptLine(s) {
  const parts = [];
  if (s.followers != null) parts.push(s.followers + " abonnes");
  if (s.following != null) parts.push(s.following + " abonnements");
  if (s.posts != null) parts.push(s.posts + " publications");
  if (s.likes != null) parts.push(s.likes + " likes cumules");
  if (s.verified) parts.push("compte verifie");
  return "STATISTIQUES REELLES du compte " + s.platform + " @" + s.handle + (s.name ? " (" + s.name + ")" : "") + " : "
    + parts.join(", ") + (s.bio ? '. Bio: "' + String(s.bio).slice(0, 200).replace(/\s+/g, " ") + '"' : "") + ". ";
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
    let socialStats = null;
    let statsDebug = null;

    if (mode === "social") {
      const platform = String(body.platform || "Instagram").slice(0, 24).trim();
      const handle = String(body.handle || "").slice(0, 60).trim();
      const objective = String(body.objective || "").slice(0, 500).trim();
      if (!handle) { sendJson(res, 400, { error: "Pseudo requis." }); return; }
      const dbg = [];
      statsDebug = dbg;
      try { socialStats = await fetchSocialStats(platform, handle, dbg); } catch (e) { socialStats = null; dbg.push("throw=" + String(e && e.message).slice(0, 120)); }
      console.log("[assistant] stats " + platform + " @" + handle + " -> " + (socialStats ? "OK" : "ECHEC") + " | " + dbg.join(" | "));
      const dataRule = socialStats
        ? "Tu DISPOSES des vraies statistiques du compte ci-dessous : appuie ton audit et tes conseils dessus et cite les chiffres pertinents. " + statsPromptLine(socialStats)
        : "IMPORTANT: tu n'as PAS pu recuperer les vraies statistiques de @" + handle + " (l'acces automatique a ce compte a ete bloque par la plateforme). Apres la ligne NOTE, commence OBLIGATOIREMENT par une seule phrase honnete du type \"Je n'ai pas pu recuperer les vraies stats de @" + handle + ", mais voici une strategie generale.\" Ensuite, ne fais JAMAIS semblant de connaitre son nombre d'abonnes, ses vues ou son contenu reel, et n'invente AUCUN chiffre : donne des conseils strategiques generaux applicables sans les chiffres. ";
      const noteRule = socialStats
        ? "Commence IMPERATIVEMENT par une seule premiere ligne au format EXACT [[NOTE:xx]] ou xx (0 a 100) reflete la SANTE REELLE du compte d'apres les statistiques fournies (taille d'audience, ratio abonnes/publications, coherence avec l'objectif) : moins de 40 tres faible, 40 a 69 moyen, 70 et plus solide. Puis passe a la ligne, ne rementionne jamais cette note. "
        : "Commence IMPERATIVEMENT par une seule premiere ligne au format EXACT [[NOTE:xx]] ou xx est un entier de 0 a 100 estimant le potentiel actuel du compte d'apres le positionnement et l'objectif fournis (moins de 50 si flou ou peu d'infos, 60 a 79 si correct, 80 et plus si tres clair et vendeur), puis passe a la ligne. Ne rementionne jamais cette note dans le texte. ";
      system =
        "Tu es un coach reseaux sociaux pour createurs et infopreneurs qui vendent des produits digitaux avec Expertly. " +
        dataRule +
        "Donne un audit strategique et un plan de contenu concret, oriente vente. " +
        "Reponds en francais, ton direct et motivant, en texte simple SANS markdown (pas d'asterisques, pas de dieze). Utilise des tirets et des titres courts. " +
        noteRule +
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
    if (!gRes.ok) {
      // Motif exact renvoye par Google (statut + message). La cle n'apparait jamais dans le corps d'erreur.
      const gErr = (data && data.error) || {};
      const detail = String(gErr.message || gErr.status || "").slice(0, 300);
      console.error("[assistant] Gemini HTTP " + gRes.status + " : " + detail);
      sendJson(res, 502, { error: "assistant_error", googleStatus: gRes.status, detail });
      return;
    }
    const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    const text = Array.isArray(parts) ? parts.map((p) => p.text || "").join("").trim() : "";
    if (!text) { sendJson(res, 502, { error: "assistant_empty" }); return; }
    const isAdmin = String((user && user.email) || "").toLowerCase() === "unknown35225@gmail.com";
    sendJson(res, 200, mode === "social"
      ? { answer: text, stats: socialStats, ...(isAdmin && statsDebug ? { statsDebug } : {}) }
      : { answer: text });
  } catch (error) {
    sendJson(res, error && error.status ? error.status : 500, { error: (error && error.message) || "Erreur interne." });
  }
}

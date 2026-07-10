import { appOrigin, requireActiveSubscription, sendJson, userFromRequest } from "../_shared.js";
import {
  assertProviderConfigured,
  createOauthState,
  exchangeCode,
  oauthUrl,
  providerConfig,
  saveConnection,
  verifyOauthState,
} from "./_shared.js";

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

// Endpoint OAuth social unique (plan Hobby = 12 fonctions serverless max).
// POST /api/social/connect -> initie la connexion (renvoie l'URL OAuth du provider).
// GET  /api/social/connect -> callback OAuth (echange le code, enregistre le token, redirige).
export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const url = new URL(req.url, appOrigin(req));
      const code = url.searchParams.get("code");
      const stateValue = url.searchParams.get("state");
      if (!code || !stateValue) throw new Error("Code OAuth manquant.");
      const state = verifyOauthState(stateValue);
      const config = providerConfig(state.provider, req);
      assertProviderConfigured(config);
      const token = await exchangeCode(config, code);
      await saveConnection({ userId: state.userId, provider: config.key, handle: state.handle || "", token });
      res.writeHead(302, { Location: `/app.html?social=connected&provider=${encodeURIComponent(config.key)}` });
      res.end();
    } catch (error) {
      res.writeHead(302, { Location: `/app.html?social=error&message=${encodeURIComponent(error.message || "Connexion impossible")}` });
      res.end();
    }
    return;
  }

  if (req.method !== "POST") { sendJson(res, 405, { error: "Method not allowed" }); return; }
  try {
    const user = await userFromRequest(req);
    await requireActiveSubscription(user.id);
    const body = await readBody(req);
    const config = providerConfig(body.provider || "instagram", req);
    assertProviderConfigured(config);
    const handle = String(body.handle || "").replace(/^@+/, "").slice(0, 80).trim();
    const state = createOauthState({ userId: user.id, provider: config.key, handle });
    sendJson(res, 200, { url: oauthUrl(config, state), provider: config.key });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "Erreur interne." });
  }
}

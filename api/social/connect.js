import { requireActiveSubscription, sendJson, userFromRequest } from "../_shared.js";
import { assertProviderConfigured, createOauthState, oauthUrl, providerConfig } from "./_shared.js";

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

export default async function handler(req, res) {
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

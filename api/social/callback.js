import { appOrigin, sendJson } from "../_shared.js";
import { assertProviderConfigured, exchangeCode, providerConfig, saveConnection, verifyOauthState } from "./_shared.js";

export default async function handler(req, res) {
  if (req.method !== "GET") { sendJson(res, 405, { error: "Method not allowed" }); return; }
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
}

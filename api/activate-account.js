const {
  activateSupabaseSubscription,
  crmAppUrl,
  isPaidSubscription,
  readJson,
  sendJson,
  stripeSession,
  supabaseUserFromToken,
} = require("./_shared");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { sessionId } = await readJson(req);
    if (!sessionId?.startsWith("cs_")) {
      sendJson(res, 400, { error: "Session Stripe invalide." });
      return;
    }

    const user = await supabaseUserFromToken(token);
    const session = await stripeSession(sessionId);
    if (!isPaidSubscription(session)) {
      sendJson(res, 402, { error: "Paiement non confirme." });
      return;
    }
    await activateSupabaseSubscription(session, user);
    sendJson(res, 200, {
      activated: true,
      crmUrl: `${crmAppUrl().replace(/\/$/, "")}/?payment=success`,
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Activation impossible." });
  }
};

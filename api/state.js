import {
  readCreatorState,
  requireActiveSubscription,
  saveCreatorState,
  sendJson,
  userFromRequest,
} from "./_shared.js";

export default async function handler(req, res) {
  try {
    const user = await userFromRequest(req);
    await requireActiveSubscription(user.id);

    if (req.method === "GET") {
      sendJson(res, 200, await readCreatorState(user.id));
      return;
    }

    if (req.method === "PUT") {
      const saved = await saveCreatorState(user.id, req.body || {});
      sendJson(res, 200, { saved: true, state: saved });
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "Erreur interne." });
  }
}

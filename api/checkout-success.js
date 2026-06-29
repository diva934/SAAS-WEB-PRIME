const { isPaidSubscription, plans, stripeSession } = require("./_shared");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  const sessionId = req.query?.session_id;
  if (!sessionId?.startsWith("cs_")) {
    res.writeHead(302, { Location: "/index.html?payment=cancelled#pricing" });
    res.end();
    return;
  }

  try {
    const session = await stripeSession(sessionId);
    if (!isPaidSubscription(session) || !plans[session.metadata?.offerlab_plan]) {
      res.writeHead(302, { Location: "/index.html?payment=cancelled#pricing" });
      res.end();
      return;
    }
    res.writeHead(302, {
      Location: `/activation.html?session_id=${encodeURIComponent(session.id)}`,
      "Cache-Control": "no-store",
    });
    res.end();
  } catch {
    res.writeHead(302, { Location: "/index.html?payment=cancelled#pricing" });
    res.end();
  }
};

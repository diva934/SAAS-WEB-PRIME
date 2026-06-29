const { crmAppUrl, sendJson } = require("./_shared");

module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  sendJson(res, 200, {
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
    crmUrl: crmAppUrl(),
  });
};

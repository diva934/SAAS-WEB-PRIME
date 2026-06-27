import { sendJson } from "./_shared.js";

export default function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const checks = {
    stripe: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
    supabase: Boolean(
      process.env.SUPABASE_URL?.trim() &&
        process.env.SUPABASE_ANON_KEY?.trim() &&
        process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    ),
    crm: Boolean(process.env.CRM_APP_URL?.trim()),
    webhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),
  };
  const ready = checks.stripe && checks.supabase && checks.crm;
  sendJson(res, ready ? 200 : 503, { status: ready ? "ready" : "configuration_required", checks });
}

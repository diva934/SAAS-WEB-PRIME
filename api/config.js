import { sendJson } from "./_shared.js";

export default function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  sendJson(res, 200, {
    stripe: Boolean(process.env.STRIPE_SECRET_KEY),
    stripeWebhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    email: Boolean(process.env.RESEND_API_KEY),
    umami: {
      enabled: false,
      websiteId: null,
      hostUrl: "",
      boutiqueSlug: "",
    },
    // Config publique (ex-/api/public-config, fusionnee ici pour rester sous la limite
    // de 12 fonctions serverless du plan Hobby).
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
    marketingUrl: process.env.MARKETING_URL || "https://saas-web-prime.vercel.app",
    // Heure serveur (source de verite pour les fenetres temporelles des dashboards).
    now: new Date().toISOString(),
  });
}

import { sendJson, supabaseRequest } from "./_shared.js";

export default async function handler(req, res) {
  // POST : inscription gratuite (compte cree confirme, sans carte). Le paiement se fait
  // ensuite DANS le CRM (paywall d'essai). On greffe ici pour rester sous 12 fonctions.
  if (req.method === "POST") {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      if ((body.action || "") !== "signup") {
        sendJson(res, 400, { error: "Action inconnue." });
        return;
      }
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const firstName = String(body.firstName || "").trim().slice(0, 60);
      if (!email || !/.+@.+\..+/.test(email)) {
        sendJson(res, 400, { error: "Email invalide." });
        return;
      }
      if (password.length < 6) {
        sendJson(res, 400, { error: "Mot de passe trop court (6 caracteres minimum)." });
        return;
      }
      try {
        await supabaseRequest("/auth/v1/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            email_confirm: true,
            user_metadata: { first_name: firstName },
          }),
        });
      } catch (e) {
        const detail = (e && e.supabase) || {};
        const code = String(detail.error_code || detail.code || "");
        const msg = String((e && e.message) || detail.msg || "");
        const status = e && e.status;
        // Email deja utilise : GoTrue renvoie 422 / error_code "email_exists".
        if (
          status === 409 || status === 422 ||
          /email_exists|already|registered|duplicate|been|existe/i.test(code + " " + msg)
        ) {
          sendJson(res, 409, { error: "email_exists" });
          return;
        }
        // Autre motif : on le remonte lisiblement (email refuse, mot de passe faible, etc.).
        sendJson(res, 400, { error: msg ? msg.slice(0, 160) : "Creation du compte impossible." });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    } catch (e) {
      sendJson(res, 500, { error: "Creation du compte impossible pour le moment." });
      return;
    }
  }

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

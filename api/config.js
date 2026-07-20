import { sendJson } from "./_shared.js";

const FB_API_KEY = process.env.FIREBASE_API_KEY || "AIzaSyAGaFPCaF-Gm2hE7sCzH6E108CSpcIMFQE";
const FB_PROJECT = process.env.FIREBASE_PROJECT_ID || "expertly-32d53";

export default async function handler(req, res) {
  // POST : inscription gratuite (compte cree, sans carte) — portee sur Firebase Auth.
  if (req.method === "POST") {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      if ((body.action || "") !== "signup") {
        sendJson(res, 400, { error: "Action inconnue." });
        return;
      }
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!email || !/.+@.+\..+/.test(email)) {
        sendJson(res, 400, { error: "Email invalide." });
        return;
      }
      if (password.length < 6) {
        sendJson(res, 400, { error: "Mot de passe trop court (6 caracteres minimum)." });
        return;
      }
      if (!FB_API_KEY) {
        sendJson(res, 503, { error: "Firebase n'est pas configure." });
        return;
      }
      const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(FB_API_KEY)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: false }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const code = String(j?.error?.message || "");
        if (/EMAIL_EXISTS/.test(code)) {
          sendJson(res, 409, { error: "email_exists" });
          return;
        }
        sendJson(res, 400, { error: code ? code.slice(0, 160) : "Creation du compte impossible." });
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
    umami: { enabled: false, websiteId: null, hostUrl: "", boutiqueSlug: "" },
    // Config publique Firebase (cle API publique par nature).
    firebase: { apiKey: FB_API_KEY, projectId: FB_PROJECT, authDomain: FB_PROJECT ? `${FB_PROJECT}.firebaseapp.com` : "" },
    // Alias de transition : les anciens clients (et le shim) utilisent createClient(url, key).
    supabaseUrl: FB_PROJECT ? `https://${FB_PROJECT}.firebaseapp.com` : "",
    supabaseAnonKey: FB_API_KEY,
    marketingUrl: process.env.MARKETING_URL || "https://saas-web-prime.vercel.app",
    now: new Date().toISOString(),
  });
}

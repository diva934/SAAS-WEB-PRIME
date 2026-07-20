/* Couche partagee des fonctions serveur — VERSION FIREBASE.
   Donnees dans Firestore : creators/{uid} = { slug, state, updated_at }
                            subscriptions/{uid} = { status, plan, ... }
   Auth : ID tokens Firebase (voir _firebase.js). Exports inchanges. */
import { randomBytes } from "crypto";
import { userFromRequest as fbUser, fsGet, fsSet, fsQuery } from "./_firebase.js";

const defaultState = {
  profile: {
    firstName: "",
    creatorName: "",
    creatorRole: "Infopreneur",
    bio: "Bienvenue dans ma boutique de produits digitaux.",
    slug: "boutique",
    accent: "#073bd9",
    logo: "",
  },
  products: [],
  pages: [],
  contacts: [],
  orders: [],
  analytics: {
    visits: 0,
    leads: 0,
    checkouts: 0,
    purchases: 0,
    revenueSeries: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    sources: [
      { name: "Instagram", value: 0 },
      { name: "YouTube", value: 0 },
      { name: "Email", value: 0 },
      { name: "Direct", value: 0 },
    ],
  },
  emails: [
    {
      id: "em1",
      name: "Livraison post-achat",
      description: "Envoie automatiquement le lien d'acces au client apres le paiement.",
      trigger: "Achat confirme",
      sent: 0,
      openRate: 0,
      active: false,
    },
  ],
};

export function sendJson(res, status, body) {
  res.status(status).json(body);
}

export function slugify(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "boutique";
}

export function normalizeState(input = {}) {
  return {
    ...defaultState,
    ...input,
    profile: {
      ...defaultState.profile,
      ...(input.profile || {}),
      slug: slugify(input.profile?.slug || input.profile?.creatorName || defaultState.profile.slug),
    },
    products: Array.isArray(input.products) ? input.products : [],
    pages: Array.isArray(input.pages) ? input.pages : [],
    contacts: Array.isArray(input.contacts) ? input.contacts : [],
    orders: Array.isArray(input.orders) ? input.orders : [],
    analytics: { ...defaultState.analytics, ...(input.analytics || {}) },
    emails: Array.isArray(input.emails) ? input.emails : defaultState.emails,
  };
}

export function publicStoreState(state) {
  const normalized = normalizeState(state);
  return {
    profile: normalized.profile,
    products: normalized.products
      .filter((product) => product.status === "published")
      .map(({ fileName, ...product }) => product),
  };
}

/* ---------- Compatibilite (anciens imports Supabase) ---------- */
export function hasSupabaseServerConfig() {
  // Conserve pour compatibilite : signale desormais la config Firebase.
  return Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
}

export async function supabaseRequest() {
  const e = new Error("supabaseRequest est retire : ce endpoint doit etre porte sur Firestore (fsGet/fsSet/fsQuery).");
  e.status = 500;
  throw e;
}

/* ---------- Auth ---------- */
export async function userFromRequest(req) {
  return fbUser(req);
}

/* ---------- Abonnements ---------- */
export async function requireActiveSubscription(userId) {
  const sub = await fsGet(`subscriptions/${userId}`);
  if (!sub || sub.status !== "active") {
    const error = new Error("Abonnement actif requis.");
    error.status = 403;
    throw error;
  }
  return { user_id: userId, status: sub.status, plan: sub.plan || "" };
}

// Renvoie la ligne d'abonnement active (ou null) SANS lever d'erreur.
export async function getActiveSubscription(userId) {
  const sub = await fsGet(`subscriptions/${userId}`);
  return sub && sub.status === "active" ? { user_id: userId, status: sub.status, plan: sub.plan || "" } : null;
}

// Ecrit/actualise l'abonnement d'un utilisateur (utilise par stripe-webhook & admin).
export async function upsertSubscription(userId, data) {
  const current = (await fsGet(`subscriptions/${userId}`)) || {};
  const next = { ...current, ...data, updated_at: new Date().toISOString() };
  await fsSet(`subscriptions/${userId}`, next);
  return next;
}

export const PLAN_LIMITS = {
  launch: { label: "Launch", maxProducts: 5, emailAutomation: false, customDomain: false, upsells: false, multiBrand: false, commissionRate: 0.03 },
  scale: { label: "Scale", maxProducts: null, emailAutomation: true, customDomain: true, upsells: true, multiBrand: false, commissionRate: 0 },
  studio: { label: "Studio", maxProducts: null, emailAutomation: true, customDomain: true, upsells: true, multiBrand: true, commissionRate: 0 },
};

export function limitsForPlan(plan) {
  if (plan === "launch") return PLAN_LIMITS.launch;
  if (plan === "studio") return PLAN_LIMITS.studio;
  return PLAN_LIMITS.scale;
}

export function commissionRateForPlan(plan) {
  return plan === "launch" ? PLAN_LIMITS.launch.commissionRate : 0;
}

/* ---------- Etat createur (Firestore) ---------- */
export async function readCreatorState(userId) {
  const doc = await fsGet(`creators/${userId}`);
  if (doc?.state) return normalizeState(doc.state);
  return normalizeState(defaultState);
}

export async function readCreatorStateBySlug(slug) {
  const cleanSlug = slugify(slug);
  const rows = await fsQuery("creators", "slug", cleanSlug, 1);
  if (rows.length && rows[0].data?.state) return normalizeState(rows[0].data.state);
  return null;
}

export async function readCreatorRecordBySlug(slug) {
  const cleanSlug = slugify(slug);
  const rows = await fsQuery("creators", "slug", cleanSlug, 1);
  if (rows.length && rows[0].data?.state) {
    return { userId: rows[0].id, state: normalizeState(rows[0].data.state) };
  }
  return null;
}

export async function saveCreatorState(userId, state) {
  const next = normalizeState(state);
  const slug = next.profile.slug;
  const taken = await fsQuery("creators", "slug", slug, 2);
  if (taken.some((row) => row.id !== userId)) {
    const error = new Error("Cet identifiant de boutique est deja utilise.");
    error.status = 409;
    throw error;
  }
  await fsSet(`creators/${userId}`, {
    slug,
    state: next,
    updated_at: new Date().toISOString(),
  });
  return next;
}

/* ---------- Acces produits / emails (inchange) ---------- */
export function makeAccessToken(slug) {
  return `${slugify(slug)}.${randomBytes(20).toString("hex")}`;
}

export function slugFromAccessToken(token = "") {
  const value = String(token);
  return value.includes(".") ? value.slice(0, value.indexOf(".")) : "";
}

export function appOrigin(req) {
  if (process.env.APP_URL?.startsWith("http")) return new URL(process.env.APP_URL).origin;
  return `https://${req.headers.host}`;
}

export function accessUrlFor(req, token) {
  return `${appOrigin(req)}/access.html?token=${encodeURIComponent(token)}`;
}

function accessEmailHtml({ customerName, product, url }) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f6f6fb;font-family:Arial,sans-serif;color:#17172a">
    <div style="max-width:560px;margin:0 auto;padding:40px 20px">
      <div style="background:#fff;border-radius:18px;padding:32px;border:1px solid #e8e8ef">
        <div style="font-size:13px;font-weight:700;color:#6558f5;text-transform:uppercase">Expertly</div>
        <h1 style="font-size:26px;margin:14px 0 10px">Ton accès est disponible</h1>
        <p style="line-height:1.6;color:#646579">Bonjour ${customerName}, ton accès à <strong>${product.title}</strong> est prêt.</p>
        <a href="${url}" style="display:inline-block;margin-top:18px;padding:14px 20px;border-radius:10px;background:#6558f5;color:#fff;text-decoration:none;font-weight:700">Accéder au produit</a>
      </div>
    </div></body></html>`;
}

export async function sendAccessEmail({ customerName, customerEmail, product, url, orderId }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "RESEND_API_KEY manquante" };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `expertly-access-${orderId}-${Date.now()}`,
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "Expertly <onboarding@resend.dev>",
      to: [customerEmail],
      subject: `Ton accès à ${product.title}`,
      html: accessEmailHtml({ customerName, product, url }),
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.message || "Resend a refusé l'email.");
  return { sent: true, id: result.id };
}

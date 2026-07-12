import { randomBytes } from "crypto";

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
    .replace(/[\u0300-\u036f]/g, "")
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

function supabaseHeaders(service = false, token = "") {
  const key = service ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_ANON_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${service ? key : token}`,
    "Content-Type": "application/json",
  };
}

export function hasSupabaseServerConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function supabaseRequest(path, options = {}) {
  if (!hasSupabaseServerConfig()) throw new Error("Supabase n'est pas configure.");
  const response = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, "")}${path}`, {
    ...options,
    headers: {
      ...supabaseHeaders(true),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const err = new Error(data?.message || data?.msg || data?.error_description || data?.error || `Supabase HTTP ${response.status}`);
    err.status = response.status;
    err.supabase = data;
    throw err;
  }
  return data;
}

export async function userFromRequest(req) {
  if (!hasSupabaseServerConfig()) throw new Error("Supabase n'est pas configure.");
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    const error = new Error("Connexion requise.");
    error.status = 401;
    throw error;
  }
  const response = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
    headers: supabaseHeaders(false, token),
  });
  const user = await response.json();
  if (!response.ok || !user?.id) {
    const error = new Error("Session Supabase invalide.");
    error.status = 401;
    throw error;
  }
  return user;
}

export async function requireActiveSubscription(userId) {
  const rows = await supabaseRequest(
    `/rest/v1/subscriptions?select=user_id,status,plan&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&limit=1`,
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    const error = new Error("Abonnement actif requis.");
    error.status = 403;
    throw error;
  }
  return rows[0];
}

// Renvoie la ligne d'abonnement active (ou null) SANS lever d'erreur.
// Sert a connaitre la formule (plan) pour appliquer les limites.
export async function getActiveSubscription(userId) {
  const rows = await supabaseRequest(
    `/rest/v1/subscriptions?select=user_id,status,plan&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&limit=1`,
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

// Limites et capacites par formule. Source de verite cote serveur pour l'application
// des restrictions (le front s'y refere aussi pour l'affichage). maxProducts=null => illimite.
export const PLAN_LIMITS = {
  launch: { label: "Launch", maxProducts: 5, emailAutomation: false, customDomain: false, upsells: false, multiBrand: false },
  scale: { label: "Scale", maxProducts: null, emailAutomation: true, customDomain: true, upsells: true, multiBrand: false },
  studio: { label: "Studio", maxProducts: null, emailAutomation: true, customDomain: true, upsells: true, multiBrand: true },
};

// Ne restreint QUE lorsqu'on sait positivement que la formule est "launch" ou "studio".
// Toute autre valeur (scale, inconnue, vide) => capacites "scale" (permissif) pour ne
// jamais bloquer par erreur un client deja payant dont la formule serait absente.
export function limitsForPlan(plan) {
  if (plan === "launch") return PLAN_LIMITS.launch;
  if (plan === "studio") return PLAN_LIMITS.studio;
  return PLAN_LIMITS.scale;
}

export async function readCreatorState(userId) {
  const rows = await supabaseRequest(
    `/rest/v1/creator_states?select=state,slug&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
  );
  if (Array.isArray(rows) && rows[0]?.state) return normalizeState(rows[0].state);
  return normalizeState(defaultState);
}

export async function readCreatorStateBySlug(slug) {
  const cleanSlug = slugify(slug);
  const rows = await supabaseRequest(
    `/rest/v1/creator_states?select=state,slug&slug=eq.${encodeURIComponent(cleanSlug)}&limit=1`,
  );
  if (Array.isArray(rows) && rows[0]?.state) return normalizeState(rows[0].state);
  return null;
}

// Comme readCreatorStateBySlug mais renvoie aussi le user_id (necessaire pour saveCreatorState).
export async function readCreatorRecordBySlug(slug) {
  const cleanSlug = slugify(slug);
  const rows = await supabaseRequest(
    `/rest/v1/creator_states?select=user_id,state,slug&slug=eq.${encodeURIComponent(cleanSlug)}&limit=1`,
  );
  if (Array.isArray(rows) && rows[0]?.state) {
    return { userId: rows[0].user_id, state: normalizeState(rows[0].state) };
  }
  return null;
}

// Token d'acces client : prefixe par le slug pour permettre a /api/access de retrouver
// la boutique en O(1) (pas de scan de toutes les boutiques). slugify n'emet jamais de ".".
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

// Envoie l'email d'acces via Resend. Renvoie {sent:false} si la cle n'est pas configuree
// (au lieu de lever) pour que le paiement reste enregistre meme sans email.
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

export async function saveCreatorState(userId, state) {
  const next = normalizeState(state);
  const slug = next.profile.slug;
  const existing = await supabaseRequest(
    `/rest/v1/creator_states?select=user_id&slug=eq.${encodeURIComponent(slug)}&limit=2`,
  );
  if (existing.some((row) => row.user_id !== userId)) {
    const error = new Error("Cet identifiant de boutique est deja utilise.");
    error.status = 409;
    throw error;
  }
  await supabaseRequest("/rest/v1/creator_states?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([
      {
        user_id: userId,
        slug,
        state: next,
        updated_at: new Date().toISOString(),
      },
    ]),
  });
  return next;
}

import { randomBytes } from "crypto";

const defaultState = {
  revision: 0,
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
    clicks: 0,
    leads: 0,
    checkouts: 0,
    purchases: 0,
    sourceCounts: { Instagram: 0, YouTube: 0, Email: 0, Direct: 0, Other: 0 },
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

export async function sendPlausibleEvent(req, event = {}) {
  const domain = process.env.PLAUSIBLE_DOMAIN?.trim();
  if (!domain) return { sent: false, reason: "PLAUSIBLE_DOMAIN manquante" };
  const host = (process.env.PLAUSIBLE_HOST || "https://plausible.io").replace(/\/$/, "");
  const forwardedFor = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  try {
    const response = await fetch(`${host}/api/event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": req.headers["user-agent"] || "Expertly-Tracker/1.0",
        ...(forwardedFor ? { "X-Forwarded-For": forwardedFor } : {}),
      },
      body: JSON.stringify({
        domain,
        name: event.name || "pageview",
        url: event.url || `https://${req.headers.host || domain}/`,
        referrer: event.referrer || undefined,
        props: event.props || undefined,
        revenue: event.revenue || undefined,
      }),
    });
    return {
      sent: response.ok && response.headers.get("x-plausible-dropped") !== "1",
      status: response.status,
    };
  } catch (error) {
    return { sent: false, reason: error.message };
  }
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
    revision: Math.max(0, Number(input.revision || 0)),
    profile: {
      ...defaultState.profile,
      ...(input.profile || {}),
      slug: slugify(input.profile?.slug || input.profile?.creatorName || defaultState.profile.slug),
    },
    products: Array.isArray(input.products) ? input.products : [],
    pages: Array.isArray(input.pages)
      ? input.pages.map((page) => ({ ...page, status: "published" }))
      : [],
    contacts: Array.isArray(input.contacts) ? input.contacts : [],
    orders: Array.isArray(input.orders) ? input.orders : [],
    analytics: {
      ...defaultState.analytics,
      ...(input.analytics || {}),
      sourceCounts: {
        ...defaultState.analytics.sourceCounts,
        ...(input.analytics?.sourceCounts || {}),
      },
    },
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

const rateLimitBuckets = globalThis.__expertlyRateLimitBuckets || new Map();
globalThis.__expertlyRateLimitBuckets = rateLimitBuckets;

export async function assertRateLimit(req, bucket, limit = 30, windowMs = 60_000) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  const clientIp = forwarded || req.socket?.remoteAddress || "unknown";

  if (hasSupabaseServerConfig()) {
    // Production: durable rate limiting via Supabase RPC.
    // Raw IP never stored -- the RPC hashes it server-side with SHA-256.
    // rate_limit_exceeded -> 429. Any other RPC error -> log + 503 (fail-closed).
    // NEVER falls back to in-memory in production.
    try {
      await supabaseRequest("/rest/v1/rpc/assert_rate_limit", {
        method: "POST",
        body: JSON.stringify({ p_ip: clientIp, p_bucket: bucket, p_limit: limit, p_window_ms: windowMs }),
      });
    } catch (err) {
      if (/rate_limit_exceeded/i.test(err.message)) {
        const error = new Error("Trop de requetes. Reessaie dans quelques minutes.");
        error.status = 429;
        throw error;
      }
      // RPC unavailable (not yet deployed, transient DB error): log + fail-closed.
      // Accepting the request silently would bypass rate limiting entirely in production.
      console.error("[rate-limit] RPC indisponible:", err.message);
      const error = new Error("Service temporairement indisponible. Reessaie dans quelques instants.");
      error.status = 503;
      throw error;
    }
    return;
  }

  // Development only: in-memory bucket (resets between instances, never used in production).
  const key = `${bucket}:${clientIp}`;
  const now = Date.now();
  const current = rateLimitBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  current.count += 1;
  if (current.count > limit) {
    const error = new Error("Trop de requetes. Reessaie dans quelques minutes.");
    error.status = 429;
    throw error;
  }
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
    const error = new Error(data?.message || data?.error_description || `Supabase HTTP ${response.status}`);
    error.status = response.status;
    error.code = data?.code || "";
    throw error;
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

export function enforcePlanState(plan, state) {
  const normalized = normalizeState(state);
  if (plan === "launch" && normalized.products.length > 5) {
    const error = new Error("Le plan Launch est limité à 5 produits. Passe au plan Scale pour en ajouter davantage.");
    error.status = 403;
    throw error;
  }
  return normalized;
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

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function accessEmailHtml({ customerName, product, url }) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f6f6fb;font-family:Arial,sans-serif;color:#17172a">
    <div style="max-width:560px;margin:0 auto;padding:40px 20px">
      <div style="background:#fff;border-radius:18px;padding:32px;border:1px solid #e8e8ef">
        <div style="font-size:13px;font-weight:700;color:#6558f5;text-transform:uppercase">Expertly</div>
        <h1 style="font-size:26px;margin:14px 0 10px">Ton acces est disponible</h1>
        <p style="line-height:1.6;color:#646579">Bonjour ${escapeHtml(customerName)}, ton acces a <strong>${escapeHtml(product.title)}</strong> est pret.</p>
        <a href="${escapeHtml(url)}" style="display:inline-block;margin-top:18px;padding:14px 20px;border-radius:10px;background:#6558f5;color:#fff;text-decoration:none;font-weight:700">Acceder au produit</a>
      </div>
    </div></body></html>`;
}

// Envoie l'email d'acces via Resend. Renvoie {sent:false} si la cle n'est pas configuree
// (au lieu de lever) pour que le paiement reste enregistre meme sans email.
export async function sendAccessEmail({ customerName, customerEmail, product, url, orderId, deliveryKey = "initial" }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "RESEND_API_KEY manquante" };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `expertly-access-${orderId}-${deliveryKey}`,
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "Expertly <onboarding@resend.dev>",
      to: [customerEmail],
      subject: `Ton acces a ${product.title}`,
      html: accessEmailHtml({ customerName, product, url }),
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.message || "Resend a refuse l'email.");
  return { sent: true, id: result.id };
}

// Met a jour uniquement le statut de livraison email d'une commande via RPC SQL atomique.
// N'ecrase pas le state JSON complet -- incremente la revision CAS pour bloquer
// toute sauvegarde concurrente basee sur l'ancienne revision.
// Les erreurs propagent : l'appelant decide du comportement (log, reponse webhook).
export async function updateOrderEmailStatus(userId, { orderId, emailStatus, emailId = null, emailError = null, deliveredAt = null }) {
  await supabaseRequest("/rest/v1/rpc/update_order_email_status", {
    method: "POST",
    body: JSON.stringify({
      p_user_id: userId,
      p_order_id: orderId,
      p_email_status: emailStatus,
      p_email_id: emailId,
      p_email_error: emailError,
      p_delivered_at: deliveredAt,
    }),
  });
}

export async function saveCreatorState(userId, state) {
  const next = normalizeState(state);
  const slug = next.profile.slug;
  try {
    const saved = await supabaseRequest("/rest/v1/rpc/save_creator_state_cas", {
      method: "POST",
      body: JSON.stringify({
        p_user_id: userId,
        p_slug: slug,
        p_state: next,
        p_expected_revision: next.revision,
      }),
    });
    return normalizeState(saved);
  } catch (error) {
    if (/state_conflict/i.test(error.message)) {
      error.status = 409;
      error.message = "Les donnees ont change dans une autre session. Recharge la page puis reessaie.";
      throw error;
    }
    if (/slug_conflict/i.test(error.message)) {
      error.status = 409;
      error.message = "Cet identifiant de boutique est deja utilise.";
      throw error;
    }
    if (error.code !== "PGRST202" && !/save_creator_state_cas/i.test(error.message)) throw error;
  }

  // Compatibilite temporaire tant que la migration CAS n'a pas ete appliquee.
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
        state: { ...next, revision: next.revision + 1 },
        updated_at: new Date().toISOString(),
      },
    ]),
  });
  return normalizeState({ ...next, revision: next.revision + 1 });
}

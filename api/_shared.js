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
  if (!response.ok) throw new Error(data?.message || data?.error_description || `Supabase HTTP ${response.status}`);
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

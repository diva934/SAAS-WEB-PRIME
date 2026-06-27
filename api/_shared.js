export const plans = {
  launch: {
    name: "Expertly Launch",
    description: "1 boutique, 5 produits et lead magnets.",
    amount: 1900,
  },
  scale: {
    name: "Expertly Scale",
    description: "Produits illimités, upsells et emails automatisés.",
    amount: 4900,
  },
  studio: {
    name: "Expertly Studio",
    description: "Multi-marques, affiliation avancée et support prioritaire.",
    amount: 14900,
  },
};

export class ApiError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

export function sendJson(res, status, body) {
  res.status(status).json(body);
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 20_000) throw new ApiError("Requête trop volumineuse.", 413);
  }
  return JSON.parse(body || "{}");
}

export async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new ApiError("Configuration serveur incomplète.", 503);
  return value;
}

export function appOrigin(req) {
  const configured = process.env.APP_URL?.trim();
  if (configured?.startsWith("http")) return new URL(configured).origin;
  return `https://${req.headers.host}`;
}

export function crmOrigin() {
  const configured = process.env.CRM_APP_URL?.trim();
  return configured?.startsWith("http")
    ? new URL(configured).origin
    : "https://expertly-client-app.vercel.app";
}

function supabaseConfig() {
  return {
    url: requiredEnv("SUPABASE_URL").replace(/\/$/, ""),
    anonKey: requiredEnv("SUPABASE_ANON_KEY"),
    serviceKey: requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function createSupabaseUser({ email, password, firstName }) {
  const { url, serviceKey } = supabaseConfig();
  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, source: "expertly_checkout" },
    }),
  });
  return { response, data: await parseResponse(response) };
}

async function verifySupabasePassword({ email, password }) {
  const { url, anonKey } = supabaseConfig();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await parseResponse(response);
  if (!response.ok || !data?.user?.id) {
    throw new ApiError("Un compte existe déjà avec cet email. Utilise son mot de passe actuel.", 409);
  }
  return data.user;
}

export async function ensureCreatorAccount({ email, password, firstName }) {
  const cleanEmail = String(email || "").trim().toLowerCase().slice(0, 180);
  const cleanName = String(firstName || "").trim().slice(0, 80);
  const cleanPassword = String(password || "");

  if (!cleanName) throw new ApiError("Ton prénom est requis.", 400);
  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) throw new ApiError("Adresse email invalide.", 400);
  if (cleanPassword.length < 8) throw new ApiError("Le mot de passe doit contenir au moins 8 caractères.", 400);

  const { response, data } = await createSupabaseUser({
    email: cleanEmail,
    password: cleanPassword,
    firstName: cleanName,
  });

  if (response.ok && data?.id) return { user: data, email: cleanEmail, firstName: cleanName };

  const errorText = String(data?.msg || data?.message || data?.error_description || "").toLowerCase();
  if ([400, 409, 422].includes(response.status) && /exist|register|already|utilis/.test(errorText)) {
    const user = await verifySupabasePassword({ email: cleanEmail, password: cleanPassword });
    return { user, email: cleanEmail, firstName: cleanName };
  }

  throw new ApiError("Impossible de créer le compte Expertly pour le moment.", 502);
}

export async function stripeRequest(path, options = {}) {
  const secretKey = requiredEnv("STRIPE_SECRET_KEY");
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(options.headers || {}),
    },
  });
  const data = await parseResponse(response);
  if (!response.ok) throw new ApiError(data?.error?.message || "Stripe est temporairement indisponible.", 502);
  return data;
}

export async function saveSubscription({ userId, plan, status }) {
  if (!userId || !plans[plan]) throw new ApiError("Abonnement Expertly invalide.", 400);
  const { url, serviceKey } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/subscriptions?on_conflict=user_id`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify([{ user_id: userId, status, plan }]),
  });
  if (!response.ok) {
    await parseResponse(response);
    throw new ApiError("Le paiement est confirmé, mais l’accès CRM n’a pas pu être activé.", 502);
  }
}

export function publicError(error) {
  if (error instanceof SyntaxError) return { status: 400, message: "Requête invalide." };
  return {
    status: Number(error?.status) || 500,
    message: error?.message || "Erreur interne.",
  };
}

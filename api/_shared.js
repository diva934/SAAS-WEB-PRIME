const plans = {
  launch: {
    name: "OfferLab Launch",
    description: "1 boutique, 5 produits et lead magnets.",
    amount: 1900,
  },
  scale: {
    name: "OfferLab Scale",
    description: "Produits illimites, upsells et emails automatises.",
    amount: 4900,
  },
  studio: {
    name: "OfferLab Studio",
    description: "Multi-marques, affiliation avancee et support prioritaire.",
    amount: 14900,
  },
};

function crmAppUrl() {
  return process.env.CRM_APP_URL || "http://localhost:4310";
}

function appOrigin(req) {
  if (process.env.APP_URL?.startsWith("http")) return new URL(process.env.APP_URL).origin;
  return `https://${req.headers.host}`;
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10_000) throw new Error("Requete trop volumineuse.");
  }
  return JSON.parse(body || "{}");
}

function cleanAffiliateRef(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 48);
}

async function stripeSession(sessionId) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("Stripe n'est pas configure.");
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const session = await response.json();
  if (!response.ok) throw new Error(session?.error?.message || "Session Stripe introuvable.");
  return session;
}

function isPaidSubscription(session) {
  return (
    session.status === "complete" &&
    session.payment_status === "paid" &&
    session.mode === "subscription" &&
    Boolean(plans[session.metadata?.offerlab_plan])
  );
}

async function supabaseService(path, options = {}) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase service role manquante.");
  const response = await fetch(`${url.replace(/\/$/, "")}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.error_description || `Supabase HTTP ${response.status}`);
  return data;
}

async function supabaseUserFromToken(token) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase n'est pas configure.");
  if (!token) throw new Error("Connexion Supabase requise.");
  const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
  });
  const user = await response.json();
  if (!response.ok || !user?.id) throw new Error("Session Supabase invalide.");
  return user;
}

async function activateSupabaseSubscription(session, user) {
  const email = user.email || session.customer_details?.email || session.customer_email || "";
  const plan = session.metadata?.offerlab_plan;
  await supabaseService("/rest/v1/profiles", {
    method: "POST",
    body: JSON.stringify([{ id: user.id, email }]),
  });
  await supabaseService("/rest/v1/subscriptions?on_conflict=user_id", {
    method: "POST",
    body: JSON.stringify([
      {
        user_id: user.id,
        email,
        plan,
        status: "active",
        stripe_customer_id: session.customer || null,
        stripe_subscription_id: session.subscription || null,
        updated_at: new Date().toISOString(),
      },
    ]),
  });
}

module.exports = {
  activateSupabaseSubscription,
  appOrigin,
  cleanAffiliateRef,
  crmAppUrl,
  isPaidSubscription,
  plans,
  readJson,
  sendJson,
  stripeSession,
  supabaseUserFromToken,
};

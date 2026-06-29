import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, timingSafeEqual } from "node:crypto";

const root = fileURLToPath(new URL(".", import.meta.url));
const affiliateDataPath = join(root, "affiliate-data.json");
let affiliateWriteQueue = Promise.resolve();

async function loadLocalEnv() {
  try {
    const content = await readFile(join(root, ".env"), "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 1) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // Le fichier .env est optionnel si les variables sont fournies par l'hébergeur.
  }
}

await loadLocalEnv();

const port = Number(process.env.PORT || 4242);
const crmAppUrl = process.env.CRM_APP_URL || "http://localhost:4310";
const plans = {
  launch: {
    name: "OfferLab Launch",
    description: "1 boutique, 5 produits et lead magnets.",
    amount: 1900,
  },
  scale: {
    name: "OfferLab Scale",
    description: "Produits illimités, upsells et emails automatisés.",
    amount: 4900,
  },
  studio: {
    name: "OfferLab Studio",
    description: "Multi-marques, affiliation avancée et support prioritaire.",
    amount: 14900,
  },
};

const defaultAffiliateData = {
  affiliates: [
    {
      id: "aff_demo",
      name: "Influenceur Demo",
      slug: "demo",
      email: "affiliate@example.com",
      commissionRate: 0.3,
      commissionType: "recurring_6_months",
      status: "active",
      payoutStatus: "manual",
      createdAt: new Date().toISOString(),
    },
  ],
  clicks: [],
  customers: [],
  commissions: [],
};

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  response.end(JSON.stringify(body));
}

function publicConfig() {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL || "",
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
    CRM_APP_URL: crmAppUrl,
  };
}

function injectPublicConfig(file, safePath) {
  if (!["index.html", "activation.html"].includes(safePath)) return file;
  let html = file.toString("utf8");
  for (const [key, value] of Object.entries(publicConfig())) {
    html = html.replaceAll(`%${key}%`, String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"'));
  }
  return Buffer.from(html, "utf8");
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
  if (!url || !anonKey) throw new Error("Supabase n'est pas configuré.");
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

async function activateSupabaseSubscription(session, user = null) {
  const userId = user?.id || session.metadata?.supabase_user_id;
  if (!userId) return null;
  const email = user?.email || session.metadata?.user_email || session.customer_details?.email || session.customer_email || "";
  const plan = session.metadata?.offerlab_plan;
  await supabaseService("/rest/v1/profiles", {
    method: "POST",
    body: JSON.stringify([{ id: userId, email }]),
  });
  await supabaseService("/rest/v1/subscriptions?on_conflict=user_id", {
    method: "POST",
    body: JSON.stringify([
      {
        user_id: userId,
        email,
        plan,
        status: "active",
        stripe_customer_id: session.customer || null,
        stripe_subscription_id: session.subscription || null,
        updated_at: new Date().toISOString(),
      },
    ]),
  });
  return { userId, plan };
}

function cleanAffiliateRef(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 48);
}

async function readAffiliateData() {
  try {
    const data = JSON.parse(await readFile(affiliateDataPath, "utf8"));
    return {
      affiliates: Array.isArray(data.affiliates) ? data.affiliates : [],
      clicks: Array.isArray(data.clicks) ? data.clicks : [],
      customers: Array.isArray(data.customers) ? data.customers : [],
      commissions: Array.isArray(data.commissions) ? data.commissions : [],
    };
  } catch {
    await writeAffiliateData(defaultAffiliateData);
    return structuredClone(defaultAffiliateData);
  }
}

async function writeAffiliateData(data) {
  affiliateWriteQueue = affiliateWriteQueue.then(() =>
    writeFile(affiliateDataPath, `${JSON.stringify(data, null, 2)}\n`, "utf8"),
  );
  await affiliateWriteQueue;
}

function findAffiliate(data, ref) {
  const slug = cleanAffiliateRef(ref);
  return data.affiliates.find((affiliate) => affiliate.slug === slug && affiliate.status === "active");
}

function commissionFor(affiliate, amount) {
  return Math.round(Number(amount || 0) * Number(affiliate.commissionRate || 0));
}

async function recordAffiliateClick({ affiliateRef, visitorId, landingPage, referrer }) {
  const data = await readAffiliateData();
  const affiliate = findAffiliate(data, affiliateRef);
  if (!affiliate) return { tracked: false };
  data.clicks.push({
    id: `clk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    affiliateSlug: affiliate.slug,
    visitorId: String(visitorId || ""),
    landingPage: String(landingPage || "/").slice(0, 300),
    referrer: String(referrer || "").slice(0, 300),
    createdAt: new Date().toISOString(),
  });
  await writeAffiliateData(data);
  return { tracked: true };
}

async function recordAffiliateCommission(session) {
  const affiliateRef = cleanAffiliateRef(session.metadata?.affiliate_ref);
  if (!affiliateRef) return null;
  const data = await readAffiliateData();
  const affiliate = findAffiliate(data, affiliateRef);
  if (!affiliate) return null;
  if (data.commissions.some((commission) => commission.stripeSessionId === session.id)) {
    return data.commissions.find((commission) => commission.stripeSessionId === session.id);
  }
  const planId = session.metadata?.offerlab_plan;
  const plan = plans[planId];
  const paidAmount = Number(session.amount_total || plan?.amount || 0);
  const commissionAmount = commissionFor(affiliate, paidAmount);
  const customerEmail = session.customer_details?.email || session.customer_email || "";
  const now = new Date().toISOString();

  if (!data.customers.some((customer) => customer.stripeCustomerId === session.customer)) {
    data.customers.push({
      id: `ac_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      affiliateSlug: affiliate.slug,
      visitorId: session.metadata?.visitor_id || "",
      stripeCustomerId: session.customer || "",
      customerEmail,
      plan: planId,
      firstPaymentAt: now,
    });
  }

  const commission = {
    id: `comm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    affiliateSlug: affiliate.slug,
    stripeSessionId: session.id,
    stripeCustomerId: session.customer || "",
    stripeSubscriptionId: session.subscription || "",
    customerEmail,
    plan: planId,
    amountPaid: paidAmount,
    commissionRate: affiliate.commissionRate,
    commissionAmount,
    status: "pending",
    createdAt: now,
  };
  data.commissions.push(commission);
  await writeAffiliateData(data);
  return commission;
}

function affiliateSummary(data) {
  return data.affiliates.map((affiliate) => {
    const clicks = data.clicks.filter((click) => click.affiliateSlug === affiliate.slug);
    const customers = data.customers.filter((customer) => customer.affiliateSlug === affiliate.slug);
    const commissions = data.commissions.filter((commission) => commission.affiliateSlug === affiliate.slug);
    const pending = commissions
      .filter((commission) => commission.status === "pending" || commission.status === "approved")
      .reduce((sum, commission) => sum + commission.commissionAmount, 0);
    const paid = commissions
      .filter((commission) => commission.status === "paid")
      .reduce((sum, commission) => sum + commission.commissionAmount, 0);
    const revenue = commissions.reduce((sum, commission) => sum + commission.amountPaid, 0);
    return {
      ...affiliate,
      link: `/?ref=${affiliate.slug}`,
      clicks: clicks.length,
      customers: customers.length,
      conversions: commissions.length,
      revenue,
      pending,
      paid,
    };
  });
}

function canAccessAffiliateAdmin(request) {
  const token = process.env.AFFILIATE_ADMIN_TOKEN;
  if (!token) return true;
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  return url.searchParams.get("token") === token || request.headers["x-admin-token"] === token;
}

function accessSecret() {
  return process.env.ACCESS_TOKEN_SECRET || process.env.STRIPE_SECRET_KEY || "offerlab-local-only";
}

function signAccessToken(sessionId) {
  const payload = Buffer.from(
    JSON.stringify({
      sessionId,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", accessSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function hasValidAccess(request) {
  const cookieHeader = request.headers.cookie || "";
  const cookies = Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value),
  );
  const token = cookies.offerlab_access;
  if (!token) return false;

  try {
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return false;
    const expected = createHmac("sha256", accessSecret()).update(payload).digest("base64url");
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      return false;
    }
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Boolean(data.sessionId) && Number(data.expiresAt) > Date.now();
  } catch {
    return false;
  }
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 10_000) throw new Error("Requête trop volumineuse.");
  }
  return JSON.parse(body || "{}");
}

async function createCheckoutSession(request, response) {
  const { plan: planId, affiliateRef, visitorId } = await readJson(request);
  const plan = plans[planId];
  if (!plan) {
    sendJson(response, 400, { error: "Formule inconnue." });
    return;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    sendJson(response, 503, {
      error: "Stripe n’est pas configuré. Ajoute STRIPE_SECRET_KEY dans le fichier .env du serveur.",
    });
    return;
  }

  let origin;
  try {
    const configuredUrl = new URL(process.env.APP_URL || `http://localhost:${port}`);
    if (!["http:", "https:"].includes(configuredUrl.protocol)) throw new Error();
    origin = configuredUrl.origin;
  } catch {
    sendJson(response, 503, { error: "APP_URL n’est pas une URL HTTP valide." });
    return;
  }
  const affiliateSlug = cleanAffiliateRef(affiliateRef);
  const affiliateData = affiliateSlug ? await readAffiliateData() : null;
  const validAffiliate = affiliateData ? findAffiliate(affiliateData, affiliateSlug) : null;
  const form = new URLSearchParams({
    mode: "subscription",
    success_url: `${origin}/api/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/index.html?payment=cancelled#pricing`,
    locale: "fr",
    billing_address_collection: "required",
    allow_promotion_codes: "true",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(plan.amount),
    "line_items[0][price_data][recurring][interval]": "month",
    "line_items[0][price_data][product_data][name]": plan.name,
    "line_items[0][price_data][product_data][description]": plan.description,
    "metadata[offerlab_plan]": planId,
    "metadata[affiliate_ref]": validAffiliate?.slug || "",
    "metadata[visitor_id]": String(visitorId || "").slice(0, 80),
    "subscription_data[metadata][offerlab_plan]": planId,
    "subscription_data[metadata][affiliate_ref]": validAffiliate?.slug || "",
    "subscription_data[metadata][visitor_id]": String(visitorId || "").slice(0, 80),
  });

  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  const session = await stripeResponse.json();

  if (!stripeResponse.ok || !session.url) {
    console.error("Stripe Checkout error:", session);
    sendJson(response, 502, {
      error: session?.error?.message || "Stripe n’a pas pu créer la page de paiement.",
    });
    return;
  }

  sendJson(response, 200, { url: session.url });
}

async function completeCheckout(request, response) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const sessionId = requestUrl.searchParams.get("session_id");

  if (!secretKey || !sessionId?.startsWith("cs_")) {
    response.writeHead(302, { Location: "/index.html?payment=cancelled#pricing" });
    response.end();
    return;
  }

  const stripeResponse = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } },
  );
  const session = await stripeResponse.json();
  const paid =
    stripeResponse.ok &&
    session.status === "complete" &&
    session.payment_status === "paid" &&
    session.mode === "subscription" &&
    Boolean(plans[session.metadata?.offerlab_plan]);

  if (!paid) {
    response.writeHead(302, { Location: "/index.html?payment=cancelled#pricing" });
    response.end();
    return;
  }

  await recordAffiliateCommission(session);

  const secureCookie = (process.env.APP_URL || "").startsWith("https://") ? "; Secure" : "";
  response.writeHead(302, {
    Location: `/activation.html?session_id=${encodeURIComponent(session.id)}`,
    "Set-Cookie": `offerlab_access=${signAccessToken(session.id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secureCookie}`,
    "Cache-Control": "no-store",
  });
  response.end();
}

async function handleActivateAccount(request, response) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    sendJson(response, 503, { error: "Stripe n'est pas configuré." });
    return;
  }
  const authHeader = request.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const { sessionId } = await readJson(request);
  if (!sessionId?.startsWith("cs_")) {
    sendJson(response, 400, { error: "Session Stripe invalide." });
    return;
  }

  let user;
  try {
    user = await supabaseUserFromToken(token);
  } catch (error) {
    sendJson(response, 401, { error: error.message || "Connexion Supabase requise." });
    return;
  }
  const stripeResponse = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } },
  );
  const session = await stripeResponse.json();
  const paid =
    stripeResponse.ok &&
    session.status === "complete" &&
    session.payment_status === "paid" &&
    session.mode === "subscription" &&
    Boolean(plans[session.metadata?.offerlab_plan]);

  if (!paid) {
    sendJson(response, 402, { error: "Paiement non confirmé." });
    return;
  }

  try {
    await recordAffiliateCommission(session);
    await activateSupabaseSubscription(session, user);
  } catch (error) {
    sendJson(response, 503, { error: error.message || "Activation Supabase impossible." });
    return;
  }
  sendJson(response, 200, {
    activated: true,
    crmUrl: `${crmAppUrl.replace(/\/$/, "")}/?payment=success`,
  });
}

async function handleAffiliateClick(request, response) {
  const body = await readJson(request);
  const result = await recordAffiliateClick({
    affiliateRef: body.affiliateRef,
    visitorId: body.visitorId,
    landingPage: body.landingPage,
    referrer: body.referrer,
  });
  sendJson(response, 200, result);
}

async function handleAffiliateAdmin(request, response) {
  if (!canAccessAffiliateAdmin(request)) {
    sendJson(response, 401, { error: "Token admin requis." });
    return;
  }
  const data = await readAffiliateData();
  sendJson(response, 200, {
    affiliates: affiliateSummary(data),
    commissions: data.commissions.slice().reverse(),
    clicks: data.clicks.slice(-200).reverse(),
    customers: data.customers.slice().reverse(),
  });
}

async function serveStatic(request, response) {
  const requestedPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relativePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");
  const safePath = normalize(relativePath);

  if (safePath.startsWith("..") || safePath.includes(".env")) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  if (safePath === "app.html" && !hasValidAccess(request)) {
    response.writeHead(302, {
      Location: "/index.html#pricing",
      "Cache-Control": "no-store",
    });
    response.end();
    return;
  }

  try {
    const file = injectPublicConfig(await readFile(join(root, safePath)), safePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(safePath).toLowerCase()] || "application/octet-stream",
    });
    response.end(file);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Page introuvable");
  }
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS" && request.url?.startsWith("/api/")) {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token, Authorization",
      });
      response.end();
      return;
    }
    if (request.method === "POST" && request.url === "/api/affiliate-click") {
      await handleAffiliateClick(request, response);
      return;
    }
    if (request.method === "GET" && request.url?.startsWith("/api/affiliate-admin")) {
      await handleAffiliateAdmin(request, response);
      return;
    }
    if (request.method === "POST" && request.url === "/api/create-checkout-session") {
      await createCheckoutSession(request, response);
      return;
    }
    if (request.method === "POST" && request.url === "/api/activate-account") {
      await handleActivateAccount(request, response);
      return;
    }
    if (request.method === "GET" && request.url.startsWith("/api/checkout-success?")) {
      await completeCheckout(request, response);
      return;
    }
    if (request.method === "GET" || request.method === "HEAD") {
      await serveStatic(request, response);
      return;
    }
    response.writeHead(405);
    response.end("Method not allowed");
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Erreur interne du serveur." });
  }
});

server.listen(port, () => {
  console.log(`OfferLab disponible sur http://localhost:${port}`);
});

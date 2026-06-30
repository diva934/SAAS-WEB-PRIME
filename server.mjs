import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const dataPath = join(root, "data.json");

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
    // Les variables peuvent aussi être fournies par l’hébergeur.
  }
}

await loadLocalEnv();

const port = Number(process.env.PORT || 4310);
const appUrl = process.env.APP_URL || `http://localhost:${port}`;
const marketingUrl = process.env.MARKETING_URL || "https://saas-web-prime.vercel.app";
const umamiHostUrl = (process.env.UMAMI_HOST_URL || "https://cloud.umami.is").replace(/\/$/, "");
const umamiWebsiteId = process.env.UMAMI_WEBSITE_ID || "";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
};

let writeQueue = Promise.resolve();

async function trackUmami(name, data = {}, options = {}) {
  if (!umamiWebsiteId) return;
  try {
    const parsedAppUrl = new URL(appUrl);
    const result = await fetch(`${umamiHostUrl}/api/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": options.userAgent || "Expertly-Server/1.0",
      },
      body: JSON.stringify({
        type: "event",
        payload: {
          website: umamiWebsiteId,
          hostname: parsedAppUrl.hostname,
          language: options.language || "fr-FR",
          referrer: options.referrer || "",
          screen: options.screen || "server",
          title: options.title || "Expertly",
          url: options.url || "/",
          id: options.distinctId || undefined,
          name,
          data: {
            product: "expertly",
            environment: process.env.NODE_ENV || "development",
            ...data,
          },
        },
      }),
    });
    if (!result.ok) throw new Error(`Umami HTTP ${result.status}`);
  } catch (error) {
    console.error(JSON.stringify({ level: "warn", message: "umami_track_failed", event: name, error: error.message }));
  }
}

async function readState() {
  return JSON.parse(await readFile(dataPath, "utf8"));
}

async function writeState(state) {
  writeQueue = writeQueue.then(() => writeFile(dataPath, `${JSON.stringify(state, null, 2)}\n`, "utf8"));
  await writeQueue;
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  response.end(JSON.stringify(value));
}

function publicConfig() {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL || "",
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
    MARKETING_URL: marketingUrl,
  };
}

function injectPublicConfig(file, safePath) {
  if (safePath !== "index.html") return file;
  let html = file.toString("utf8");
  for (const [key, value] of Object.entries(publicConfig())) {
    html = html.replaceAll(`%${key}%`, String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"'));
  }
  return Buffer.from(html, "utf8");
}

function shouldProtectCreatorApi() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

function bearerToken(request) {
  const header = request.headers.authorization || "";
  return header.replace(/^Bearer\s+/i, "").trim();
}

async function supabaseService(path, options = {}) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante.");
  const result = await fetch(`${url.replace(/\/$/, "")}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await result.text();
  const data = text ? JSON.parse(text) : null;
  if (!result.ok) throw new Error(data?.message || data?.error_description || `Supabase HTTP ${result.status}`);
  return data;
}

async function verifyCreatorAccess(request) {
  if (!shouldProtectCreatorApi()) return { allowed: true };
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { allowed: false, status: 503, error: "SUPABASE_SERVICE_ROLE_KEY manquante sur le serveur CRM." };
  }
  const token = bearerToken(request);
  if (!token) return { allowed: false, status: 401, error: "Connexion requise." };

  const url = process.env.SUPABASE_URL.replace(/\/$/, "");
  const userResponse = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  const user = await userResponse.json();
  if (!userResponse.ok || !user?.id) return { allowed: false, status: 401, error: "Session Supabase invalide." };

  const rows = await supabaseService(
    `/rest/v1/subscriptions?select=user_id,status,plan&user_id=eq.${encodeURIComponent(user.id)}&status=eq.active&limit=1`,
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    return { allowed: false, status: 403, error: "Aucun abonnement actif pour ce compte." };
  }
  return { allowed: true, user, subscription: rows[0] };
}

async function requireCreatorAccess(request, response) {
  const access = await verifyCreatorAccess(request);
  if (access.allowed) return true;
  sendJson(response, access.status || 403, { error: access.error || "Acces refuse." });
  return false;
}

async function readBody(request, limit = 2_000_000) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > limit) throw new Error("Payload too large");
  }
  return body;
}

async function readJson(request) {
  return JSON.parse((await readBody(request)) || "{}");
}

function cleanFirstName(value) {
  return String(value || "")
    .trim()
    .replace(/[^\p{L}\p{M}' -]/gu, "")
    .slice(0, 40);
}

function publicStoreState(state) {
  return {
    profile: state.profile,
    products: state.products
      .filter((product) => product.status === "published")
      .map(({ fileName, ...product }) => product),
  };
}

function publicSalesPage(state, slug) {
  const page = state.pages.find((item) => item.slug === slug && item.status === "published");
  if (!page) return null;
  const product = state.products.find((item) => item.id === page.productId && item.status === "published");
  if (!product) return null;
  const { fileName, ...publicProduct } = product;
  return {
    page,
    product: publicProduct,
    profile: {
      creatorName: state.profile.creatorName,
      creatorRole: state.profile.creatorRole,
    },
  };
}

function accessUrl(token) {
  return `${appUrl}/access.html?token=${encodeURIComponent(token)}`;
}

function emailHtml({ customerName, product, token }) {
  return `
    <!doctype html>
    <html lang="fr">
      <body style="margin:0;background:#f6f6fb;font-family:Arial,sans-serif;color:#17172a">
        <div style="max-width:560px;margin:0 auto;padding:40px 20px">
          <div style="background:#fff;border-radius:18px;padding:32px;border:1px solid #e8e8ef">
            <div style="font-size:13px;font-weight:700;color:#6558f5;text-transform:uppercase">Expertly</div>
            <h1 style="font-size:26px;margin:14px 0 10px">Ton accès est disponible</h1>
            <p style="line-height:1.6;color:#646579">Bonjour ${customerName}, ton paiement pour <strong>${product.title}</strong> est confirmé.</p>
            <a href="${accessUrl(token)}" style="display:inline-block;margin-top:18px;padding:14px 20px;border-radius:10px;background:#6558f5;color:#fff;text-decoration:none;font-weight:700">Accéder au produit</a>
            <p style="margin-top:22px;font-size:12px;color:#9292a3">Ce lien est personnel. Conserve cet email pour retrouver ton accès.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

async function sendAccessEmail({ customerName, customerEmail, product, token, orderId }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "RESEND_API_KEY manquante" };

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `expertly-access-${orderId}`,
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "Expertly <onboarding@resend.dev>",
      to: [customerEmail],
      subject: `Ton accès à ${product.title}`,
      html: emailHtml({ customerName, product, token }),
    }),
  });
  const result = await resendResponse.json();
  if (!resendResponse.ok) throw new Error(result?.message || "Resend a refusé l’email.");
  return { sent: true, id: result.id };
}

async function fulfillOrder({
  productId,
  customerName,
  customerEmail,
  stripeSessionId = null,
  distinctId = null,
  salesPageSlug = null,
}) {
  const state = await readState();
  if (stripeSessionId) {
    const existing = state.orders.find((order) => order.stripeSessionId === stripeSessionId);
    if (existing) return existing;
  }

  const product = state.products.find((item) => item.id === productId && item.status === "published");
  if (!product) throw new Error("Produit introuvable ou non publié.");
  if (!product.fileName) throw new Error("Aucun accès n’est configuré pour ce produit.");

  const now = new Date();
  let contact = state.contacts.find((item) => item.email.toLowerCase() === customerEmail.toLowerCase());
  if (!contact) {
    contact = {
      id: `c_${Date.now()}`,
      name: customerName,
      email: customerEmail,
      segment: "Client",
      activity: "Achat à l’instant",
      value: product.price,
      joined: now.toLocaleDateString("fr-FR"),
    };
    state.contacts.unshift(contact);
  } else {
    contact.name = customerName || contact.name;
    contact.segment = "Client";
    contact.activity = "Achat à l’instant";
    contact.value += product.price;
  }

  const token = randomBytes(24).toString("hex");
  const order = {
    id: `EXP-${String(state.orders.length + 1).padStart(5, "0")}`,
    contactId: contact.id,
    productId: product.id,
    date: now.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }),
    amount: product.price,
    status: "paid",
    stripeSessionId,
    accessToken: token,
    deliveredAt: null,
    emailStatus: "pending",
  };
  state.orders.unshift(order);
  product.sales = (product.sales || 0) + 1;
  state.analytics.purchases = (state.analytics.purchases || 0) + 1;
  const revenueIndex = Math.max((state.analytics.revenueSeries?.length || 1) - 1, 0);
  state.analytics.revenueSeries[revenueIndex] =
    (state.analytics.revenueSeries[revenueIndex] || 0) + product.price;
  await writeState(state);
  await trackUmami(
    "payment_completed",
    {
      boutique_slug: state.profile.slug,
      order_id: order.id,
      product_id: product.id,
      product_title: product.title,
      revenue: product.price,
      currency: "EUR",
      sales_page_slug: salesPageSlug || "",
      stripe_session_id: stripeSessionId || "",
    },
    {
      distinctId: distinctId || contact.id,
      url: salesPageSlug ? `/boutique/${state.profile.slug}/p/${salesPageSlug}` : `/boutique/${state.profile.slug}`,
      title: product.title,
    },
  );

  try {
    const email = await sendAccessEmail({
      customerName,
      customerEmail,
      product,
      token,
      orderId: order.id,
    });
    order.emailStatus = email.sent ? "sent" : "not_configured";
    order.deliveredAt = email.sent ? new Date().toISOString() : null;
    order.emailId = email.id || null;
    await trackUmami(
      email.sent ? "access_email_sent" : "access_email_not_configured",
      { boutique_slug: state.profile.slug, order_id: order.id, product_id: product.id },
      { distinctId: distinctId || contact.id, url: `/boutique/${state.profile.slug}/access` },
    );
  } catch (error) {
    order.emailStatus = "failed";
    order.emailError = error.message;
    await trackUmami(
      "access_email_failed",
      { boutique_slug: state.profile.slug, order_id: order.id, product_id: product.id, error: error.message },
      { distinctId: distinctId || contact.id, url: `/boutique/${state.profile.slug}/access` },
    );
  }

  const refreshed = await readState();
  const storedOrder = refreshed.orders.find((item) => item.id === order.id);
  Object.assign(storedOrder, order);
  await writeState(refreshed);
  return order;
}

async function createCheckout(request, response) {
  const { productId, customerName, customerEmail, distinctId, salesPageSlug, source } = await readJson(request);
  const state = await readState();
  const product = state.products.find((item) => item.id === productId && item.status === "published");
  if (!product) {
    sendJson(response, 404, { error: "Produit introuvable." });
    return;
  }
  if (!customerName?.trim() || !customerEmail?.includes("@")) {
    sendJson(response, 400, { error: "Nom et email requis." });
    return;
  }
  if (!product.fileName) {
    sendJson(response, 400, { error: "Le vendeur n’a pas encore configuré le lien d’accès." });
    return;
  }

  state.analytics.checkouts = (state.analytics.checkouts || 0) + 1;
  await writeState(state);
  await trackUmami(
    "checkout_started",
    {
      boutique_slug: state.profile.slug,
      product_id: product.id,
      product_title: product.title,
      amount: product.price,
      currency: "EUR",
      sales_page_slug: salesPageSlug || "",
      source: source || "store",
    },
    {
      distinctId: distinctId || undefined,
      url: salesPageSlug ? `/boutique/${state.profile.slug}/p/${salesPageSlug}` : `/boutique/${state.profile.slug}`,
    },
  );

  if (product.price === 0) {
    const order = await fulfillOrder({
      productId,
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim(),
      distinctId,
      salesPageSlug,
    });
    sendJson(response, 200, { free: true, accessUrl: accessUrl(order.accessToken), emailStatus: order.emailStatus });
    return;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    sendJson(response, 503, {
      error: "Stripe n’est pas configuré. Ajoute STRIPE_SECRET_KEY dans .env pour accepter de vrais paiements.",
    });
    return;
  }

  const form = new URLSearchParams({
    mode: "payment",
    success_url: `${appUrl}/api/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/store.html?payment=cancelled`,
    locale: "fr",
    customer_email: customerEmail.trim(),
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(Math.round(product.price * 100)),
    "line_items[0][price_data][product_data][name]": product.title,
    "line_items[0][price_data][product_data][description]": product.description,
    "metadata[productId]": product.id,
    "metadata[customerName]": customerName.trim(),
    "metadata[umamiDistinctId]": String(distinctId || ""),
    "metadata[salesPageSlug]": String(salesPageSlug || ""),
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
    await trackUmami(
      "checkout_creation_failed",
      {
        boutique_slug: state.profile.slug,
        product_id: product.id,
        sales_page_slug: salesPageSlug || "",
        error: session?.error?.message || "stripe_session_failed",
      },
      { distinctId: distinctId || undefined },
    );
    sendJson(response, 502, { error: session?.error?.message || "Stripe n’a pas pu ouvrir le paiement." });
    return;
  }
  await trackUmami(
    "checkout_redirected_to_stripe",
    {
      boutique_slug: state.profile.slug,
      product_id: product.id,
      sales_page_slug: salesPageSlug || "",
      stripe_session_id: session.id,
    },
    { distinctId: distinctId || undefined },
  );
  sendJson(response, 200, { url: session.url });
}

async function resendAccess(request, response) {
  const { orderId } = await readJson(request);
  const state = await readState();
  const order = state.orders.find((item) => item.id === orderId && item.status === "paid");
  const product = order && state.products.find((item) => item.id === order.productId);
  const contact = order && state.contacts.find((item) => item.id === order.contactId);
  if (!order || !product || !contact) {
    sendJson(response, 404, { error: "Commande introuvable ou accès indisponible." });
    return;
  }
  if (!order.accessToken) order.accessToken = randomBytes(24).toString("hex");
  try {
    const email = await sendAccessEmail({
      customerName: contact.name,
      customerEmail: contact.email,
      product,
      token: order.accessToken,
      orderId: order.id,
    });
    order.emailStatus = email.sent ? "sent" : "not_configured";
    order.deliveredAt = email.sent ? new Date().toISOString() : order.deliveredAt || null;
    order.emailId = email.id || order.emailId || null;
    await trackUmami(
      email.sent ? "access_email_resent" : "access_email_resend_not_configured",
      { boutique_slug: state.profile.slug, order_id: order.id, product_id: product.id },
      { distinctId: order.contactId, url: `/boutique/${state.profile.slug}/orders/${order.id}` },
    );
  } catch (error) {
    order.emailStatus = "failed";
    order.emailError = error.message;
    await trackUmami(
      "access_email_resend_failed",
      { boutique_slug: state.profile.slug, order_id: order.id, product_id: product.id, error: error.message },
      { distinctId: order.contactId, url: `/boutique/${state.profile.slug}/orders/${order.id}` },
    );
  }
  await writeState(state);
  sendJson(response, 200, { order });
}

async function retrieveStripeSession(sessionId) {
  const stripeResponse = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } },
  );
  const session = await stripeResponse.json();
  if (!stripeResponse.ok) throw new Error(session?.error?.message || "Session Stripe invalide.");
  return session;
}

async function checkoutSuccess(request, response) {
  const url = new URL(request.url, appUrl);
  const sessionId = url.searchParams.get("session_id");
  if (!process.env.STRIPE_SECRET_KEY || !sessionId?.startsWith("cs_")) {
    response.writeHead(302, { Location: "/store.html?payment=invalid" });
    response.end();
    return;
  }
  const session = await retrieveStripeSession(sessionId);
  if (session.payment_status !== "paid" || session.status !== "complete") {
    response.writeHead(302, { Location: "/store.html?payment=unpaid" });
    response.end();
    return;
  }
  const order = await fulfillOrder({
    productId: session.metadata?.productId,
    customerName: session.metadata?.customerName || session.customer_details?.name || "Client",
    customerEmail: session.customer_details?.email || session.customer_email,
    stripeSessionId: session.id,
    distinctId: session.metadata?.umamiDistinctId || null,
    salesPageSlug: session.metadata?.salesPageSlug || null,
  });
  response.writeHead(302, { Location: `/success.html?order=${encodeURIComponent(order.id)}` });
  response.end();
}

function validStripeSignature(payload, signatureHeader) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;
  const parts = Object.fromEntries(signatureHeader.split(",").map((part) => part.split("=")));
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${payload}`).digest("hex");
  const actualBuffer = Buffer.from(parts.v1);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

async function stripeWebhook(request, response) {
  const payload = await readBody(request);
  if (!validStripeSignature(payload, request.headers["stripe-signature"])) {
    sendJson(response, 400, { error: "Signature Stripe invalide." });
    return;
  }
  const event = JSON.parse(payload);
  if (event.type === "checkout.session.completed" && event.data.object.payment_status === "paid") {
    const session = event.data.object;
    await fulfillOrder({
      productId: session.metadata?.productId,
      customerName: session.metadata?.customerName || session.customer_details?.name || "Client",
      customerEmail: session.customer_details?.email || session.customer_email,
      stripeSessionId: session.id,
      distinctId: session.metadata?.umamiDistinctId || null,
      salesPageSlug: session.metadata?.salesPageSlug || null,
    });
  }
  sendJson(response, 200, { received: true });
}

async function handleLogin(request, response) {
  const url = new URL(request.url || "/", "http://localhost");
  const firstName = cleanFirstName(url.searchParams.get("firstName"));
  if (!firstName) {
    response.writeHead(302, { Location: "/" });
    response.end();
    return;
  }
  const state = await readState();
  state.profile.firstName = firstName;
  state.profile.creatorName = firstName;
  await writeState(state);
  await trackUmami(
    "creator_login",
    { boutique_slug: state.profile.slug, first_name: firstName },
    { distinctId: `creator_${state.profile.slug || "default"}`, url: "/creator/login" },
  );
  response.writeHead(302, {
    Location: "/#overview",
    "Set-Cookie": `expertly_first_name=${encodeURIComponent(firstName)}; Path=/; SameSite=Lax; Max-Age=2592000`,
    "Cache-Control": "no-store",
  });
  response.end();
}

async function handleApi(request, response) {
  if (request.method === "GET" && request.url === "/api/state") {
    if (!(await requireCreatorAccess(request, response))) return true;
    sendJson(response, 200, await readState());
    return true;
  }
  if (request.method === "GET" && request.url?.startsWith("/api/store")) {
    sendJson(response, 200, publicStoreState(await readState()));
    return true;
  }
  if (request.method === "GET" && request.url?.startsWith("/api/page?")) {
    const slug = new URL(request.url, appUrl).searchParams.get("slug");
    const state = await readState();
    const result = publicSalesPage(state, slug);
    if (!result) {
      sendJson(response, 404, { error: "Page indisponible." });
      return true;
    }
    result.page.visits = (result.page.visits || 0) + 1;
    const storedPage = state.pages.find((page) => page.id === result.page.id);
    storedPage.visits = result.page.visits;
    const product = state.products.find((item) => item.id === result.product.id);
    product.views = (product.views || 0) + 1;
    await writeState(state);
    await trackUmami(
      "sales_page_served",
      {
        boutique_slug: state.profile.slug,
        sales_page_id: result.page.id,
        sales_page_slug: result.page.slug,
        product_id: result.product.id,
        layout: result.page.layout,
      },
      { url: `/boutique/${state.profile.slug}/p/${result.page.slug}`, title: result.page.headline },
    );
    sendJson(response, 200, result);
    return true;
  }
  if (request.method === "GET" && request.url === "/api/config") {
    sendJson(response, 200, {
      stripe: Boolean(process.env.STRIPE_SECRET_KEY),
      stripeWebhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      email: Boolean(process.env.RESEND_API_KEY),
      umami: {
        enabled: Boolean(umamiWebsiteId),
        websiteId: umamiWebsiteId || null,
        hostUrl: umamiHostUrl,
        boutiqueSlug: (await readState()).profile.slug,
      },
    });
    return true;
  }
  if (request.method === "GET" && request.url?.startsWith("/api/slug-available")) {
    // Dev local mono-boutique : aucun conflit possible, le slug est toujours dispo.
    const slug = new URL(request.url, appUrl).searchParams.get("slug") || "";
    sendJson(response, 200, { slug, available: true });
    return true;
  }
  if (request.method === "GET" && request.url?.startsWith("/api/access?")) {
    const token = new URL(request.url, appUrl).searchParams.get("token");
    const state = await readState();
    const order = state.orders.find((item) => item.accessToken === token && item.status === "paid");
    const product = order && state.products.find((item) => item.id === order.productId);
    if (!order || !product) sendJson(response, 404, { error: "Lien d’accès invalide." });
    else {
      await trackUmami(
        "product_access_verified",
        { boutique_slug: state.profile.slug, order_id: order.id, product_id: product.id },
        { distinctId: order.contactId, url: `/boutique/${state.profile.slug}/access` },
      );
      sendJson(response, 200, { productTitle: product.title, access: product.fileName, orderId: order.id });
    }
    return true;
  }
  if (request.method === "POST" && request.url === "/api/checkout") {
    await createCheckout(request, response);
    return true;
  }
  if (request.method === "POST" && request.url === "/api/orders/resend-access") {
    if (!(await requireCreatorAccess(request, response))) return true;
    await resendAccess(request, response);
    return true;
  }
  if (request.method === "POST" && request.url === "/api/events/visit") {
    const state = await readState();
    state.analytics.visits = (state.analytics.visits || 0) + 1;
    state.products
      .filter((product) => product.status === "published")
      .forEach((product) => {
        product.views = (product.views || 0) + 1;
      });
    await writeState(state);
    sendJson(response, 200, { visits: state.analytics.visits });
    return true;
  }
  if (request.method === "PUT" && request.url === "/api/state") {
    if (!(await requireCreatorAccess(request, response))) return true;
    const incoming = await readJson(request);
    const current = await readState();
    const currentProducts = new Map(current.products.map((product) => [product.id, product]));
    const currentPages = new Map(current.pages.map((page) => [page.id, page]));
    const currentContacts = new Map(current.contacts.map((contact) => [contact.id, contact]));
    current.profile = { ...current.profile, ...incoming.profile };
    current.pages = Array.isArray(incoming.pages)
      ? incoming.pages.map((page) => ({
          ...page,
          visits: currentPages.get(page.id)?.visits || 0,
          conversion: currentPages.get(page.id)?.conversion || 0,
        }))
      : current.pages;
    current.emails = Array.isArray(incoming.emails) ? incoming.emails : current.emails;
    current.products = Array.isArray(incoming.products)
      ? incoming.products.map((product) => ({
          ...product,
          sales: currentProducts.get(product.id)?.sales || 0,
          views: currentProducts.get(product.id)?.views || 0,
        }))
      : current.products;
    if (Array.isArray(incoming.contacts)) {
      const incomingContacts = new Map(incoming.contacts.map((contact) => [contact.id, contact]));
      current.contacts = [
        ...current.contacts.map((contact) => ({
          ...contact,
          segment: incomingContacts.get(contact.id)?.segment ?? contact.segment,
          source: incomingContacts.get(contact.id)?.source ?? contact.source ?? "Direct",
          buyingScore: Number(incomingContacts.get(contact.id)?.buyingScore ?? contact.buyingScore ?? 0),
          tags: Array.isArray(incomingContacts.get(contact.id)?.tags) ? incomingContacts.get(contact.id).tags : contact.tags || [],
          lastProductId: incomingContacts.get(contact.id)?.lastProductId ?? contact.lastProductId ?? "",
          notes: incomingContacts.get(contact.id)?.notes ?? contact.notes ?? "",
          nextAction: incomingContacts.get(contact.id)?.nextAction ?? contact.nextAction ?? "",
          activity: incomingContacts.get(contact.id)?.activity ?? contact.activity,
        })),
        ...incoming.contacts
          .filter((contact) => contact.id && !currentContacts.has(contact.id))
          .map((contact) => ({
            id: contact.id,
            name: contact.name || "Contact",
            email: contact.email || "",
            segment: contact.segment || "Lead",
            activity: contact.activity || "Ajout manuel",
            value: Number(contact.value || 0),
            joined: contact.joined || new Date().toLocaleDateString("fr-FR"),
            source: contact.source || "Direct",
            buyingScore: Number(contact.buyingScore || 0),
            tags: Array.isArray(contact.tags) ? contact.tags : [],
            lastProductId: contact.lastProductId || "",
            notes: contact.notes || "",
            nextAction: contact.nextAction || "",
          })),
      ];
    }
    await writeState(current);
    sendJson(response, 200, { saved: true });
    return true;
  }
  return false;
}

async function proxyUmamiScript(response) {
  const scriptResponse = await fetch(`${umamiHostUrl}/script.js`);
  const script = await scriptResponse.text();
  response.writeHead(scriptResponse.ok ? 200 : scriptResponse.status, {
    "Content-Type": "text/javascript; charset=utf-8",
    "Cache-Control": "public, max-age=86400, stale-while-revalidate=86400",
  });
  response.end(script);
}

async function proxyUmamiSend(request, response) {
  if (!umamiWebsiteId) {
    response.writeHead(204);
    response.end();
    return;
  }
  const body = await readBody(request);
  const target = `${umamiHostUrl}/api/send`;
  const forwardedHeaders = {
    "Content-Type": request.headers["content-type"] || "application/json",
    Origin: request.headers.origin || appUrl,
    "User-Agent": request.headers["user-agent"] || "Expertly-Browser/1.0",
  };
  const clientIp =
    request.headers["cf-connecting-ip"] ||
    String(request.headers["x-forwarded-for"] || "").split(",")[0] ||
    request.socket.remoteAddress;
  if (clientIp) forwardedHeaders["X-Forwarded-For"] = clientIp;
  const result = await fetch(target, { method: "POST", headers: forwardedHeaders, body });
  const resultBody = await result.text();
  response.writeHead(result.status, {
    "Content-Type": result.headers.get("content-type") || "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(resultBody);
}

async function serveStatic(request, response) {
  const url = new URL(request.url || "/", "http://localhost");
  if (url.pathname === "/favicon.ico") {
    response.writeHead(204, { "Cache-Control": "public, max-age=86400" });
    response.end();
    return;
  }
  const requested =
    url.pathname === "/"
      ? "index.html"
      : url.pathname.startsWith("/b/")
        ? "store.html"
      : url.pathname.startsWith("/go/")
        ? "open.html"
      : url.pathname.startsWith("/p/")
        ? "sales.html"
        : url.pathname.replace(/^\/+/, "");
  const safePath = normalize(requested);
  if (safePath.startsWith("..") || safePath === "data.json" || safePath.includes(".env")) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  try {
    const file = injectPublicConfig(await readFile(join(root, safePath)), safePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(safePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    if (request.method === "HEAD") response.end();
    else response.end(file);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Page introuvable");
  }
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Stripe-Signature, Authorization",
      });
      response.end();
      return;
    }
    if (request.method === "GET" && request.url?.startsWith("/login?")) {
      await handleLogin(request, response);
      return;
    }
    if (request.method === "GET" && request.url?.startsWith("/api/checkout-success?")) {
      await checkoutSuccess(request, response);
      return;
    }
    if (request.method === "POST" && request.url === "/api/webhooks/stripe") {
      await stripeWebhook(request, response);
      return;
    }
    if (request.method === "GET" && request.url === "/umami/script.js") {
      await proxyUmamiScript(response);
      return;
    }
    if (request.method === "POST" && request.url === "/umami/api/send") {
      await proxyUmamiSend(request, response);
      return;
    }
    if (request.url?.startsWith("/api/") && (await handleApi(request, response))) return;
    if (["GET", "HEAD"].includes(request.method || "")) {
      await serveStatic(request, response);
      return;
    }
    response.writeHead(405);
    response.end("Method not allowed");
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: error.message || "Erreur interne du serveur." });
  }
});

server.listen(port, () => {
  console.log(`Expertly Client disponible sur http://localhost:${port}`);
});

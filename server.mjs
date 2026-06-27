import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, timingSafeEqual } from "node:crypto";

const root = fileURLToPath(new URL(".", import.meta.url));

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
const plans = {
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

function accessSecret() {
  return process.env.ACCESS_TOKEN_SECRET || process.env.STRIPE_SECRET_KEY || "expertly-local-only";
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
  const token = cookies.expertly_access;
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
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    sendJson(response, 503, {
      error: "Stripe n’est pas configuré. Ajoute STRIPE_SECRET_KEY dans le fichier .env du serveur.",
    });
    return;
  }

  const { plan: planId } = await readJson(request);
  const plan = plans[planId];
  if (!plan) {
    sendJson(response, 400, { error: "Formule inconnue." });
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

  const secureCookie = (process.env.APP_URL || "").startsWith("https://") ? "; Secure" : "";
  response.writeHead(302, {
    Location: "/app.html?payment=success",
    "Set-Cookie": `expertly_access=${signAccessToken(session.id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secureCookie}`,
    "Cache-Control": "no-store",
  });
  response.end();
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
    const file = await readFile(join(root, safePath));
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
    if (request.method === "OPTIONS" && request.url === "/api/create-checkout-session") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      response.end();
      return;
    }
    if (request.method === "POST" && request.url === "/api/create-checkout-session") {
      await createCheckoutSession(request, response);
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
  console.log(`Expertly disponible sur http://localhost:${port}`);
});

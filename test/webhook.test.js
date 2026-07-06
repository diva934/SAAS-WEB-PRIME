import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

// Env vars must be set before handler is imported (they are read at call time,
// but set early to avoid any module-level edge-cases).
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_ANON_KEY = "test_anon_key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test_svc_key";
process.env.STRIPE_SECRET_KEY = "sk_test_key";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
process.env.RESEND_API_KEY = "re_test_key";
process.env.PLAUSIBLE_DOMAIN = "test.example.com";
process.env.PLAUSIBLE_HOST = "https://plausible.io";
process.env.APP_URL = "https://expertly.app";

const { default: handler } = await import("../api/stripe-webhook.js");

// ── Helpers ────────────────────────────────────────────────────────────────

const SESSION_ID = "cs_test_abc123";
const WEBHOOK_SECRET = "whsec_test";

function makeStripeSignature(payload) {
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", WEBHOOK_SECRET).update(`${ts}.${payload}`).digest("hex");
  return `t=${ts},v1=${sig}`;
}

function makeReq(eventBody) {
  const payload = JSON.stringify(eventBody);
  const buf = Buffer.from(payload);
  return {
    method: "POST",
    headers: {
      "stripe-signature": makeStripeSignature(payload),
      host: "expertly.app",
      "user-agent": "Stripe/1.0",
    },
    body: buf,
    socket: { remoteAddress: "127.0.0.1" },
    query: {},
  };
}

function makeRes() {
  const r = { statusCode: null, responseBody: null };
  r.status = (code) => { r.statusCode = code; return r; };
  r.json = (body) => { r.responseBody = body; };
  return r;
}

// Route-based fetch mock. First matching route wins. Captures all calls.
function makeFetch(routes) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    for (const [match, resp] of routes) {
      if (url.includes(match)) {
        const ok = resp.ok !== false;
        return {
          ok,
          status: resp.status ?? (ok ? 200 : 400),
          headers: { get: () => null },
          json: async () => resp.body ?? null,
          text: async () => JSON.stringify(resp.body ?? null),
        };
      }
    }
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => null, text: async () => "null" };
  };
  fn.calls = calls;
  return fn;
}

// ── Fixtures ───────────────────────────────────────────────────────────────

const CHECKOUT_EVENT = {
  type: "checkout.session.completed",
  account: null,
  data: { object: { id: SESSION_ID } },
};

const PAID_SESSION = {
  id: SESSION_ID,
  payment_status: "paid",
  amount_total: 4900,
  currency: "eur",
  customer_details: { email: "alice@example.com", name: "Alice" },
  customer_email: null,
  metadata: { creator_slug: "test-boutique", product_id: "prod_1", customer_name: "Alice" },
};

const BASE_STATE = {
  revision: 5,
  profile: { slug: "test-boutique", creatorName: "Test Creator" },
  products: [{ id: "prod_1", title: "Mon Produit", status: "published", price: 49 }],
  pages: [],
  contacts: [],
  orders: [],
  analytics: { purchases: 0, revenueSeries: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
};

const CREATOR_ROWS = [{ user_id: "user-123", slug: "test-boutique", state: BASE_STATE }];

const PENDING_ORDER_ID = "EXP-PENDING01";
const STATE_WITH_PENDING = {
  ...BASE_STATE,
  contacts: [{ id: "c_alice", name: "Alice", email: "alice@example.com" }],
  orders: [{
    id: PENDING_ORDER_ID,
    stripeSessionId: SESSION_ID,
    emailStatus: "pending",
    productId: "prod_1",
    contactId: "c_alice",
    accessToken: "test-boutique.deadbeef0000",
    status: "paid",
  }],
};

const STATE_WITH_SENT = {
  ...BASE_STATE,
  contacts: [{ id: "c_alice", name: "Alice", email: "alice@example.com" }],
  orders: [{
    id: "EXP-SENT01",
    stripeSessionId: SESSION_ID,
    emailStatus: "sent",
    productId: "prod_1",
    contactId: "c_alice",
    status: "paid",
  }],
};

// ── Tests ─────────────────────────────────────────────────────────────────

test("webhook: premier evenement, tout reussit -> 200 + emailStatus sent", async () => {
  const fetch = makeFetch([
    ["api.stripe.com", { body: PAID_SESSION }],
    ["creator_states?select=user_id", { body: CREATOR_ROWS }],
    ["save_creator_state_cas", { body: { ...BASE_STATE, revision: 6 } }],
    ["api.resend.com", { body: { id: "resend_abc" } }],
    ["update_order_email_status", { body: {} }],
    ["plausible.io", { body: { accepted: 1 } }],
  ]);
  globalThis.fetch = fetch;

  const res = makeRes();
  await handler(makeReq(CHECKOUT_EVENT), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.responseBody.emailStatus, "sent");
  assert.equal(res.responseBody.emailStatusPersisted, undefined,
    "emailStatusPersisted supprime: le 200 garantit la persistance");
  assert.ok(res.responseBody.orderId?.startsWith("EXP-"), "orderId present et bien forme");

  const resendCall = fetch.calls.find((c) => c.url.includes("resend.com"));
  assert.ok(resendCall, "Resend appele");
  assert.match(resendCall.opts.headers["Idempotency-Key"], /^expertly-access-EXP-/,
    "Cle idempotence Resend stable");
});

test("webhook: RPC update_order_email_status echoue -> 500 (Stripe reessaiera)", async () => {
  const fetch = makeFetch([
    ["api.stripe.com", { body: PAID_SESSION }],
    ["creator_states?select=user_id", { body: CREATOR_ROWS }],
    ["save_creator_state_cas", { body: { ...BASE_STATE, revision: 6 } }],
    ["api.resend.com", { body: { id: "resend_abc" } }],
    ["update_order_email_status", { ok: false, status: 500, body: { message: "DB error" } }],
  ]);
  globalThis.fetch = fetch;

  const res = makeRes();
  await handler(makeReq(CHECKOUT_EVENT), res);

  assert.equal(res.statusCode, 500,
    "500 -> Stripe reessaie -> ordre avec emailStatus=pending sera retraite");
});

test("webhook retry: pending -> meme cle Resend, pas de nouvelle commande, RPC reussit -> 200", async () => {
  const fetch = makeFetch([
    ["api.stripe.com", { body: PAID_SESSION }],
    ["creator_states?select=user_id", { body: [{ user_id: "user-123", slug: "test-boutique", state: STATE_WITH_PENDING }] }],
    ["api.resend.com", { body: { id: "resend_retry" } }],
    ["update_order_email_status", { body: {} }],
  ]);
  globalThis.fetch = fetch;

  const res = makeRes();
  await handler(makeReq(CHECKOUT_EVENT), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.responseBody.retried, PENDING_ORDER_ID,
    "Retry identifie la commande pending existante");
  assert.equal(res.responseBody.emailStatus, "sent");

  // Aucune nouvelle commande ni incrément analytics: save_creator_state_cas pas appele
  const casCalls = fetch.calls.filter((c) => c.url.includes("save_creator_state_cas"));
  assert.equal(casCalls.length, 0,
    "Pas de CAS save au retry: pas de doublon de commande ni d'incrément analytics");

  // Meme cle Resend qu'a la tentative initiale -> idempotent, pas de doublon d'email
  const resendCall = fetch.calls.find((c) => c.url.includes("resend.com"));
  assert.ok(resendCall, "Resend appele au retry");
  assert.equal(resendCall.opts.headers["Idempotency-Key"],
    `expertly-access-${PENDING_ORDER_ID}-initial`,
    "Cle Resend identique a la tentative initiale");
});

test("webhook retry: pending + RPC echoue -> 500 (Stripe reessaiera encore)", async () => {
  const fetch = makeFetch([
    ["api.stripe.com", { body: PAID_SESSION }],
    ["creator_states?select=user_id", { body: [{ user_id: "user-123", slug: "test-boutique", state: STATE_WITH_PENDING }] }],
    ["api.resend.com", { body: { id: "resend_retry" } }],
    ["update_order_email_status", { ok: false, status: 500, body: { message: "RPC error again" } }],
  ]);
  globalThis.fetch = fetch;

  const res = makeRes();
  await handler(makeReq(CHECKOUT_EVENT), res);

  assert.equal(res.statusCode, 500);
});

test("webhook duplicate sent: aucun email, 200 immediat", async () => {
  const fetch = makeFetch([
    ["api.stripe.com", { body: PAID_SESSION }],
    ["creator_states?select=user_id", { body: [{ user_id: "user-123", slug: "test-boutique", state: STATE_WITH_SENT }] }],
  ]);
  globalThis.fetch = fetch;

  const res = makeRes();
  await handler(makeReq(CHECKOUT_EVENT), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.responseBody.duplicate, "EXP-SENT01");

  const resendCalls = fetch.calls.filter((c) => c.url.includes("resend.com"));
  assert.equal(resendCalls.length, 0, "Resend non appele sur duplicate+sent");

  const casCalls = fetch.calls.filter((c) => c.url.includes("save_creator_state_cas"));
  assert.equal(casCalls.length, 0, "Pas de CAS save sur duplicate");
});

test("webhook: signature Stripe invalide -> 400", async () => {
  globalThis.fetch = makeFetch([]);

  const payload = JSON.stringify(CHECKOUT_EVENT);
  const req = {
    method: "POST",
    headers: { "stripe-signature": "t=1234,v1=badsig", host: "expertly.app" },
    body: Buffer.from(payload),
    socket: { remoteAddress: "127.0.0.1" },
    query: {},
  };
  const res = makeRes();
  await handler(req, res);

  assert.equal(res.statusCode, 400);
});

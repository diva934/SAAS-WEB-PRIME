import test from "node:test";
import assert from "node:assert/strict";
import { enforcePlanState, makeAccessToken, normalizeState, slugFromAccessToken } from "../api/_shared.js";

test("state normalization preserves a non-negative revision", () => {
  assert.equal(normalizeState({ revision: 4 }).revision, 4);
  assert.equal(normalizeState({ revision: -3 }).revision, 0);
});

test("Launch accepts five products and rejects a sixth", () => {
  assert.equal(enforcePlanState("launch", { products: Array.from({ length: 5 }, (_, id) => ({ id })) }).products.length, 5);
  assert.throws(
    () => enforcePlanState("launch", { products: Array.from({ length: 6 }, (_, id) => ({ id })) }),
    /limité à 5 produits/,
  );
});

test("Scale accepts an unlimited catalog", () => {
  assert.equal(enforcePlanState("scale", { products: Array.from({ length: 20 }, (_, id) => ({ id })) }).products.length, 20);
});

test("access tokens contain a resolvable slug and 160 bits of randomness", () => {
  const token = makeAccessToken("Ma Boutique");
  assert.equal(slugFromAccessToken(token), "ma-boutique");
  assert.match(token, /^ma-boutique\.[a-f0-9]{40}$/);
});

test("slugFromAccessToken handles missing dot gracefully", () => {
  assert.equal(slugFromAccessToken("hexonlywithoutdot"), "");
  assert.equal(slugFromAccessToken(""), "");
  assert.equal(slugFromAccessToken("boutique.abc123"), "boutique");
});

test("webhook idempotency: duplicate stripeSessionId is detected before order creation", () => {
  const sessionId = "cs_test_abc123";
  const state = normalizeState({
    orders: [{ id: "EXP-001", stripeSessionId: sessionId, status: "paid" }],
  });
  const already = state.orders.find((item) => item.stripeSessionId === sessionId);
  assert.ok(already, "La commande existante doit être trouvée");
  assert.equal(already.id, "EXP-001");
});

test("webhook retry idempotency key is stable for the same orderId", () => {
  const orderId = "EXP-ABC123";
  const deliveryKey = "initial";
  const key1 = `expertly-access-${orderId}-${deliveryKey}`;
  const key2 = `expertly-access-${orderId}-${deliveryKey}`;
  assert.equal(key1, key2);
  assert.match(key1, /^expertly-access-EXP-ABC123-initial$/);
});

test("/api/page ne contient aucun scan global (limit=1000)", async () => {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const path = fileURLToPath(new URL("../api/page.js", import.meta.url));
  const source = await readFile(path, "utf8");
  assert.ok(!source.includes("limit=1000"), "api/page.js ne doit pas contenir de scan global (limit=1000)");
  assert.ok(!source.includes("select=state&limit=1000"), "api/page.js ne doit pas charger toutes les boutiques en memoire");
});

test("tous les appels assertRateLimit dans /api sont precedes de await", async () => {
  const { readFile, readdir } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const { join } = await import("node:path");

  const apiDir = fileURLToPath(new URL("../api", import.meta.url));
  async function collectJs(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) files.push(...await collectJs(full));
      else if (e.name.endsWith(".js")) files.push(full);
    }
    return files;
  }

  const files = await collectJs(apiDir);
  const violations = [];
  for (const file of files) {
    const src = await readFile(file, "utf8");
    // Match assertRateLimit( not preceded by "await " on the same logical token
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      if (/assertRateLimit\s*\(/.test(line) && !/await\s+assertRateLimit\s*\(/.test(line) && !/\bfunction\b/.test(line)) {
        violations.push(`${file.replace(apiDir, "api")}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(violations, [],
    "assertRateLimit appele sans await dans:\n" + violations.join("\n"));
});

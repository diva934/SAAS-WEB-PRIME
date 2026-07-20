/* Couche serveur Firebase (zero dependance npm) :
   - verification des ID tokens Firebase (RS256, certificats Google)
   - Firestore via REST avec un compte de service (JWT signe en node:crypto)
   Variables d'environnement requises (Vercel) :
     FIREBASE_PROJECT_ID, FIREBASE_API_KEY (publique),
     FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY (secrete, \n echappes) */
import crypto from "node:crypto";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "expertly-32d53";
const CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL || "";
const PRIVATE_KEY = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

const CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
let certsCache = { certs: null, exp: 0 };
let tokenCache = { token: null, exp: 0 };

function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeSeg(seg) {
  return JSON.parse(Buffer.from(seg.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
}

async function googleCerts() {
  const now = Date.now();
  if (certsCache.certs && certsCache.exp > now) return certsCache.certs;
  const r = await fetch(CERTS_URL);
  const certs = await r.json();
  const cc = r.headers.get("cache-control") || "";
  const m = cc.match(/max-age=(\d+)/);
  certsCache = { certs, exp: now + (m ? Number(m[1]) * 1000 : 3600000) };
  return certs;
}

// Verifie un ID token Firebase. Retourne { id, email } ou jette une erreur 401.
export async function verifyFirebaseToken(idToken) {
  const e401 = (msg) => { const e = new Error(msg || "Session invalide."); e.status = 401; return e; };
  if (!idToken || idToken.split(".").length !== 3) throw e401();
  const [h, p, sig] = idToken.split(".");
  let header, payload;
  try { header = decodeSeg(h); payload = decodeSeg(p); } catch { throw e401(); }
  const nowS = Math.floor(Date.now() / 1000);
  if (payload.aud !== PROJECT_ID) throw e401("Jeton d'un autre projet.");
  if (payload.iss !== `https://securetoken.google.com/${PROJECT_ID}`) throw e401();
  if (!payload.exp || payload.exp < nowS) throw e401("Session expiree.");
  if (!payload.sub) throw e401();
  const certs = await googleCerts();
  const pem = certs[header.kid];
  if (!pem) throw e401();
  const ok = crypto.verify(
    "RSA-SHA256",
    Buffer.from(`${h}.${p}`),
    crypto.createPublicKey(pem),
    Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64"),
  );
  if (!ok) throw e401();
  return { id: payload.sub, email: payload.email || "" };
}

// Jeton OAuth du compte de service (pour Firestore côté serveur).
async function serviceToken() {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache.token && tokenCache.exp > now + 60) return tokenCache.token;
  if (!CLIENT_EMAIL || !PRIVATE_KEY) { const e = new Error("Firebase n'est pas configure."); e.status = 503; throw e; }
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }));
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(PRIVATE_KEY).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${header}.${claims}.${signature}`,
  });
  const j = await r.json();
  if (!j.access_token) { const e = new Error("Auth serveur Firebase impossible."); e.status = 502; throw e; }
  tokenCache = { token: j.access_token, exp: now + Number(j.expires_in || 3600) };
  return j.access_token;
}

/* ---------- Conversion JSON <-> format Firestore ---------- */
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === "object") {
    const fields = {};
    for (const k of Object.keys(v)) fields[k] = toFs(v[k]);
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}
function fromFs(fv) {
  if (!fv || typeof fv !== "object") return null;
  if ("nullValue" in fv) return null;
  if ("booleanValue" in fv) return fv.booleanValue;
  if ("integerValue" in fv) return Number(fv.integerValue);
  if ("doubleValue" in fv) return fv.doubleValue;
  if ("stringValue" in fv) return fv.stringValue;
  if ("timestampValue" in fv) return fv.timestampValue;
  if ("arrayValue" in fv) return (fv.arrayValue.values || []).map(fromFs);
  if ("mapValue" in fv) {
    const out = {};
    const f = fv.mapValue.fields || {};
    for (const k of Object.keys(f)) out[k] = fromFs(f[k]);
    return out;
  }
  return null;
}

const BASE = () => `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Lit un document ("creators/uid"). Retourne l'objet JSON ou null.
export async function fsGet(path) {
  const token = await serviceToken();
  const r = await fetch(`${BASE()}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) return null;
  if (!r.ok) { const e = new Error("Erreur Firestore (lecture)."); e.status = 502; throw e; }
  const doc = await r.json();
  return fromFs({ mapValue: { fields: doc.fields || {} } });
}

// Ecrit (remplace) un document.
export async function fsSet(path, data) {
  const token = await serviceToken();
  const body = JSON.stringify({ fields: toFs(data).mapValue.fields });
  const r = await fetch(`${BASE()}/${path}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body,
  });
  if (!r.ok) { const e = new Error("Erreur Firestore (ecriture)."); e.status = 502; throw e; }
  return data;
}

// Requete simple sur une collection avec egalite ("creators", "profile.slug", "mon-slug").
export async function fsQuery(collection, field, value, limit = 1) {
  const token = await serviceToken();
  const r = await fetch(`${BASE()}:runQuery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: toFs(value) } },
        limit,
      },
    }),
  });
  if (!r.ok) { const e = new Error("Erreur Firestore (requete)."); e.status = 502; throw e; }
  const rows = await r.json();
  return rows
    .filter((row) => row.document)
    .map((row) => ({ id: row.document.name.split("/").pop(), data: fromFs({ mapValue: { fields: row.document.fields || {} } }) }));
}

// Equivalent de userFromRequest() : lit le Bearer token et le verifie.
export async function userFromRequest(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return verifyFirebaseToken(token);
}

// Liste les documents d'une collection (id + data). limit <= 1000.
export async function fsList(collection, limit = 1000) {
  const token = await serviceToken();
  const r = await fetch(`${BASE()}/${collection}?pageSize=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) { const e = new Error("Erreur Firestore (liste)."); e.status = 502; throw e; }
  const j = await r.json();
  return (j.documents || []).map((doc) => ({
    id: doc.name.split("/").pop(),
    data: fromFs({ mapValue: { fields: doc.fields || {} } }),
  }));
}

// Recherche un compte Firebase Auth par email. Retourne { id, email } ou null.
export async function fbFindUserByEmail(email) {
  const token = await serviceToken();
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: [String(email || "").trim()] }),
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => ({}));
  const u = Array.isArray(j.users) && j.users[0];
  return u ? { id: u.localId, email: u.email || "" } : null;
}

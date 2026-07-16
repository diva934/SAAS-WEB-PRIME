/* Service worker : bascule le panneau au clic, et importe le produit dans le CRM.
   Jeton obtenu dans cet ordre : onglet CRM ouvert (plus frais) -> session en cache
   -> rafraichissement automatique via Supabase (refresh_token). Marche sans onglet CRM. */
"use strict";

var CRM_ORIGIN = "https://expertly-client-app.vercel.app";
var STATE_URL = CRM_ORIGIN + "/api/state";
var CONFIG_URL = CRM_ORIGIN + "/api/config";
var AE_RE = /:\/\/([^\/]*\.)?aliexpress\.(com|us|ru)\//i;

function now() { return Math.floor(Date.now() / 1000); }

/* ---------- Clic sur l'icone de la barre d'outils ---------- */
chrome.action.onClicked.addListener(function (tab) {
  if (!tab || !tab.id) return;
  var url = tab.url || "";
  if (AE_RE.test(url)) {
    chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" }, function () {
      if (chrome.runtime.lastError) {
        chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["panel.css"] }, function () { void chrome.runtime.lastError; });
        chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }, function () { void chrome.runtime.lastError; });
      }
    });
  } else {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: function () {
        var id = "expertly-toast";
        if (document.getElementById(id)) return;
        var d = document.createElement("div");
        d.id = id;
        d.textContent = "Extension Expertly : ouvre une fiche produit AliExpress (URL avec /item/).";
        d.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483000;background:#12141b;color:#fff;font:600 13px/1.4 system-ui,sans-serif;padding:12px 16px;border-radius:12px;box-shadow:0 12px 30px rgba(16,17,26,.35);max-width:300px";
        document.documentElement.appendChild(d);
        setTimeout(function () { d.remove(); }, 4200);
      }
    }, function () { void chrome.runtime.lastError; });
  }
});

/* ---------- Session : cache + rafraichissement ---------- */
function getCachedSession() {
  return new Promise(function (res) { chrome.storage.local.get("expertlySession", function (d) { res((d && d.expertlySession) || null); }); });
}
function saveSession(s) {
  return new Promise(function (res) { chrome.storage.local.set({ expertlySession: s }, function () { res(s); }); });
}
function getConfig() {
  return fetch(CONFIG_URL).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
}
function refreshSession(session) {
  return getConfig().then(function (cfg) {
    if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey || !session.refresh_token) throw { code: "no_token" };
    return fetch(cfg.supabaseUrl + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { apikey: cfg.supabaseAnonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    }).then(function (r) { if (!r.ok) throw { code: "no_token" }; return r.json(); });
  }).then(function (j) {
    if (!j || !j.access_token) throw { code: "no_token" };
    var s = { access_token: j.access_token, refresh_token: j.refresh_token || session.refresh_token, expires_at: j.expires_at || (now() + (j.expires_in || 3600)) };
    return saveSession(s).then(function () { return s.access_token; });
  });
}

/* ---------- Recuperation du jeton depuis un onglet CRM ouvert ---------- */
function findCrmTab() {
  return new Promise(function (res) { chrome.tabs.query({ url: CRM_ORIGIN + "/*" }, function (t) { res(t || []); }); });
}
function getTokenFromTab(tabId) {
  return new Promise(function (res) {
    chrome.tabs.sendMessage(tabId, { type: "GET_TOKEN" }, function (resp) {
      if (chrome.runtime.lastError) { res(null); return; }
      res(resp && resp.token ? resp.token : null);
    });
  });
}
function tokenFromAnyTab() {
  return findCrmTab().then(function (tabs) {
    return (function next(i) {
      if (i >= tabs.length) return null;
      return getTokenFromTab(tabs[i].id).then(function (t) { return t || next(i + 1); });
    })(0);
  });
}

// 1) onglet CRM ouvert  2) cache valide  3) refresh auto
function getToken() {
  return tokenFromAnyTab().then(function (tok) {
    if (tok) return { token: tok };
    return getCachedSession().then(function (s) {
      if (!s || !s.access_token) return { error: "open_crm" };
      if (s.expires_at && s.expires_at > now() + 120) return { token: s.access_token };
      if (s.refresh_token) return refreshSession(s).then(function (t) { return { token: t }; }).catch(function () { return { error: "open_crm" }; });
      return { error: "open_crm" };
    });
  });
}

/* ---------- Construction du produit CRM ---------- */
function mapProduct(src) {
  var price = src.price && typeof src.price.value === "number" && isFinite(src.price.value) ? Math.round(src.price.value * 100) / 100 : 0;
  var seenImages = {};
  var imageCandidates = []
    .concat(src.coverUrl || [])
    .concat(src.image || [])
    .concat(src.imageUrl || [])
    .concat(src.thumbnail || [])
    .concat(src.thumbnailUrl || [])
    .concat(src.images || []);
  var images = imageCandidates.map(function (item) {
    var url = "";
    if (typeof item === "string") url = item;
    else if (item && typeof item.src === "string") url = item.src;
    else if (item && typeof item.url === "string") url = item.url;
    else if (item && typeof item.contentUrl === "string") url = item.contentUrl;
    url = String(url || "").trim().replace(/\\\//g, "/");
    if (url.indexOf("//") === 0) url = "https:" + url;
    if (/^http:\/\//i.test(url)) url = url.replace(/^http:/i, "https:");
    return /^https?:\/\//i.test(url) && !seenImages[url] ? (seenImages[url] = true, url) : "";
  }).filter(Boolean).slice(0, 10);
  return {
    id: "prod_ali_" + Date.now(),
    title: (src.title || "Produit AliExpress").slice(0, 200),
    type: "Produit physique",
    kind: "physique",
    price: price,
    description: src.description || "",
    status: "draft",
    color: "#6558f5",
    offerRole: "core",
    accessType: "link",
    compareAtPrice: 0,
    funnelPriority: "standard",
    bumpProductId: "",
    upsellProductId: "",
    coverUrl: images[0] || "",
    images: images,
    variants: Array.isArray(src.variants) ? src.variants : [],
    cardSize: "m",
    fileName: "",
    featured: false,
    sales: 0,
    views: 0,
    source: "aliexpress",
    sourceUrl: src.url || ""
  };
}

function importProduct(product, token) {
  return fetch(STATE_URL, { headers: { Authorization: "Bearer " + token } })
    .then(function (r) {
      if (r.status === 401) throw { code: "no_token" };
      if (!r.ok) throw { code: "http", detail: "GET " + r.status };
      return r.json();
    })
    .then(function (state) {
      state = state && typeof state === "object" ? state : {};
      if (!Array.isArray(state.products)) state.products = [];
      state.products.unshift(mapProduct(product));
      return fetch(STATE_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify(state)
      });
    })
    .then(function (r) {
      if (r.status === 401) throw { code: "no_token" };
      if (r.status === 402 || r.status === 403) throw { code: "plan_limit" };
      if (!r.ok) throw { code: "http", detail: "PUT " + r.status };
      return { ok: true };
    });
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || msg.type !== "IMPORT_PRODUCT") return;
  getToken().then(function (res) {
    if (res.error) { sendResponse({ ok: false, error: res.error }); return; }
    importProduct(msg.product, res.token)
      .then(function (r) { sendResponse(r); })
      .catch(function (e) {
        // jeton expire pendant l'import : on tente un refresh une fois
        if (e && e.code === "no_token") {
          getCachedSession().then(function (s) {
            if (s && s.refresh_token) {
              refreshSession(s).then(function (t) {
                importProduct(msg.product, t).then(function (r) { sendResponse(r); }).catch(function (e2) { sendResponse({ ok: false, error: (e2 && e2.code) || "fail", detail: (e2 && e2.detail) || "" }); });
              }).catch(function () { sendResponse({ ok: false, error: "no_token" }); });
            } else { sendResponse({ ok: false, error: "no_token" }); }
          });
        } else {
          sendResponse({ ok: false, error: (e && e.code) || "fail", detail: (e && e.detail) || "" });
        }
      });
  });
  return true;
});

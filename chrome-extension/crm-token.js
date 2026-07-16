/* Injecte sur expertly-client-app.vercel.app : lit la session Supabase (localStorage),
   la met en cache dans chrome.storage pour permettre l'import sans onglet CRM ouvert,
   et repond au service worker. Aucune ecriture cote CRM.
   Gere les jetons decoupes (sb-...-auth-token.0/.1) et le prefixe base64-. */
(function () {
  "use strict";

  function decode(raw) {
    if (!raw) return null;
    var s = raw;
    if (s.indexOf("base64-") === 0) { try { s = atob(s.slice(7)); } catch (e) { return null; } }
    try { return JSON.parse(s); } catch (e) { return null; }
  }

  function sessionObj(o) {
    if (!o) return null;
    var src = o.access_token ? o : (o.currentSession || (Array.isArray(o) && o[0]) || null);
    if (!src || !src.access_token) return null;
    return { access_token: src.access_token, refresh_token: src.refresh_token || "", expires_at: src.expires_at || 0 };
  }

  function readSession() {
    try {
      var base = {};
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        var m = k && k.match(/^(sb-.*-auth-token)(?:\.(\d+))?$/);
        if (!m) continue;
        (base[m[1]] = base[m[1]] || []).push({ idx: m[2] == null ? -1 : Number(m[2]), val: localStorage.getItem(k) });
      }
      for (var key in base) {
        var parts = base[key];
        var raw = (parts.length === 1 && parts[0].idx === -1) ? parts[0].val
          : parts.filter(function (p) { return p.idx >= 0; }).sort(function (a, b) { return a.idx - b.idx; }).map(function (p) { return p.val; }).join("");
        var s = sessionObj(decode(raw));
        if (s) return s;
      }
    } catch (e) {}
    return null;
  }

  function cache() {
    try {
      var s = readSession();
      if (s && s.access_token && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ expertlySession: s, expertlySavedAt: Date.now() });
      }
    } catch (e) {}
  }

  cache();
  setInterval(cache, 60000);
  window.addEventListener("storage", cache);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) cache(); });

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === "GET_TOKEN") { var s = readSession(); sendResponse({ token: s ? s.access_token : null }); return true; }
    if (msg && msg.type === "GET_SESSION") { sendResponse({ session: readSession() }); return true; }
  });
})();

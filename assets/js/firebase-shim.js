/* Shim Firebase Auth exposant l'interface supabase-js utilisee par le CRM :
   window.supabase.createClient(...).auth.{getSession,signInWithPassword,signUp,signOut,onAuthStateChange}
   Session stockee sous une cle "sb-firebase-auth-token" (compatible extension).
   Auth via l'API REST Firebase (identitytoolkit) — aucun SDK a charger. */
(function () {
  "use strict";

  var STORAGE_KEY = "sb-firebase-auth-token";
  var cfg = null; // { apiKey, projectId }

  function now() { return Math.floor(Date.now() / 1000); }

  function readSession() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch (e) { return null; }
  }
  function writeSession(s) {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  }

  function toSession(j) {
    // Normalise la reponse Firebase vers le format attendu (style Supabase).
    return {
      access_token: j.idToken,
      refresh_token: j.refreshToken,
      expires_at: now() + Number(j.expiresIn || 3600),
      user: { id: j.localId, email: j.email || "" }
    };
  }

  function authFetch(path, body) {
    return fetch("https://identitytoolkit.googleapis.com/v1/accounts:" + path + "?key=" + encodeURIComponent(cfg.apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); });
  }

  function refresh(session) {
    return fetch("https://securetoken.googleapis.com/v1/token?key=" + encodeURIComponent(cfg.apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(session.refresh_token)
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.id_token) { writeSession(null); return null; }
      var s = {
        access_token: j.id_token,
        refresh_token: j.refresh_token || session.refresh_token,
        expires_at: now() + Number(j.expires_in || 3600),
        user: session.user || { id: j.user_id, email: "" }
      };
      writeSession(s);
      return s;
    }).catch(function () { return session; });
  }

  function frError(j) {
    var code = (j && j.error && j.error.message) || "AUTH_ERROR";
    var map = {
      EMAIL_NOT_FOUND: "Email ou mot de passe incorrect.",
      INVALID_PASSWORD: "Email ou mot de passe incorrect.",
      INVALID_LOGIN_CREDENTIALS: "Email ou mot de passe incorrect.",
      EMAIL_EXISTS: "Un compte existe deja avec cet email.",
      WEAK_PASSWORD: "Mot de passe trop court (6 caracteres minimum).",
      TOO_MANY_ATTEMPTS_TRY_LATER: "Trop de tentatives. Reessaie dans quelques minutes."
    };
    return { message: map[code] || ("Erreur d'authentification (" + code + ")."), code: code };
  }

  var listeners = [];
  function notify(event, session) {
    listeners.forEach(function (fn) { try { fn(event, session); } catch (e) {} });
  }

  var auth = {
    getSession: function () {
      var s = readSession();
      if (!s) return Promise.resolve({ data: { session: null }, error: null });
      if (s.expires_at && s.expires_at < now() + 60 && s.refresh_token) {
        return refresh(s).then(function (s2) { return { data: { session: s2 }, error: null }; });
      }
      return Promise.resolve({ data: { session: s }, error: null });
    },
    getUser: function () {
      var s = readSession();
      return Promise.resolve({ data: { user: s ? s.user : null }, error: null });
    },
    signInWithPassword: function (creds) {
      return authFetch("signInWithPassword", { email: creds.email, password: creds.password, returnSecureToken: true })
        .then(function (r) {
          if (!r.ok) return { data: { session: null, user: null }, error: frError(r.j) };
          var s = toSession(r.j);
          writeSession(s);
          notify("SIGNED_IN", s);
          return { data: { session: s, user: s.user }, error: null };
        });
    },
    signUp: function (creds) {
      return authFetch("signUp", { email: creds.email, password: creds.password, returnSecureToken: true })
        .then(function (r) {
          if (!r.ok) return { data: { session: null, user: null }, error: frError(r.j) };
          var s = toSession(r.j);
          writeSession(s);
          notify("SIGNED_IN", s);
          return { data: { session: s, user: s.user }, error: null };
        });
    },
    signOut: function () {
      writeSession(null);
      notify("SIGNED_OUT", null);
      return Promise.resolve({ error: null });
    },
    resetPasswordForEmail: function (email) {
      return authFetch("sendOobCode", { requestType: "PASSWORD_RESET", email: email })
        .then(function (r) { return r.ok ? { data: {}, error: null } : { data: null, error: frError(r.j) }; });
    },
    onAuthStateChange: function (fn) {
      listeners.push(fn);
      return { data: { subscription: { unsubscribe: function () { listeners = listeners.filter(function (x) { return x !== fn; }); } } } };
    }
  };

  // Interface identique a supabase-js : createClient(url, key) — la "key" est la cle API Firebase.
  window.supabase = {
    createClient: function (url, apiKey) {
      cfg = { apiKey: apiKey, projectId: (url || "").replace(/^https?:\/\//, "").split(".")[0] };
      return { auth: auth };
    }
  };
})();

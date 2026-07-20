/* Carte "Encaissement Stripe" (Stripe Connect) dans la vue Reglages du CRM.
   Permet au createur de connecter SON compte Stripe pour recevoir l'argent de ses
   ventes directement. Autonome : ne modifie pas app.js. Utilise son propre client
   Supabase (comme page-editor.js) pour appeler POST /api/state {action}. */
(function () {
  "use strict";
  if (window.__stripeConnectLoaded) return;
  window.__stripeConnectLoaded = true;

  var cfg = null;
  var sb = null;
  var status = null; // { connected, chargesEnabled, detailsSubmitted, payoutsEnabled }
  var loading = false;
  var pendingReturn = false;

  function loadCfg() {
    if (cfg) return Promise.resolve(cfg);
    return fetch("/api/config", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (c) { cfg = c || {}; return cfg; })
      .catch(function () { cfg = {}; return cfg; });
  }

  function client() {
    if (sb) return Promise.resolve(sb);
    return loadCfg().then(function (c) {
      if (!window.supabase || !c.supabaseUrl || !c.supabaseAnonKey) return null;
      sb = window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey);
      return sb;
    });
  }

  function token() {
    return client().then(function (s) {
      if (!s) return "";
      return s.auth.getSession().then(function (r) {
        return (r && r.data && r.data.session && r.data.session.access_token) || "";
      });
    });
  }

  function api(action) {
    return token().then(function (t) {
      if (!t) throw new Error("Session requise. Reconnecte-toi.");
      return fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
        body: JSON.stringify({ action: action })
      }).then(function (r) {
        return r.json().then(function (j) { return { ok: r.ok, j: j }; });
      });
    });
  }

  function injectCss() {
    if (document.getElementById("stripeConnectCss")) return;
    var css =
      "#stripeConnectCard{display:flex;flex-direction:column;gap:12px}" +
      "#stripeConnectCard .scc-head{display:flex;align-items:center;gap:12px}" +
      "#stripeConnectCard .scc-icon{width:38px;height:38px;border-radius:10px;background:#635bff;color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:18px;flex:0 0 auto}" +
      "#stripeConnectCard .scc-title{font-weight:700}" +
      "#stripeConnectCard .scc-title small{display:block;font-weight:500;color:#6b7280;font-size:12px;margin-top:2px}" +
      "#stripeConnectCard .scc-pill{margin-left:auto;font-size:12px;font-weight:700;padding:5px 10px;border-radius:999px;white-space:nowrap}" +
      "#stripeConnectCard .scc-pill.off{background:#fdecef;color:#c0334e}" +
      "#stripeConnectCard .scc-pill.wait{background:#fff4e0;color:#a4650b}" +
      "#stripeConnectCard .scc-pill.on{background:#e6f7ee;color:#1a8a53}" +
      "#stripeConnectCard .scc-desc{font-size:13px;color:#5b6070;line-height:1.5;margin:0}" +
      "#stripeConnectCard .scc-steps{margin:0;padding-left:18px;font-size:12.5px;color:#6b7280;line-height:1.6}" +
      "#stripeConnectCard .scc-btn{border:0;border-radius:10px;background:#635bff;color:#fff;font:inherit;font-weight:700;padding:11px 16px;cursor:pointer;align-self:flex-start}" +
      "#stripeConnectCard .scc-btn[disabled]{opacity:.6;cursor:default}" +
      "#stripeConnectCard .scc-link{border:0;background:none;color:#635bff;font:inherit;font-weight:600;font-size:12.5px;cursor:pointer;padding:0;text-decoration:underline;align-self:flex-start}" +
      "#stripeConnectCard .scc-err{color:#c0334e;font-size:12.5px;margin:0}";
    var s = document.createElement("style");
    s.id = "stripeConnectCss";
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  function pill() {
    if (!status) return '<span class="scc-pill wait">Vérification…</span>';
    if (status.chargesEnabled) return '<span class="scc-pill on">Connecté ✓</span>';
    if (status.connected) return '<span class="scc-pill wait">À terminer</span>';
    return '<span class="scc-pill off">Non connecté</span>';
  }

  function body() {
    if (status && status.chargesEnabled) {
      return '<p class="scc-desc">Ton compte Stripe est connecté. L\'argent de tes ventes arrive directement dessus (versé par Stripe selon ton calendrier de virement).</p>' +
        '<button type="button" class="scc-link" data-scc-manage>Mettre à jour mes informations Stripe</button>';
    }
    var steps =
      '<ol class="scc-steps">' +
        '<li>Clique sur « Connecter Stripe ».</li>' +
        '<li>Connecte-toi à ton compte Stripe existant, ou crée-en un (gratuit).</li>' +
        '<li>Renseigne les informations demandées par Stripe (identité, IBAN).</li>' +
        '<li>Tu reviens automatiquement ici, compte connecté.</li>' +
      '</ol>';
    var label = status && status.connected ? "Terminer la configuration" : "Connecter Stripe";
    return '<p class="scc-desc">Connecte ton compte Stripe pour recevoir l\'argent de tes ventes directement, sans intermédiaire.</p>' +
      steps +
      '<button type="button" class="scc-btn" data-scc-connect>' + label + '</button>';
  }

  function render(card) {
    injectCss();
    card.innerHTML =
      '<div class="scc-head">' +
        '<span class="scc-icon">S</span>' +
        '<span class="scc-title">Encaissement — Mon compte Stripe' +
          '<small>Reçois l\'argent de tes ventes</small>' +
        '</span>' +
        pill() +
      '</div>' +
      body() +
      '<p class="scc-err" id="sccErr" hidden></p>';

    var connectBtn = card.querySelector("[data-scc-connect]");
    var manageBtn = card.querySelector("[data-scc-manage]");
    if (connectBtn) connectBtn.addEventListener("click", function () { onboard(card, connectBtn); });
    if (manageBtn) manageBtn.addEventListener("click", function () { onboard(card, manageBtn); });
  }

  function showErr(card, msg) {
    var el = card.querySelector("#sccErr");
    if (el) { el.textContent = msg; el.hidden = false; }
  }

  function onboard(card, btn) {
    var prev = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Redirection vers Stripe…";
    api("connect-onboard")
      .then(function (res) {
        if (!res.ok || !res.j.url) throw new Error(res.j && res.j.error ? res.j.error : "Connexion Stripe impossible.");
        window.location.href = res.j.url;
      })
      .catch(function (err) {
        btn.disabled = false;
        btn.textContent = prev;
        showErr(card, err.message || "Erreur. Reessaie.");
      });
  }

  function refreshStatus(card) {
    if (loading) return;
    loading = true;
    api("connect-status")
      .then(function (res) {
        if (res.ok) status = res.j;
        loading = false;
        if (card && card.isConnected) render(card);
      })
      .catch(function () { loading = false; });
  }

  function hideLegacyStripeCard(stack) {
    var legacy = document.querySelector("#stripeStatus");
    if (legacy) {
      var lc = legacy.closest(".integration-card");
      if (lc && lc.id !== "stripeConnectCard") lc.style.display = "none";
    }
  }

  function ensureCard() {
    var view = document.querySelector("#settingsView");
    if (!view || view.classList.contains("view") === false) { /* noop */ }
    var stack = document.querySelector("#settingsView .settings-stack");
    if (!stack) return;
    hideLegacyStripeCard(stack);
    var card = document.querySelector("#stripeConnectCard");
    if (!card) {
      card = document.createElement("article");
      card.className = "panel integration-card";
      card.id = "stripeConnectCard";
      stack.insertBefore(card, stack.firstChild);
      render(card);
      refreshStatus(card);
    } else if (pendingReturn) {
      pendingReturn = false;
      render(card);
      refreshStatus(card);
    }
  }

  // Retour depuis Stripe : ?connect=done (onboarding termine) ou ?connect=refresh (lien expire).
  function handleReturn() {
    var params = new URLSearchParams(location.search);
    var c = params.get("connect");
    if (!c) return;
    params.delete("connect");
    var qs = params.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + "#settings");
    pendingReturn = true;
    if (location.hash !== "#settings") location.hash = "#settings";
    if (c === "refresh") {
      // Le lien a expire : on relance directement l'onboarding.
      api("connect-onboard").then(function (res) {
        if (res.ok && res.j.url) window.location.href = res.j.url;
      }).catch(function () {});
    }
  }

  function boot() {
    handleReturn();
    ensureCard();
    new MutationObserver(function () { ensureCard(); })
      .observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

/* Tunnel de vente - wizard a cartes + onboarding premiere visite.
   Reconstruit la vue #tunnelView en un assistant pas-a-pas : chaque etape est une carte,
   l'etape en cours est mise en avant, et quand une etape est terminee on passe a la suivante.
   Au tout premier passage sur le CRM (apres creation de compte + paiement), on ouvre
   automatiquement le Tunnel ; le client peut "Passer l'intro" a tout moment.
   Aucune donnee inventee : chaque etape se coche selon les VRAIS signaux du CRM
   (#launchChecklist + #tunnelBoard, remplis par app.js). Autonome, sans dependance. */
(function () {
  "use strict";
  if (window.__tunnelWizardLoaded) return;
  window.__tunnelWizardLoaded = true;

  var SEEN_KEY = "expertly_tunnel_intro_seen";

  var CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5l4 4 10-10.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var LOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10.5" width="14" height="9.5" rx="2.2" stroke="currentColor" stroke-width="1.8"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

  // Definition des 6 etapes essentielles. done() lit un objet de signaux booleens.
  var STEPS = [
    {
      key: "profil", title: "Profil & bio",
      desc: "Renseigne le nom public de ta boutique, ta promesse et ton lien.",
      cta: "Completer mon profil", target: "settings",
      done: function (s) { return s.identity; }
    },
    {
      key: "produit", title: "Creer un produit",
      desc: "Ajoute ta premiere offre au catalogue : nom, prix et fichier d'acces.",
      cta: "Creer un produit", target: "products",
      done: function (s) { return s.product; }
    },
    {
      key: "page", title: "Page de vente",
      desc: "Publie une page publique qui presente et vend ton offre.",
      cta: "Creer ma page", target: "pages",
      done: function (s) { return s.page; }
    },
    {
      key: "stripe", title: "Connecter Stripe",
      desc: "Active les paiements pour encaisser tes ventes en direct.",
      cta: "Connecter Stripe", target: "settings", special: "stripe",
      done: function (s) { return s.stripe; }
    },
    {
      key: "email", title: "Email de livraison",
      desc: "Connecte l'envoi automatique de l'acces au client apres l'achat.",
      cta: "Configurer la livraison", target: "emails",
      done: function (s) { return s.email; }
    },
    {
      key: "publish", title: "Publier & partager",
      desc: "Ta boutique est en ligne : partage le lien et lance un achat test.",
      cta: "Voir ma boutique", target: null, special: "publish",
      done: function (s) { return s.checkoutTested; }
    }
  ];

  // ---- Utilitaires onboarding ----
  function isDemo() { try { return new URLSearchParams(location.search).get("demo") === "1"; } catch (e) { return false; } }
  function introDismissed() { try { return localStorage.getItem(SEEN_KEY) === "1"; } catch (e) { return false; } }
  function dismissIntro() { try { localStorage.setItem(SEEN_KEY, "1"); } catch (e) {} }
  function goView(view) { var n = document.querySelector('.nav-item[data-view="' + view + '"]'); if (n) { n.click(); return true; } return false; }

  // ---- Stripe Connect : appel direct du meme backend que la carte Reglages ----
  var _sbCfg = null, _sb = null;
  var stripeStatus = null;        // { connected, chargesEnabled, detailsSubmitted, payoutsEnabled }
  var stripeStatusFetched = false; // ne recupere le statut qu'une fois
  function loadCfg() {
    if (_sbCfg) return Promise.resolve(_sbCfg);
    return fetch("/api/config", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (c) { _sbCfg = c || {}; return _sbCfg; })
      .catch(function () { _sbCfg = {}; return _sbCfg; });
  }
  function sbToken() {
    return loadCfg().then(function (c) {
      if (!window.supabase || !c.supabaseUrl || !c.supabaseAnonKey) return "";
      if (!_sb) _sb = window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey);
      return _sb.auth.getSession().then(function (r) {
        return (r && r.data && r.data.session && r.data.session.access_token) || "";
      });
    });
  }
  function stripeApiAction(action) {
    return sbToken().then(function (t) {
      if (!t) throw new Error("Session requise. Reconnecte-toi.");
      return fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
        body: JSON.stringify({ action: action })
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); });
    });
  }
  // Recupere le statut Stripe une seule fois puis re-rend le wizard (le done() de l'etape en depend).
  function fetchStripeStatus() {
    if (stripeStatusFetched) return;
    stripeStatusFetched = true;
    stripeApiAction("connect-status")
      .then(function (res) { if (res.ok) { stripeStatus = res.j; mount(); } })
      .catch(function () {});
  }

  // ---- Lecture des vrais signaux depuis le DOM rempli par app.js ----
  function readStatus() {
    var s = { identity: false, product: false, page: false, stripe: false, email: false, checkoutTested: false };
    var lc = document.querySelector("#launchChecklist");
    if (lc) {
      [].forEach.call(lc.children, function (el) {
        var txt = (el.textContent || "").toLowerCase();
        var done = el.classList.contains("done");
        if (/identit/.test(txt)) s.identity = s.identity || done;
        if (/premier produit/.test(txt)) s.product = s.product || done;
        if (/page de vente publi/.test(txt)) s.page = s.page || done;
        if (/checkout test/.test(txt)) s.checkoutTested = s.checkoutTested || done;
      });
    }
    var tb = document.querySelector("#tunnelBoard");
    if (tb) {
      [].forEach.call(tb.querySelectorAll(".tunnel-step"), function (b) {
        var t = ((b.querySelector("strong") || {}).textContent || "").toLowerCase();
        var done = b.classList.contains("done");
        if (/checkout/.test(t)) s.stripe = s.stripe || done;
        if (/livraison/.test(t)) s.email = s.email || done;
        if (/page de vente/.test(t)) s.page = s.page || done;
        if (/lead magnet/.test(t) && done) s.product = true;
      });
    }
    // Signal Stripe reel (chargesEnabled) prioritaire des qu'on connait le statut Connect.
    if (stripeStatus) s.stripe = !!stripeStatus.chargesEnabled;
    return s;
  }

  function storeUrl() {
    var a = document.querySelector(".store-link, a[href^='/b/'], a[href*='/b/']");
    var href = a ? a.getAttribute("href") : null;
    if (!href) return null;
    try { return new URL(href, location.origin).href; } catch (e) { return href; }
  }

  // ---- Construction du wizard ----
  function buildHtml(status) {
    var doneFlags = STEPS.map(function (st) { return !!st.done(status); });
    var total = STEPS.length;
    var doneCount = doneFlags.filter(Boolean).length;
    var currentIndex = doneFlags.indexOf(false); // premiere etape non terminee
    var allDone = currentIndex === -1;
    var pct = Math.round((doneCount / total) * 100);

    if (allDone) dismissIntro(); // tunnel termine : plus besoin de le rouvrir automatiquement
    var showSkip = !introDismissed() && !allDone;

    var cards = STEPS.map(function (st, i) {
      var isDone = doneFlags[i];
      var isCurrent = !allDone && i === currentIndex;
      // L'etape Stripe est deverrouillee : connectable a tout moment, meme hors sequence.
      var stripeOpen = st.special === "stripe" && !isDone && !isCurrent;
      var state = isDone ? "is-done" : (isCurrent ? "is-current" : (stripeOpen ? "is-open" : "is-locked"));

      var badge;
      if (isDone) badge = '<span class="tw-badge tw-badge-done">' + CHECK_SVG + '</span>';
      else if (isCurrent || stripeOpen) badge = '<span class="tw-badge tw-badge-current">' + (i + 1) + '</span>';
      else badge = '<span class="tw-badge tw-badge-lock">' + LOCK_SVG + '</span>';

      var meta = isDone ? '<span class="tw-tag tw-tag-done">Termine</span>'
        : (isCurrent ? '<span class="tw-tag tw-tag-now">A faire maintenant</span>'
          : (stripeOpen ? '<span class="tw-tag tw-tag-now">Disponible maintenant</span>'
            : '<span class="tw-tag tw-tag-soon">Etape ' + (i + 1) + '</span>'));

      var actions = "";
      if (isDone) {
        if (st.target) actions = '<button type="button" class="tw-ghost" data-view-target="' + st.target + '">Revoir</button>';
      } else if (st.special === "stripe") {
        // Bouton de connexion DIRECTE (Stripe Connect), disponible meme hors sequence.
        var sLabel = (stripeStatus && stripeStatus.connected && !stripeStatus.chargesEnabled)
          ? "Terminer la configuration Stripe" : "Connecter mon compte Stripe";
        actions = '<button type="button" class="primary-button tw-cta" data-tw-action="stripe-connect">' + sLabel + '</button>'
          + '<button type="button" class="tw-ghost" data-view-target="settings">Ouvrir les Reglages</button>';
      } else if (isCurrent) {
        if (st.special === "publish") {
          var url = storeUrl();
          if (url) {
            actions = '<a class="primary-button tw-cta" href="' + url + '" target="_blank" rel="noopener">Voir ma boutique &#8599;</a>'
              + '<button type="button" class="tw-ghost" data-tw-action="copy" data-url="' + url + '">Copier le lien</button>';
          } else {
            actions = '<button type="button" class="primary-button tw-cta" data-view-target="pages">Publier une page</button>';
          }
        } else {
          actions = '<button type="button" class="primary-button tw-cta" data-view-target="' + (st.target || "overview") + '">' + st.cta + '</button>';
        }
      }

      var note = "";
      if (!isDone && st.special === "stripe") {
        note = '<p class="tw-note">En cliquant, tu es redirige vers Stripe pour connecter (ou creer) ton compte et saisir ton identite + IBAN. L\'argent de tes ventes arrive ensuite directement sur ton compte.</p>'
          + '<p class="tw-err" data-tw-stripe-err hidden></p>';
      }

      return '' +
        '<article class="tw-step ' + state + '" style="animation-delay:' + (i * 70) + 'ms">' +
          badge +
          '<div class="tw-step-body">' +
            '<div class="tw-step-top"><h3>' + st.title + '</h3>' + meta + '</div>' +
            '<p class="tw-step-desc">' + st.desc + '</p>' +
            note +
            (actions ? '<div class="tw-step-actions">' + actions + '</div>' : '') +
          '</div>' +
        '</article>';
    }).join("");

    var headline = allDone
      ? "Tunnel complet - ta machine de vente tourne."
      : "Etape " + (currentIndex + 1) + " sur " + total + " - on avance pas a pas.";

    var skipBtn = showSkip ? '<button type="button" class="tw-skip" data-tw-action="skip">Passer l\'intro &rarr;</button>' : '';

    return '' +
      '<div class="tw-wrap">' +
        '<div class="tw-head">' +
          '<div><p class="tw-eyebrow">Assistant de lancement</p><h1 class="tw-title">Tunnel de vente</h1>' +
          '<p class="tw-sub">' + headline + '</p></div>' +
          '<div class="tw-head-right"><div class="tw-count">' + doneCount + '<small>/' + total + '</small></div>' + skipBtn + '</div>' +
        '</div>' +
        '<div class="tw-progress"><span style="width:' + pct + '%"></span></div>' +
        '<div class="tw-steps">' + cards + '</div>' +
      '</div>';
  }

  function mount() {
    var view = document.querySelector("#tunnelView");
    // On ne prend le controle que lorsque la vue Tunnel est reellement affichee.
    if (!view || view.offsetParent === null) return;

    fetchStripeStatus(); // recupere le statut Stripe reel une seule fois (met a jour l'etape Connecter Stripe)
    var status = readStatus();
    var sig = JSON.stringify(status) + "|" + (storeUrl() || "") + "|" + introDismissed() + "|s" + (stripeStatus ? (stripeStatus.chargesEnabled ? 2 : (stripeStatus.connected ? 1 : 0)) : "?");
    var host = view.querySelector("#tunnelWizard");
    // Rien n'a change depuis le dernier rendu : on ne refait rien (evite le flicker du live-refresh 1s).
    if (host && host.getAttribute("data-sig") === sig) return;

    // Masque le contenu original (mais le garde dans le DOM pour que renderTunnel continue de fonctionner).
    [].forEach.call(view.children, function (child) {
      if (child.id === "tunnelWizard") return;
      if (child.getAttribute && child.getAttribute("data-tw-hidden") === "1") return;
      child.setAttribute("data-tw-hidden", "1");
      child.style.display = "none";
    });

    if (!host) {
      host = document.createElement("div");
      host.id = "tunnelWizard";
      view.appendChild(host);
    }
    host.setAttribute("data-sig", sig);
    host.innerHTML = buildHtml(status);
  }

  // ---- Clics locaux (non geres par app.js) : passer l'intro + copier le lien ----
  document.addEventListener("click", function (e) {
    var skip = e.target.closest && e.target.closest('[data-tw-action="skip"]');
    if (skip) { dismissIntro(); goView("overview"); mount(); return; }
    var sc = e.target.closest && e.target.closest('[data-tw-action="stripe-connect"]');
    if (sc) {
      e.preventDefault();
      var prev = sc.textContent;
      sc.disabled = true; sc.textContent = "Redirection vers Stripe…";
      var errEl = document.querySelector('[data-tw-stripe-err]');
      if (errEl) { errEl.hidden = true; errEl.textContent = ""; }
      stripeApiAction("connect-onboard")
        .then(function (res) {
          if (!res.ok || !res.j || !res.j.url) throw new Error(res.j && res.j.error ? res.j.error : "Connexion Stripe impossible pour le moment.");
          window.location.href = res.j.url;
        })
        .catch(function (err) {
          sc.disabled = false; sc.textContent = prev;
          if (errEl) { errEl.textContent = (err && err.message) || "Erreur. Reessaie."; errEl.hidden = false; }
        });
      return;
    }
    var t = e.target.closest && e.target.closest('[data-tw-action="copy"]');
    if (!t) return;
    var url = t.getAttribute("data-url");
    if (url && navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () {
        var old = t.textContent; t.textContent = "Lien copie !";
        setTimeout(function () { t.textContent = old; }, 1600);
      }).catch(function () {});
    }
  });

  // ---- Onboarding : ouvrir automatiquement le Tunnel a la premiere visite ----
  function maybeAutoRoute() {
    if (window.__twAutoRouted || isDemo() || introDismissed()) return true;
    var hash = (location.hash || "").replace(/^#/, "");
    if (hash && hash !== "overview") return true; // deep-link explicite : on ne le remplace pas
    var nav = document.querySelector('.nav-item[data-view="tunnel"]');
    var board = document.querySelector("#tunnelBoard");
    if (!nav || !board) return false; // app pas encore prete -> on retentera
    window.__twAutoRouted = true;
    nav.click();
    return true;
  }
  function autoRouteLoop() {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (maybeAutoRoute() || tries > 24) clearInterval(iv);
    }, 300);
  }

  // ---- Declencheurs : reconstruire quand le tunnel (re)rend ----
  function watch() {
    var board = document.querySelector("#tunnelBoard");
    if (board) {
      new MutationObserver(function () { mount(); }).observe(board, { childList: true });
    }
    var lc = document.querySelector("#launchChecklist");
    if (lc) {
      new MutationObserver(function () {
        var view = document.querySelector("#tunnelView");
        if (view && view.offsetParent !== null) mount();
      }).observe(lc, { childList: true });
    }
    var view = document.querySelector("#tunnelView");
    if (view && view.offsetParent !== null && board && board.children.length) mount();
  }

  function injectCss() {
    if (document.getElementById("tunnelWizardCss")) return;
    var css =
      '#tunnelWizard{display:block}' +
      '.tw-wrap{display:flex;flex-direction:column;gap:18px;max-width:820px}' +
      '.tw-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}' +
      '.tw-head-right{display:flex;flex-direction:column;align-items:flex-end;gap:8px}' +
      '.tw-eyebrow{margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#8a8f9c}' +
      '.tw-title{margin:0;font-size:26px;font-weight:800;color:#15161c}' +
      '.tw-sub{margin:6px 0 0;font-size:14px;color:#6b7280}' +
      '.tw-count{flex:none;font-size:30px;font-weight:800;color:#15161c;line-height:1}' +
      '.tw-count small{font-size:15px;color:#a2a7b3;font-weight:700}' +
      '.tw-skip{border:0;background:none;color:#8a8f9c;font:inherit;font-size:13px;font-weight:600;cursor:pointer;padding:2px;text-decoration:underline;text-underline-offset:3px}' +
      '.tw-skip:hover{color:#15161c}' +
      '.tw-progress{height:9px;border-radius:999px;background:#e7e9ef;overflow:hidden}' +
      '.tw-progress span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#a7e83f,#c6f24e);transition:width .5s ease}' +
      '.tw-steps{display:flex;flex-direction:column;gap:12px}' +
      '.tw-step{display:flex;gap:16px;align-items:flex-start;background:#fff;border:1px solid #edeff3;border-radius:22px;padding:18px 20px;box-shadow:0 12px 30px rgba(20,22,40,.05);opacity:0;transform:translateY(8px);animation:twIn .45s ease forwards}' +
      '@keyframes twIn{to{opacity:1;transform:translateY(0)}}' +
      '.tw-step.is-current{border-color:#c6f24e;box-shadow:0 16px 36px rgba(198,242,78,.30)}' +
      '.tw-step.is-open{border-color:#c9c4ff;box-shadow:0 14px 32px rgba(99,91,255,.12)}' +
      '.tw-step.is-open .tw-badge-current{background:#635bff;color:#fff}' +
      '.tw-step.is-locked{opacity:.6}' +
      '.tw-step.is-locked .tw-step-desc{color:#9aa0ad}' +
      '.tw-badge{flex:none;width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:16px}' +
      '.tw-badge svg{width:22px;height:22px}' +
      '.tw-badge-done{background:#1eaa73;color:#fff}' +
      '.tw-badge-current{background:#c6f24e;color:#15161c}' +
      '.tw-badge-lock{background:#eef0f4;color:#aab0bd}' +
      '.tw-step-body{flex:1;min-width:0}' +
      '.tw-step-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}' +
      '.tw-step-top h3{margin:0;font-size:16px;font-weight:700;color:#15161c}' +
      '.tw-step-desc{margin:6px 0 0;font-size:13.5px;line-height:1.5;color:#6b7280}' +
      '.tw-tag{font-size:11px;font-weight:700;border-radius:999px;padding:3px 9px}' +
      '.tw-tag-done{background:#e4f7ee;color:#1a8a5f}' +
      '.tw-tag-now{background:#f2fbd6;color:#5c7a12}' +
      '.tw-tag-soon{background:#eef0f4;color:#8a8f9c}' +
      '.tw-step-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}' +
      '.tw-cta{text-decoration:none;display:inline-flex;align-items:center}' +
      '.tw-ghost{border:1px solid #e2e4ec;background:#fff;color:#15161c;font:inherit;font-size:13px;font-weight:700;border-radius:12px;padding:9px 14px;cursor:pointer}' +
      '.tw-ghost:hover{background:#f5f6f9}' +
      '.tw-note{margin:10px 0 0;font-size:12px;line-height:1.45;color:#8a8f9c;background:#f7f8fb;border:1px solid #edeff3;border-radius:12px;padding:9px 11px}' +
      '.tw-err{margin:8px 0 0;font-size:12.5px;line-height:1.45;color:#c0334e;background:#fdecef;border:1px solid #f6d4da;border-radius:12px;padding:9px 11px}' +
      '@media(max-width:640px){.tw-title{font-size:22px}.tw-step{padding:16px}}';
    var style = document.createElement("style");
    style.id = "tunnelWizardCss";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function init() { injectCss(); watch(); autoRouteLoop(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

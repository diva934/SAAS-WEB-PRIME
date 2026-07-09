/* Expertly - robot chatbot + rafraichissement live du dashboard.
 * Fichier autonome charge APRES app.js : il reutilise les globales du CRM
 * (state, normalizeState, renderView, activeView, STORAGE_KEY, authenticatedFetch).
 * Aucune donnee n'est envoyee a un service externe (assistant 100% local). */
(function () {
  "use strict";
  if (window.__expertlyLiveLoaded) return;
  window.__expertlyLiveLoaded = true;

  var DEMO = false;
  try { DEMO = new URLSearchParams(location.search).get("demo") === "1"; } catch (e) {}

  var ROBOT = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.2V5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="2.6" r="1.05" fill="currentColor"/><rect x="4.6" y="6.8" width="14.8" height="12" rx="3.6" stroke="currentColor" stroke-width="1.8"/><path d="M2.6 11.4v3.2M21.4 11.4v3.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="9.1" cy="12.4" r="1.45" fill="currentColor"/><circle cx="14.9" cy="12.4" r="1.45" fill="currentColor"/><path d="M9.4 15.9h5.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

  var CSS = [
    '.live-indicator{display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border-radius:999px;background:var(--soft,#f7f7fb);border:1px solid var(--line,#e8e8f0);font-size:12px;font-weight:600;color:var(--muted,#727389);white-space:nowrap;margin-right:8px}',
    '.live-indicator .live-dot{width:8px;height:8px;border-radius:50%;background:var(--muted,#727389)}',
    '.live-indicator.is-live{color:var(--green,#1eaa73);border-color:rgba(30,170,115,.35);background:rgba(30,170,115,.08)}',
    '.live-indicator.is-live .live-dot{background:var(--green,#1eaa73);animation:livePulse 1.4s ease-out infinite}',
    '.live-indicator.is-stale{color:var(--red,#d95866);border-color:rgba(217,88,102,.35);background:rgba(217,88,102,.08)}',
    '.live-indicator.is-stale .live-dot{background:var(--red,#d95866)}',
    '@keyframes livePulse{0%{box-shadow:0 0 0 0 rgba(30,170,115,.45)}70%{box-shadow:0 0 0 7px rgba(30,170,115,0)}100%{box-shadow:0 0 0 0 rgba(30,170,115,0)}}',
    '.expertly-assistant{--a:#5547e7;--a2:#786bf8;position:fixed;right:22px;bottom:22px;z-index:900;display:flex;flex-direction:column;align-items:flex-end;gap:12px;font-family:"DM Sans",system-ui,sans-serif}',
    '.ea-launcher{display:inline-flex;align-items:center;gap:10px;border:0;padding:8px;border-radius:999px;background:#fff;box-shadow:0 12px 30px rgba(39,56,105,.18);cursor:pointer;transition:transform .15s ease,box-shadow .15s ease}',
    '.ea-launcher:hover{transform:translateY(-2px);box-shadow:0 16px 36px rgba(39,56,105,.24)}',
    '.ea-launcher-icon{width:46px;height:46px;flex:none;display:grid;place-items:center;border-radius:50%;color:#fff;background:linear-gradient(145deg,var(--a2),var(--a))}',
    '.ea-launcher-icon svg{width:26px;height:26px}',
    '.ea-launcher-label{font-size:14px;font-weight:700;color:#12151f;padding-right:8px}',
    '.expertly-assistant.is-open .ea-launcher-label{display:none}',
    '.ea-panel{width:340px;max-width:calc(100vw - 32px);background:#fff;border:1px solid #e8e8f0;border-radius:20px;box-shadow:0 24px 60px rgba(39,56,105,.22);overflow:hidden;display:flex;flex-direction:column}',
    '.ea-panel[hidden]{display:none}',
    '.ea-head{display:flex;align-items:center;gap:10px;padding:13px 14px;border-bottom:1px solid #eef0f6}',
    '.ea-avatar{width:38px;height:38px;flex:none;display:grid;place-items:center;border-radius:12px;color:#fff;background:linear-gradient(145deg,var(--a2),var(--a))}',
    '.ea-avatar svg{width:22px;height:22px}',
    '.ea-head-text strong{display:block;font-size:14px;color:#12151f}',
    '.ea-head-text span{display:flex;align-items:center;gap:6px;font-size:11.5px;color:#6b7280}',
    '.ea-dot{width:7px;height:7px;border-radius:50%;background:#1eaa73}',
    '.ea-close{margin-left:auto;border:0;background:none;cursor:pointer;font-size:20px;line-height:1;color:#9aa0ad;padding:2px 6px}',
    '.ea-close:hover{color:#12151f}',
    '.ea-conversation{padding:14px;display:flex;flex-direction:column;gap:10px;background:#f7f7fb;max-height:46vh;min-height:150px;overflow-y:auto}',
    '.ea-msg{max-width:88%;padding:10px 12px;font-size:13px;line-height:1.5;border-radius:14px}',
    '.ea-msg-bot{align-self:flex-start;background:#fff;border:1px solid #e8e8f0;color:#12151f;border-top-left-radius:5px}',
    '.ea-msg-user{align-self:flex-end;color:#fff;background:linear-gradient(145deg,var(--a2),var(--a));border-top-right-radius:5px}',
    '.ea-chips{display:flex;flex-wrap:wrap;gap:7px}',
    '.ea-chip{border:1px solid #d7e3ff;background:#eef4ff;color:var(--a);font:inherit;font-size:12px;font-weight:600;border-radius:20px;padding:6px 11px;cursor:pointer}',
    '.ea-chip:hover{background:#e2ecff}',
    '.ea-composer{display:flex;align-items:flex-end;gap:8px;padding:10px 12px;border-top:1px solid #eef0f6}',
    '.ea-composer textarea{flex:1;resize:none;border:1px solid #e2e4ec;border-radius:12px;padding:9px 11px;font:inherit;font-size:13px;color:#12151f;max-height:120px;line-height:1.4;outline:none}',
    '.ea-composer textarea:focus{border-color:var(--a2)}',
    '.ea-send{width:34px;height:34px;flex:none;border:0;border-radius:10px;color:#fff;font-size:16px;font-weight:700;cursor:pointer;background:linear-gradient(145deg,var(--a2),var(--a))}',
    '.ea-note{margin:0;padding:8px 14px 12px;font-size:10.5px;color:#9aa0ad;text-align:center}',
    '@media (max-width:640px){.expertly-assistant{right:14px;bottom:14px}.ea-launcher-label{display:none}}'
  ].join("\n");

  var st = document.createElement("style");
  st.textContent = CSS;
  document.head.appendChild(st);

  /* ---------------- Rafraichissement live ---------------- */
  var liveTimer = null, inFlight = false, lastSig = "";
  function ensureIndicator() {
    var i = document.querySelector("#liveIndicator");
    if (!i) {
      var a = document.querySelector(".topbar-actions");
      if (!a) return null;
      i = document.createElement("span");
      i.id = "liveIndicator";
      i.className = "live-indicator";
      i.title = "Le dashboard se met a jour automatiquement";
      i.innerHTML = '<i class="live-dot"></i><span class="live-text">Connexion...</span>';
      a.prepend(i);
    }
    return i;
  }
  function setIndicator(ok) {
    var i = ensureIndicator();
    if (!i) return;
    i.classList.toggle("is-live", ok);
    i.classList.toggle("is-stale", !ok);
    var t = i.querySelector(".live-text");
    if (!t) return;
    if (ok) {
      var n = new Date(), p = function (x) { return String(x).padStart(2, "0"); };
      t.textContent = "En direct - " + p(n.getHours()) + ":" + p(n.getMinutes()) + ":" + p(n.getSeconds());
    } else {
      t.textContent = "Hors ligne";
    }
  }
  async function refresh() {
    if (DEMO || document.hidden || !location.protocol.startsWith("http")) return;
    if (inFlight) return;
    inFlight = true;
    try {
      var r = await authenticatedFetch("/api/state", { cache: "no-store" });
      if (!r.ok) { setIndicator(false); return; }
      var txt = await r.text();
      setIndicator(true);
      if (txt === lastSig) return;
      lastSig = txt;
      state = normalizeState(JSON.parse(txt));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      var pc = document.querySelector("#productCount");
      if (pc) pc.textContent = String(state.products.length);
      renderView(activeView);
    } catch (e) {
      setIndicator(false);
    } finally {
      inFlight = false;
    }
  }
  function startLive() {
    if (DEMO || liveTimer) return;
    ensureIndicator();
    liveTimer = window.setInterval(refresh, 1000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });
    refresh();
  }

  /* ---------------- Robot chatbot (local) ---------------- */
  var RULES = [
    { k: /(vente|chiffre|ca\b|revenu|argent|gagn)/i, a: "Tes ventes et ton chiffre d'affaires apparaissent sur la vue d'ensemble et dans Finances. Chaque paiement Stripe valide s'ajoute automatiquement, en direct." },
    { k: /(commande|order|achat)/i, a: "Retrouve toutes tes commandes dans l'onglet Commandes. Elles se creent seules des qu'un client paie sur ta boutique." },
    { k: /(stripe|paiement|encaiss|connect)/i, a: "Pour encaisser, connecte ton compte Stripe depuis Reglages puis Paiements. Une fois connecte, les ventes remontent toutes seules dans le CRM." },
    { k: /(produit|offre|catalogue)/i, a: "Ajoute ou modifie tes produits dans l'onglet Produits. Pense a une description claire (30+ caracteres) et a un fichier d'acces pour la livraison automatique." },
    { k: /(client|contact|audience|lead)/i, a: "Tes contacts sont dans l'onglet Clients. Chaque acheteur y est ajoute automatiquement avec le total depense." },
    { k: /(page|tunnel|lien|entonnoir)/i, a: "Cree tes pages de vente dans l'onglet Pages, et structure ton tunnel (lead magnet, offre principale, upsell) dans Tunnel." },
    { k: /(email|mail|resend|livraison)/i, a: "La livraison par email se configure avec Resend dans Reglages. Le client recoit son acces automatiquement apres paiement." },
    { k: /(commenc|demarr|debut|premier|quoi faire|aide|help)/i, a: "Commence par : 1) ton identite boutique, 2) ton premier produit, 3) connecter Stripe, 4) publier une page de vente. La checklist Lancement te suit pas a pas." },
    { k: /(merci|thanks|top|super|cool|genial)/i, a: "Avec plaisir ! Je reste la si tu as besoin d'un coup de main." },
    { k: /(bonjour|salut|hello|coucou|hey|bonsoir)/i, a: "Salut ! Dis-moi ce que tu veux faire : vendre plus, creer un produit, comprendre tes chiffres..." }
  ];
  function answerFor(q) {
    var text = (q || "").trim();
    if (!text) return "Pose-moi ta question : ventes, produits, Stripe, clients, pages...";
    for (var i = 0; i < RULES.length; i++) if (RULES[i].k.test(text)) return RULES[i].a;
    return "Je peux t'aider sur : tes ventes et ton CA, tes commandes, la connexion Stripe, tes produits, tes pages de vente et tes clients. Reformule avec un de ces sujets.";
  }
  var CHIPS = ["Par ou commencer ?", "Ameliorer mes ventes", "Connecter Stripe", "Lire mes chiffres"];

  function mountWidget() {
    if (document.querySelector(".expertly-assistant")) return;
    var root = document.createElement("aside");
    root.className = "expertly-assistant";
    root.innerHTML =
      '<div class="ea-panel" id="eaPanel" hidden>' +
        '<header class="ea-head">' +
          '<div class="ea-avatar" aria-hidden="true">' + ROBOT + '</div>' +
          '<div class="ea-head-text"><strong>Assistant Expertly</strong>' +
            '<span><i class="ea-dot"></i>Conseils instantanes</span></div>' +
          '<button class="ea-close" type="button" id="eaClose" aria-label="Fermer">×</button>' +
        '</header>' +
        '<div class="ea-conversation" id="eaConversation"></div>' +
        '<form class="ea-composer" id="eaForm">' +
          '<textarea id="eaInput" rows="1" placeholder="Explique-moi ton besoin..." autocomplete="off"></textarea>' +
          '<button class="ea-send" type="submit" aria-label="Envoyer">↑</button>' +
        '</form>' +
        '<p class="ea-note">Reponses locales - aucune donnee envoyee a un service externe.</p>' +
      '</div>' +
      '<button class="ea-launcher" type="button" id="eaLauncher" aria-label="Ouvrir l\'assistant">' +
        '<span class="ea-launcher-icon" aria-hidden="true">' + ROBOT + '</span>' +
        '<span class="ea-launcher-label">Besoin d\'un conseil ?</span>' +
      '</button>';
    document.body.appendChild(root);

    var panel = root.querySelector("#eaPanel");
    var launcher = root.querySelector("#eaLauncher");
    var closeBtn = root.querySelector("#eaClose");
    var conversation = root.querySelector("#eaConversation");
    var form = root.querySelector("#eaForm");
    var input = root.querySelector("#eaInput");
    var greeted = false;

    function addMessage(text, who) {
      var b = document.createElement("div");
      b.className = "ea-msg ea-msg-" + who;
      b.textContent = text;
      conversation.appendChild(b);
      conversation.scrollTop = conversation.scrollHeight;
    }
    function addChips() {
      var wrap = document.createElement("div");
      wrap.className = "ea-chips";
      CHIPS.forEach(function (c) {
        var x = document.createElement("button");
        x.type = "button";
        x.className = "ea-chip";
        x.textContent = c;
        x.addEventListener("click", function () { ask(c); });
        wrap.appendChild(x);
      });
      conversation.appendChild(wrap);
      conversation.scrollTop = conversation.scrollHeight;
    }
    function greet() {
      if (greeted) return;
      greeted = true;
      addMessage("Bonjour, je suis l'assistant Expertly. Je peux t'aider a choisir la prochaine action utile pour developper ta boutique.", "bot");
      addChips();
    }
    function ask(q) {
      var text = (q || "").trim();
      if (!text) return;
      addMessage(text, "user");
      input.value = "";
      input.style.height = "auto";
      setTimeout(function () { addMessage(answerFor(text), "bot"); }, 260);
    }
    function setOpen(open) {
      panel.hidden = !open;
      root.classList.toggle("is-open", open);
      if (open) { greet(); setTimeout(function () { input.focus(); }, 60); }
    }
    launcher.addEventListener("click", function () { setOpen(panel.hidden); });
    closeBtn.addEventListener("click", function () { setOpen(false); });
    form.addEventListener("submit", function (e) { e.preventDefault(); ask(input.value); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input.value); }
    });
    input.addEventListener("input", function () {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
    });
  }

  function boot() { mountWidget(); startLive(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

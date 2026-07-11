/* Expertly - robot chatbot (data-aware) + rafraichissement live du dashboard.
 * Fichier autonome charge APRES app.js : il reutilise les globales du CRM
 * (state, normalizeState, renderView, activeView, STORAGE_KEY, authenticatedFetch).
 * Le bot lit le CA/commandes/conversion reels dans `state` et adapte ses conseils.
 * Aucune donnee n'est envoyee a un service externe (assistant 100% local). */
(function () {
  "use strict";
  if (window.__expertlyLiveLoaded) return;
  window.__expertlyLiveLoaded = true;

  var DEMO = false;
  try { DEMO = new URLSearchParams(location.search).get("demo") === "1"; } catch (e) {}

  var ROBOT = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.2V5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="2.6" r="1.05" fill="currentColor"/><rect x="4.6" y="6.8" width="14.8" height="12" rx="3.6" stroke="currentColor" stroke-width="1.8"/><path d="M2.6 11.4v3.2M21.4 11.4v3.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="9.1" cy="12.4" r="1.45" fill="currentColor"/><circle cx="14.9" cy="12.4" r="1.45" fill="currentColor"/><path d="M9.4 15.9h5.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  var ROBOT_IMG = '<img class="ea-robot-img" src="/assets/robot-chat.png" alt="" />';

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
    '.ea-robot-img{width:88%;height:88%;object-fit:contain;display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.25))}',
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

  /* ---------------- Metriques reelles (memes formules que le CRM) ---------------- */
  function fmtEur(n) {
    n = Math.round(Number(n) || 0);
    return n.toLocaleString("fr-FR").replace(/[  ]/g, " ") + " €";
  }
  function pct(n) { return (Number(n) || 0).toFixed(1).replace(".", ","); }
  function metrics() {
    var s = (typeof state !== "undefined" && state) ? state : {};
    var paid = Array.isArray(s.orders) ? s.orders.filter(function (o) { return o && o.status === "paid"; }) : [];
    var revenue = paid.reduce(function (x, o) { return x + (Number(o.amount) || 0); }, 0);
    var a = s.analytics || {};
    var visits = Number(a.visits) || 0, purchases = Number(a.purchases) || 0;
    return {
      revenue: revenue,
      orders: paid.length,
      avg: paid.length ? Math.round(revenue / paid.length) : 0,
      visits: visits,
      conv: visits ? (purchases / visits * 100) : 0,
      products: Array.isArray(s.products) ? s.products.filter(function (p) { return p && p.status === "published"; }).length : 0,
      contacts: Array.isArray(s.contacts) ? s.contacts.length : 0
    };
  }

  /* ---------------- Robot chatbot (reponses basees sur tes chiffres) ---------------- */
  function answerFor(q) {
    var text = (q || "").trim();
    if (!text) return "Pose-moi ta question : ventes, produits, Stripe, clients, pages...";
    var t = text.toLowerCase();
    var m = metrics();

    if (/(vente|chiffre|ca\b|revenu|argent|gagn|vendu)/.test(t)) {
      if (m.revenue <= 0) return "Tu es a 0 € de CA pour l'instant. Priorite logique : 1) connecter Stripe (Reglages) pour encaisser, 2) publier au moins une page de vente, 3) amener du trafic dessus (ton lien de boutique en bio Insta et sur tes reseaux). La 1re vente, c'est surtout une question de visibilite.";
      var base = "Tu es a " + fmtEur(m.revenue) + " de CA sur " + m.orders + " commande" + (m.orders > 1 ? "s" : "") + " (panier moyen " + fmtEur(m.avg) + "). ";
      if (m.revenue < 500) return base + "Bon demarrage ! Pour accelerer : pousse le trafic vers ta page (poste regulierement, lien en bio) et ajoute un upsell apres achat pour monter le panier moyen.";
      if (m.revenue < 2000) return base + "Tu as de la traction. Le levier le plus rentable : optimiser ta page de vente (promesse claire, preuve sociale) pour monter ta conversion (" + pct(m.conv) + " %), et relancer par email les paniers abandonnes.";
      return base + "Beau volume. Structure un tunnel complet (lead magnet -> offre principale -> upsell) et fidelise tes clients existants (offres recurrentes, emails) : c'est bien moins cher que d'acquerir de nouveaux clients.";
    }
    if (/(conversion|taux|trafic|visite|audience)/.test(t)) {
      if (m.visits === 0) return "Tu n'as pas encore de visites enregistrees. Avant de parler conversion, il faut du trafic : partage ton lien de boutique (bio Insta, stories, reseaux) et publie une page de vente claire.";
      return "Ta conversion est de " + pct(m.conv) + " % sur " + m.visits + " visite" + (m.visits > 1 ? "s" : "") + ". " + (m.conv < 2 ? "C'est ameliorable : clarifie ta promesse en haut de page, ajoute des temoignages et un seul bouton d'action bien visible." : "C'est correct ! Pour progresser, teste un upsell et une relance email des paniers abandonnes.");
    }
    if (/(commande|order|achat)/.test(t)) {
      if (m.orders === 0) return "0 commande pour l'instant. Concentre-toi sur la 1re vente : Stripe connecte + une page de vente partagee a ton audience.";
      return "Tu as " + m.orders + " commande" + (m.orders > 1 ? "s" : "") + " pour " + fmtEur(m.revenue) + " de CA (panier moyen " + fmtEur(m.avg) + "). Pour en avoir plus : plus de trafic sur ta page + un upsell apres achat.";
    }
    if (/(panier|ticket moyen|moyen)/.test(t)) {
      if (m.orders === 0) return "Pas encore de commande, donc pas de panier moyen. Reviens ici apres ta 1re vente et je te dirai comment le faire grimper.";
      return "Ton panier moyen est de " + fmtEur(m.avg) + ". Pour le monter : ajoute un upsell (offre complementaire juste apres l'achat), un pack, ou une version premium de ton offre.";
    }
    if (/(stripe|paiement|encaiss|connect|payer)/.test(t)) return "Pour encaisser, connecte ton compte Stripe depuis Reglages puis Paiements. Une fois connecte, chaque vente remonte ici automatiquement (CA a jour : " + fmtEur(m.revenue) + ").";
    if (/(produit|offre|catalogue)/.test(t)) return "Tu as " + m.products + " produit" + (m.products > 1 ? "s" : "") + " publie" + (m.products > 1 ? "s" : "") + ". " + (m.products === 0 ? "Cree ta 1re offre dans Produits, avec une description claire (30+ caracteres) et un fichier d'acces pour la livraison automatique." : "Pense a structurer : un lead magnet gratuit pour capter, une offre principale, et un upsell pour monter le panier.");
    if (/(client|contact|audience|lead|abonn)/.test(t)) return "Tu as " + m.contacts + " contact" + (m.contacts > 1 ? "s" : "") + " dans ton CRM. " + (m.contacts === 0 ? "Ils s'ajoutent tout seuls a chaque achat ; en attendant, un lead magnet gratuit est le meilleur moyen d'en capter." : "Relance-les par email (nouveautes, offres) : ta base existante est ton actif le plus rentable.");
    if (/(page|tunnel|lien|entonnoir)/.test(t)) return "Cree tes pages de vente dans Pages et structure ton tunnel (lead magnet -> offre -> upsell) dans Tunnel. Avec " + fmtEur(m.revenue) + " de CA, " + (m.revenue < 500 ? "l'urgence c'est une page claire qui recoit du trafic." : "l'enjeu c'est d'ajouter les etapes upsell pour monter le panier moyen.");
    if (/(email|mail|resend|livraison|relance)/.test(t)) return "La livraison et les relances email se configurent avec Resend (Reglages). La relance 'panier abandonne' est le quick win le plus rentable" + (m.orders > 0 ? ", vu que tu convertis deja." : ".");
    if (/(commenc|demarr|debut|premier|quoi faire|aide|help|conseil|prochaine|ameliorer)/.test(t)) {
      if (m.revenue <= 0) return "Vu que tu es a 0 € : 1) connecte Stripe, 2) cree et publie ta 1re offre, 3) publie une page de vente, 4) partage son lien a ton audience. Fais ces 4 etapes dans l'ordre.";
      return "Tu es a " + fmtEur(m.revenue) + " de CA. Prochaine action logique : " + (m.revenue < 500 ? "amener plus de trafic sur ta page + ajouter un upsell." : (m.revenue < 2000 ? "optimiser ta page de vente pour monter la conversion (" + pct(m.conv) + " %)." : "structurer un tunnel complet et fideliser tes clients existants."));
    }
    if (/(merci|thanks|top|super|cool|genial)/.test(t)) return "Avec plaisir ! Je reste la.";
    if (/(bonjour|salut|hello|coucou|hey|bonsoir)/.test(t)) return "Salut ! Tu es a " + fmtEur(m.revenue) + " de CA. Dis-moi sur quoi t'aider : vendre plus, ta page, tes chiffres...";
    return "Aujourd'hui : " + fmtEur(m.revenue) + " de CA, " + m.orders + " commande" + (m.orders > 1 ? "s" : "") + ", conversion " + pct(m.conv) + " %. Dis-moi un sujet (ventes, page de vente, Stripe, clients, upsell) et je te donne l'action la plus utile.";
  }

  var CHIPS = ["Ameliorer mes ventes", "Lire mes chiffres", "Ma prochaine action", "Monter mon panier moyen"];

  function mountWidget() {
    if (document.querySelector(".expertly-assistant")) return;
    var root = document.createElement("aside");
    root.className = "expertly-assistant";
    root.innerHTML =
      '<div class="ea-panel" id="eaPanel" hidden>' +
        '<header class="ea-head">' +
          '<div class="ea-avatar" aria-hidden="true">' + ROBOT_IMG + '</div>' +
          '<div class="ea-head-text"><strong>Assistant Expertly</strong>' +
            '<span><i class="ea-dot"></i>IA - base sur tes chiffres</span></div>' +
          '<button class="ea-close" type="button" id="eaClose" aria-label="Fermer">×</button>' +
        '</header>' +
        '<div class="ea-conversation" id="eaConversation"></div>' +
        '<form class="ea-composer" id="eaForm">' +
          '<textarea id="eaInput" rows="1" placeholder="Explique-moi ton besoin..." autocomplete="off"></textarea>' +
          '<button class="ea-send" type="submit" aria-label="Envoyer">↑</button>' +
        '</form>' +
        '<p class="ea-note">Assistant IA - tes chiffres servent a personnaliser les conseils.</p>' +
      '</div>' +
      '<button class="ea-launcher" type="button" id="eaLauncher" aria-label="Ouvrir l\'assistant">' +
        '<span class="ea-launcher-icon" aria-hidden="true">' + ROBOT_IMG + '</span>' +
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
    var history = [];

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
      var m = metrics();
      var intro = m.revenue > 0
        ? ("Bonjour ! Tu es a " + fmtEur(m.revenue) + " de CA sur " + m.orders + " commande" + (m.orders > 1 ? "s" : "") + ". Sur quoi veux-tu que je t'aide ?")
        : "Bonjour, je suis l'assistant Expertly. Tu es a 0 € de CA pour l'instant : je peux t'aider a declencher tes premieres ventes.";
      addMessage(intro, "bot");
      addChips();
    }
    function addTyping() {
      var b = document.createElement("div");
      b.className = "ea-msg ea-msg-bot ea-typing";
      b.textContent = "...";
      conversation.appendChild(b);
      conversation.scrollTop = conversation.scrollHeight;
      return b;
    }
    async function aiAnswer(text, priorHistory) {
      try {
        if (typeof authenticatedFetch !== "function") return answerFor(text);
        var r = await authenticatedFetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: text, history: priorHistory || [] })
        });
        if (r.ok) {
          var d = await r.json().catch(function () { return null; });
          if (d && d.answer) return d.answer;
        } else if (r.status === 429) {
          var e = await r.json().catch(function () { return null; });
          return (e && e.error) || "Tu vas un peu vite, laisse-moi quelques minutes puis repose ta question.";
        }
      } catch (err) { /* repli local ci-dessous */ }
      return answerFor(text);
    }
    function ask(q) {
      var text = (q || "").trim();
      if (!text) return;
      addMessage(text, "user");
      input.value = "";
      input.style.height = "auto";
      var priorHistory = history.slice(-6);
      history.push({ role: "user", text: text });
      var typing = addTyping();
      aiAnswer(text, priorHistory).then(function (ans) {
        if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
        addMessage(ans, "bot");
        history.push({ role: "model", text: ans });
      });
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

  function setNavTooltips() {
    try {
      document.querySelectorAll(".nav-item").forEach(function (n) {
        var l = n.querySelector("span:not(.nav-icon)");
        if (l && !n.title) n.title = l.textContent.trim();
      });
    } catch (e) {}
  }
  function boot() { setNavTooltips(); mountWidget(); startLive(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

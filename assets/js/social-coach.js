/* Expertly - Section Reseaux sociaux (coach IA).
 * Ajoute un onglet sidebar + une vue avec formulaire (@ / plateforme / objectif)
 * qui appelle /api/assistant en mode "social". Autonome (CSS inclus). */
(function () {
  "use strict";
  if (window.__socialCoachLoaded) return;
  window.__socialCoachLoaded = true;

  var CSS = [
    ".sc-wrap{display:grid;grid-template-columns:390px 1fr;gap:16px;align-items:start;}",
    ".sc-card{background:#fff;border:1px solid #edeff3;border-radius:22px;box-shadow:0 12px 30px rgba(20,22,40,.05);padding:22px;}",
    ".sc-plat{display:flex;gap:8px;margin-bottom:16px;}",
    ".sc-plat-btn{flex:1;padding:10px;border-radius:12px;border:1px solid #e6e8ee;background:#fff;font:inherit;font-weight:600;color:#4a4f5c;cursor:pointer;}",
    ".sc-plat-btn.is-on{background:#16171e;color:#fff;border-color:#16171e;}",
    ".sc-label{display:block;font-size:12px;font-weight:600;color:#8a8f9c;margin:10px 0 6px;}",
    ".sc-input{width:100%;box-sizing:border-box;border:1px solid #e2e4ec;border-radius:12px;padding:11px 12px;font:inherit;font-size:14px;color:#16171e;outline:none;}",
    ".sc-input:focus{border-color:#c6f24e;}",
    ".sc-textarea{min-height:92px;resize:vertical;line-height:1.4;}",
    ".sc-go{width:100%;margin-top:16px;padding:12px;border:0;border-radius:14px;background:#16171e;color:#fff;font:inherit;font-weight:700;cursor:pointer;}",
    ".sc-connect{width:100%;margin-top:12px;padding:12px;border:1px solid #dfe3ea;border-radius:14px;background:#f8faf5;color:#16171e;font:inherit;font-weight:700;cursor:pointer;}",
    ".sc-go:disabled{opacity:.6;cursor:default;}",
    ".sc-note{font-size:11px;color:#9aa0ad;margin-top:12px;line-height:1.45;}",
    ".sc-status{margin-top:12px;padding:10px 12px;border-radius:12px;background:#f5f7fb;color:#646b78;font-size:12px;line-height:1.4;}",
    ".sc-result{min-height:220px;}",
    ".sc-empty{color:#9aa0ad;font-size:13px;}",
    ".sc-res-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;}",
    ".sc-res-head strong{font-size:16px;color:#16171e;}",
    ".sc-res-head span{font-size:12px;font-weight:600;color:#5a8f12;background:#eef7d6;border-radius:20px;padding:5px 11px;}",
    ".sc-res-body{white-space:pre-wrap;line-height:1.6;color:#2a2e39;font-size:13.5px;}",
    "@media(max-width:900px){.sc-wrap{grid-template-columns:1fr;}}"
  ].join("");
  var st = document.createElement("style"); st.id = "sc-css"; st.textContent = CSS; document.head.appendChild(st);

  function build() {
    var nav = document.querySelector(".main-nav");
    var content = document.querySelector(".content");
    if (!nav || !content) { setTimeout(build, 150); return; }
    if (document.querySelector("#socialNavItem")) return;

    var btn = document.createElement("button");
    btn.className = "nav-item";
    btn.id = "socialNavItem";
    btn.title = "Reseaux sociaux";
    btn.innerHTML = '<span class="nav-icon">✦</span><span>Reseaux sociaux</span>';
    nav.appendChild(btn);

    var view = document.createElement("section");
    view.className = "view";
    view.id = "socialView";
    view.innerHTML =
      '<div class="page-heading"><div><p class="eyebrow">Croissance</p><h1>Reseaux sociaux</h1><p>Connecte ton compte, puis Gemini analyse automatiquement les donnees officielles.</p></div></div>' +
      '<div class="sc-wrap">' +
        '<div class="sc-card">' +
          '<div class="sc-plat"><button type="button" class="sc-plat-btn is-on" data-p="Instagram">Instagram</button><button type="button" class="sc-plat-btn" data-p="TikTok">TikTok</button></div>' +
          '<label class="sc-label">Ton pseudo (@)</label><input id="scHandle" class="sc-input" placeholder="@ton_compte" autocomplete="off"/>' +
          '<label class="sc-label">Ton objectif / theme (optionnel)</label><textarea id="scObj" class="sc-input sc-textarea" placeholder="Ex: vendre mon accompagnement, cible entrepreneurs debutants"></textarea>' +
          '<button id="scConnect" class="sc-connect" type="button">Connecter le compte</button>' +
          '<button id="scGo" class="sc-go" type="button">Analyser avec Gemini</button>' +
          '<div id="scStatus" class="sc-status">Connecte Instagram ou TikTok pour recuperer automatiquement bio, abonnes, lien en bio, posts, legendes et hashtags.</div>' +
          '<p class="sc-note">Instagram demande un compte professionnel relie a Meta. TikTok demande l\'autorisation officielle du createur.</p>' +
        '</div>' +
        '<div class="sc-card sc-result"><div class="sc-res-head"><strong>Ton compte rendu apparaitra ici</strong></div><p class="sc-empty">Entre ton pseudo, connecte le compte, puis lance l\'analyse. Le backend recupere les infos disponibles via l\'API officielle et les envoie a Gemini.</p></div>' +
      '</div>';
    content.appendChild(view);

    var platform = "Instagram";
    view.querySelectorAll(".sc-plat-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        view.querySelectorAll(".sc-plat-btn").forEach(function (x) { x.classList.remove("is-on"); });
        b.classList.add("is-on"); platform = b.getAttribute("data-p");
      });
    });

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      document.querySelectorAll(".view").forEach(function (v) { v.classList.remove("active"); });
      document.querySelectorAll(".nav-item").forEach(function (n) { n.classList.remove("active"); });
      view.classList.add("active");
      btn.classList.add("active");
      var vt = document.querySelector("#viewTitle"); if (vt) vt.textContent = "Reseaux sociaux";
    });

    var go = view.querySelector("#scGo");
    var connect = view.querySelector("#scConnect");
    var status = view.querySelector("#scStatus");
    var result = view.querySelector(".sc-result");
    var params = new URLSearchParams(window.location.search);
    if (params.get("social") === "connected") status.textContent = "Compte connecte. Tu peux lancer l'analyse Gemini.";
    if (params.get("social") === "error") status.textContent = params.get("message") || "Connexion impossible.";

    connect.addEventListener("click", function () {
      var handle = view.querySelector("#scHandle").value.trim();
      if (!handle) { view.querySelector("#scHandle").focus(); return; }
      connect.disabled = true; connect.textContent = "Redirection...";
      startConnect(handle).then(function (out) {
        if (out.ok && out.url) window.location.href = out.url;
        else {
          status.textContent = out.text;
          connect.disabled = false; connect.textContent = "Connecter le compte";
        }
      });
    });

    go.addEventListener("click", function () {
      var handle = view.querySelector("#scHandle").value.trim();
      var objective = view.querySelector("#scObj").value.trim();
      if (!handle) { view.querySelector("#scHandle").focus(); return; }
      go.disabled = true; go.textContent = "Analyse en cours...";
      result.innerHTML = '<div class="sc-res-head"><strong>Analyse en cours...</strong><span>' + platform + '</span></div><p class="sc-empty">Le backend recupere les donnees du compte connecte puis les envoie a Gemini...</p>';
      analyze({ handle: handle, objective: objective }).then(function (out) {
        if (out.ok) {
          result.innerHTML = '<div class="sc-res-head"><strong>Compte rendu du compte connecte</strong><span>' + platform + '</span></div><div class="sc-res-body"></div>';
          result.querySelector(".sc-res-body").textContent = out.text;
          go.textContent = "Relancer l'analyse";
        } else {
          result.innerHTML = '<div class="sc-res-head"><strong>Oups</strong></div><p class="sc-empty">' + out.text + '</p>';
          go.textContent = "Reessayer";
        }
        go.disabled = false;
      });
    });

    async function startConnect(handle) {
      try {
        if (typeof authenticatedFetch !== "function") return { ok: false, text: "Connexion indisponible." };
        var r = await authenticatedFetch("/api/social/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: platform, handle: handle })
        });
        var d = await r.json().catch(function () { return null; });
        if (r.ok && d && d.url) return { ok: true, url: d.url };
        if (r.status === 503) return { ok: false, text: (d && d.error) || "La connexion n'est pas encore configuree." };
        return { ok: false, text: (d && d.error) || "Connexion impossible." };
      } catch (e) { return { ok: false, text: "Erreur reseau pendant la connexion." }; }
    }

    async function analyze(data) {
      try {
        if (typeof authenticatedFetch !== "function") return { ok: false, text: "Assistant indisponible." };
        var r = await authenticatedFetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "social",
            platform: platform,
            handle: data.handle,
            objective: data.objective
          })
        });
        if (r.ok) { var d = await r.json().catch(function () { return null; }); if (d && d.answer) return { ok: true, text: d.answer }; }
        if (r.status === 429) return { ok: false, text: "Tu vas un peu vite, reessaie dans quelques minutes." };
        if (r.status === 409) return { ok: false, text: "Connecte d'abord le compte " + platform + " avec le bouton a gauche." };
        if (r.status === 503) return { ok: false, text: "L'IA n'est pas encore configuree." };
        return { ok: false, text: "L'analyse a echoue, reessaie dans un instant." };
      } catch (e) { return { ok: false, text: "Erreur reseau, reessaie." }; }
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(build, 120); });
  else setTimeout(build, 120);
})();

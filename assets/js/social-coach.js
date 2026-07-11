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
    ".sc-textarea{min-height:74px;resize:vertical;line-height:1.4;}",
    ".sc-go{width:100%;margin-top:16px;padding:12px;border:0;border-radius:14px;background:#16171e;color:#fff;font:inherit;font-weight:700;cursor:pointer;}",
    ".sc-go:disabled{opacity:.6;cursor:default;}",
    ".sc-note{font-size:11px;color:#9aa0ad;margin-top:12px;line-height:1.45;}",
    ".sc-result{min-height:220px;}",
    ".sc-empty{color:#9aa0ad;font-size:13px;}",
    ".sc-res-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;}",
    ".sc-res-head strong{font-size:16px;color:#16171e;}",
    ".sc-res-head span{font-size:12px;font-weight:600;color:#5a8f12;background:#eef7d6;border-radius:20px;padding:5px 11px;}",
    ".sc-res-body{white-space:pre-wrap;line-height:1.6;color:#2a2e39;font-size:13.5px;}",
    ".sc-res-robot{display:flex;align-items:center;gap:13px;margin-bottom:16px;padding:12px 14px;border-radius:16px;background:#f4f5f8;}",
    ".sc-res-robot img{width:66px;height:58px;object-fit:contain;flex:none;filter:drop-shadow(0 4px 8px rgba(20,22,40,.12));}",
    ".sc-res-robot.good{background:#eef7d6;}",
    ".sc-res-robot.bad{background:#fdecec;}",
    ".sc-res-robot .sc-verdict{font-weight:800;font-size:15px;color:#16171e;}",
    ".sc-res-robot .sc-score{font-size:12.5px;color:#5b6070;margin-top:2px;}",
    ".sc-res-robot.good .sc-score{color:#5a8f12;}",
    ".sc-res-robot.bad .sc-score{color:#c0334e;}",
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
      '<div class="page-heading"><div><p class="eyebrow">Croissance</p><h1>Reseaux sociaux</h1><p>Audit IA de ton compte + plan de contenu oriente vente.</p></div></div>' +
      '<div class="sc-wrap">' +
        '<div class="sc-card">' +
          '<div class="sc-plat"><button type="button" class="sc-plat-btn is-on" data-p="Instagram">Instagram</button><button type="button" class="sc-plat-btn" data-p="TikTok">TikTok</button></div>' +
          '<label class="sc-label">Ton pseudo (@)</label><input id="scHandle" class="sc-input" placeholder="@ton_compte" autocomplete="off"/>' +
          '<label class="sc-label">Ton objectif / theme (optionnel)</label><textarea id="scObj" class="sc-input sc-textarea" placeholder="Ex: vendre mon accompagnement, cible entrepreneurs debutants"></textarea>' +
          '<button id="scGo" class="sc-go" type="button">Analyser mon compte</button>' +
          '<p class="sc-note">L\'IA n\'a pas acces a tes vraies stats : elle te donne une strategie et des idees concretes, sans inventer de chiffres.</p>' +
        '</div>' +
        '<div class="sc-card sc-result"><div class="sc-res-head"><strong>Ton audit apparaitra ici</strong></div><p class="sc-empty">Renseigne ton pseudo et lance l\'analyse : tu recevras un positionnement, 5 idees de contenu, 3 accroches, un rythme de publication et comment convertir en ventes.</p></div>' +
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
    var result = view.querySelector(".sc-result");
    go.addEventListener("click", function () {
      var handle = view.querySelector("#scHandle").value.trim();
      var objective = view.querySelector("#scObj").value.trim();
      if (!handle) { view.querySelector("#scHandle").focus(); return; }
      go.disabled = true; go.textContent = "Analyse en cours...";
      result.innerHTML = '<div class="sc-res-head"><strong>Analyse en cours...</strong><span>' + platform + '</span></div><p class="sc-empty">L\'IA prepare ton audit et ton plan de contenu pour ' + handle + '...</p>';
      analyze(handle, objective).then(function (out) {
        if (out.ok) {
          var raw = out.text;
          var note = null;
          var mm = raw.match(/\[\[\s*NOTE\s*:\s*(\d{1,3})\s*\]\]/i);
          if (mm) { note = Math.max(0, Math.min(100, parseInt(mm[1], 10))); raw = raw.replace(mm[0], "").replace(/^\s+/, ""); }
          var good = note == null ? null : note >= 60;
          var robotSrc = good === null ? "/assets/robot-chat.png" : (good ? "/assets/robot-good.png" : "/assets/robot-bad.png");
          var cls = good === null ? "" : (good ? "good" : "bad");
          var verdict = good === null ? "Ton audit est prêt" : (good ? "Bon potentiel !" : "Compte à renforcer");
          var scoreLine = note == null ? "Voici ton plan d'action" : ("Note du compte : " + note + "/100");
          result.innerHTML =
            '<div class="sc-res-robot ' + cls + '"><img src="' + robotSrc + '" alt="" />' +
              '<div><div class="sc-verdict">' + verdict + '</div><div class="sc-score">' + scoreLine + '</div></div></div>' +
            '<div class="sc-res-head"><strong>Audit & plan de contenu</strong><span>' + platform + '</span></div>' +
            '<div class="sc-res-body"></div>';
          result.querySelector(".sc-res-body").textContent = raw;
          go.textContent = "Relancer l'analyse";
        } else {
          result.innerHTML = '<div class="sc-res-head"><strong>Oups</strong></div><p class="sc-empty">' + out.text + '</p>';
          go.textContent = "Reessayer";
        }
        go.disabled = false;
      });
    });

    async function analyze(handle, objective) {
      try {
        if (typeof authenticatedFetch !== "function") return { ok: false, text: "Assistant indisponible." };
        var r = await authenticatedFetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "social", platform: platform, handle: handle, objective: objective })
        });
        if (r.ok) { var d = await r.json().catch(function () { return null; }); if (d && d.answer) return { ok: true, text: d.answer }; }
        if (r.status === 429) return { ok: false, text: "Tu vas un peu vite, reessaie dans quelques minutes." };
        if (r.status === 503) return { ok: false, text: "L'IA n'est pas encore configuree." };
        return { ok: false, text: "L'analyse a echoue, reessaie dans un instant." };
      } catch (e) { return { ok: false, text: "Erreur reseau, reessaie." }; }
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(build, 120); });
  else setTimeout(build, 120);
})();

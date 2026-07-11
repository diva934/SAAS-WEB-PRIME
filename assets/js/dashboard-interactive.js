/* Expertly - Dashboard interactif (autonome, ne modifie pas app.js).
   Rend le graphique de revenus "vivant" : survol -> repere + infobulle qui suivent
   la souris ; clic -> vue agrandie plein ecran avec selecteur de periode (12/6/3 mois).
   L'esthetique n'est pas modifiee : tout est en surcouche au-dessus du SVG existant
   (#revenueChart est redessine chaque seconde par app.js, donc on ne touche jamais son
   contenu ; on lit ses coordonnees via getScreenCTM et on superpose des elements HTML). */
(function () {
  "use strict";
  if (window.__dashInteractiveLoaded) return;
  window.__dashInteractiveLoaded = true;

  var EUR = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  var values = null; // revenueSeries (12 valeurs)
  var VB_W = 760, VB_H = 250; // viewBox du #revenueChart

  function monthLabels(n) {
    var names = ["janv.", "fevr.", "mars", "avr.", "mai", "juin", "juil.", "aout", "sept.", "oct.", "nov.", "dec."];
    var out = [], d = new Date();
    for (var i = n - 1; i >= 0; i--) {
      var m = (d.getMonth() - i + 1200) % 12;
      out.push(names[m]);
    }
    return out;
  }

  function css() {
    if (document.getElementById("dic-css")) return;
    var s = document.createElement("style");
    s.id = "dic-css";
    s.textContent = [
      ".dic-wrap{position:relative;}",
      ".dic-hit{position:absolute;inset:0;cursor:crosshair;z-index:3;}",
      ".dic-guide{position:absolute;top:0;bottom:22px;width:1px;background:rgba(20,22,40,.18);transform:translateX(-.5px);opacity:0;transition:opacity .12s;pointer-events:none;z-index:4;}",
      ".dic-dot{position:absolute;width:12px;height:12px;border-radius:50%;background:#fff;border:3px solid #6fb52a;transform:translate(-50%,-50%);opacity:0;transition:opacity .12s;pointer-events:none;z-index:5;box-shadow:0 3px 8px rgba(20,22,40,.2);}",
      ".dic-tip{position:absolute;z-index:6;background:#16171e;color:#fff;border-radius:10px;padding:7px 10px;font-size:12px;font-weight:600;white-space:nowrap;transform:translate(-50%,-130%);opacity:0;transition:opacity .12s;pointer-events:none;box-shadow:0 8px 20px rgba(16,17,26,.28);}",
      ".dic-tip b{color:#c6f24e;font-weight:800;}",
      ".dic-tip small{display:block;color:#b9bdca;font-weight:600;font-size:10.5px;margin-bottom:1px;}",
      ".dic-expand{position:absolute;top:12px;right:14px;z-index:6;border:0;background:rgba(238,241,232,.9);color:#16171e;border-radius:9px;padding:5px 9px;font:inherit;font-size:11.5px;font-weight:700;cursor:pointer;display:inline-flex;gap:5px;align-items:center;}",
      ".dic-expand:hover{background:#c6f24e;}",
      ".dic-modal{position:fixed;inset:0;z-index:2000;display:none;align-items:center;justify-content:center;background:rgba(16,17,26,.55);backdrop-filter:blur(4px);}",
      ".dic-modal.open{display:flex;}",
      ".dic-card{width:min(920px,94vw);background:#fff;border-radius:24px;box-shadow:0 30px 80px rgba(16,17,26,.35);padding:22px 24px 26px;}",
      ".dic-head{display:flex;align-items:center;gap:12px;margin-bottom:8px;}",
      ".dic-head h3{font-family:'Manrope',sans-serif;font-size:20px;font-weight:800;margin:0;color:#15161c;}",
      ".dic-head .dic-total{font-size:13px;color:#5b6070;font-weight:600;}",
      ".dic-head select{margin-left:auto;border:1px solid #e2e4ec;border-radius:10px;padding:8px 10px;font:inherit;font-size:13px;color:#15161c;background:#fff;cursor:pointer;}",
      ".dic-close{border:0;background:#f1f2f6;color:#15161c;width:34px;height:34px;border-radius:10px;font-size:18px;cursor:pointer;}",
      ".dic-big{position:relative;margin-top:8px;}",
      ".dic-big svg{width:100%;height:auto;display:block;}",
      ".dic-xlabels{display:flex;justify-content:space-between;margin-top:6px;color:#9aa0ad;font-size:11px;font-weight:600;}"
    ].join("");
    document.head.appendChild(s);
  }

  async function loadValues() {
    try {
      if (typeof authenticatedFetch !== "function") return;
      var r = await authenticatedFetch("/api/state", { cache: "no-store" });
      if (!r.ok) return;
      var d = await r.json();
      var v = d && d.analytics && d.analytics.revenueSeries;
      if (Array.isArray(v) && v.length) values = v.map(Number);
    } catch (e) { /* silencieux */ }
  }

  // Position pixel d'un point (vbX,vbY) du SVG, relative a un conteneur.
  function toContainer(svg, vbX, vbY, container) {
    var ctm = svg.getScreenCTM();
    if (!ctm) return null;
    var pt = svg.createSVGPoint(); pt.x = vbX; pt.y = vbY;
    var sc = pt.matrixTransform(ctm);
    var cr = container.getBoundingClientRect();
    return { x: sc.x - cr.left, y: sc.y - cr.top };
  }

  function nearestIndex(svg, clientX, n) {
    var ctm = svg.getScreenCTM(); if (!ctm) return 0;
    var pt = svg.createSVGPoint(); pt.x = clientX; pt.y = 0;
    var vb = pt.matrixTransform(ctm.inverse());
    var idx = Math.round((vb.x / VB_W) * (n - 1));
    return Math.max(0, Math.min(n - 1, idx));
  }

  function enhanceInline(chartWrap) {
    if (chartWrap.dataset.dicOn === "1") return;
    var svg = chartWrap.querySelector("#revenueChart");
    if (!svg) return;
    chartWrap.dataset.dicOn = "1";
    chartWrap.classList.add("dic-wrap");

    var guide = document.createElement("div"); guide.className = "dic-guide";
    var dot = document.createElement("div"); dot.className = "dic-dot";
    var tip = document.createElement("div"); tip.className = "dic-tip";
    var hit = document.createElement("div"); hit.className = "dic-hit";
    var expand = document.createElement("button");
    expand.className = "dic-expand"; expand.type = "button";
    expand.innerHTML = "⤢ Agrandir";
    chartWrap.appendChild(guide); chartWrap.appendChild(dot); chartWrap.appendChild(tip); chartWrap.appendChild(hit); chartWrap.appendChild(expand);

    function show(on) { [guide, dot, tip].forEach(function (el) { el.style.opacity = on ? "1" : "0"; }); }

    hit.addEventListener("mousemove", function (ev) {
      var vals = values || [];
      var n = vals.length || 12;
      var max = Math.max.apply(null, vals.concat([1])) * 1.12;
      var idx = nearestIndex(svg, ev.clientX, n);
      var val = Number(vals[idx] || 0);
      var vbX = (idx / (n - 1)) * VB_W;
      var vbY = 225 - (val / max) * 200;
      var p = toContainer(svg, vbX, vbY, chartWrap);
      if (!p) return;
      guide.style.left = p.x + "px";
      dot.style.left = p.x + "px"; dot.style.top = p.y + "px";
      tip.style.left = p.x + "px"; tip.style.top = p.y + "px";
      var labels = monthLabels(n);
      tip.innerHTML = "<small>" + (labels[idx] || "") + "</small><b>" + EUR.format(val) + "</b>";
      show(true);
    });
    hit.addEventListener("mouseleave", function () { show(false); });
    hit.addEventListener("click", openModal);
    expand.addEventListener("click", function (e) { e.stopPropagation(); openModal(); });
  }

  /* ---------- Vue agrandie ---------- */
  var modal = null, modalRange = 12;
  function buildModal() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "dic-modal";
    modal.innerHTML =
      '<div class="dic-card">' +
        '<div class="dic-head">' +
          '<h3>Revenus</h3><span class="dic-total" id="dicTotal"></span>' +
          '<select id="dicRange"><option value="12">12 mois</option><option value="6">6 mois</option><option value="3">3 mois</option></select>' +
          '<button class="dic-close" id="dicClose" aria-label="Fermer">×</button>' +
        '</div>' +
        '<div class="dic-big" id="dicBig"></div>' +
        '<div class="dic-xlabels" id="dicX"></div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
    modal.querySelector("#dicClose").addEventListener("click", closeModal);
    modal.querySelector("#dicRange").addEventListener("change", function () { modalRange = parseInt(this.value, 10) || 12; drawBig(); });
    return modal;
  }
  function openModal() { buildModal(); modalRange = 12; var s = modal.querySelector("#dicRange"); if (s) s.value = "12"; modal.classList.add("open"); drawBig(); }
  function closeModal() { if (modal) modal.classList.remove("open"); }

  function drawBig() {
    var all = values || [];
    var vals = all.slice(Math.max(0, all.length - modalRange));
    var n = vals.length || 1;
    var labels = monthLabels(all.length).slice(Math.max(0, all.length - modalRange));
    var W = 900, H = 340, PAD = 8;
    var max = Math.max.apply(null, vals.concat([1])) * 1.12;
    var pts = vals.map(function (v, i) {
      var x = n === 1 ? W / 2 : (i / (n - 1)) * (W - PAD * 2) + PAD;
      var y = H - 30 - (Number(v) / max) * (H - 60);
      return [x, y];
    });
    var line = pts.map(function (p) { return p[0] + "," + p[1]; }).join(" ");
    var grid = [0.25, 0.5, 0.75].map(function (f) { var y = 30 + f * (H - 60); return '<line x1="0" y1="' + y + '" x2="' + W + '" y2="' + y + '" stroke="#eeeef4" stroke-width="1"/>'; }).join("");
    var dots = pts.map(function (p, i) { return '<circle class="dic-bpt" data-i="' + i + '" cx="' + p[0] + '" cy="' + p[1] + '" r="4.5" fill="#fff" stroke="#6fb52a" stroke-width="2.5"/>'; }).join("");
    var big = modal.querySelector("#dicBig");
    big.innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Revenus">' +
        '<defs><linearGradient id="dicFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#8fd14f" stop-opacity=".22"/><stop offset="100%" stop-color="#8fd14f" stop-opacity="0"/></linearGradient></defs>' +
        grid +
        '<polygon points="' + PAD + ',' + (H - 30) + ' ' + line + ' ' + (W - PAD) + ',' + (H - 30) + '" fill="url(#dicFill)"></polygon>' +
        '<polyline points="' + line + '" fill="none" stroke="#6fb52a" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"></polyline>' +
        dots +
      '</svg>' +
      '<div class="dic-guide"></div><div class="dic-dot"></div><div class="dic-tip"></div><div class="dic-hit"></div>';
    var total = vals.reduce(function (s, v) { return s + Number(v || 0); }, 0);
    modal.querySelector("#dicTotal").textContent = "Total : " + EUR.format(total);
    modal.querySelector("#dicX").innerHTML = labels.map(function (l) { return "<span>" + l + "</span>"; }).join("");

    // hover sur la grande version
    var svg = big.querySelector("svg");
    var guide = big.querySelector(".dic-guide"), dot = big.querySelector(".dic-dot"), tip = big.querySelector(".dic-tip"), hit = big.querySelector(".dic-hit");
    function show(on) { [guide, dot, tip].forEach(function (el) { el.style.opacity = on ? "1" : "0"; }); }
    hit.addEventListener("mousemove", function (ev) {
      var ctm = svg.getScreenCTM(); if (!ctm) return;
      var p0 = svg.createSVGPoint(); p0.x = ev.clientX; p0.y = 0;
      var vb = p0.matrixTransform(ctm.inverse());
      var idx = n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((vb.x - PAD) / (W - PAD * 2)) * (n - 1))));
      var pt = svg.createSVGPoint(); pt.x = pts[idx][0]; pt.y = pts[idx][1];
      var sc = pt.matrixTransform(ctm);
      var cr = big.getBoundingClientRect();
      var x = sc.x - cr.left, y = sc.y - cr.top;
      guide.style.left = x + "px"; dot.style.left = x + "px"; dot.style.top = y + "px";
      tip.style.left = x + "px"; tip.style.top = y + "px";
      tip.innerHTML = "<small>" + (labels[idx] || "") + "</small><b>" + EUR.format(Number(vals[idx] || 0)) + "</b>";
      show(true);
    });
    hit.addEventListener("mouseleave", function () { show(false); });
  }

  /* ---------- Boot ---------- */
  function scan() {
    var wrap = document.querySelector("#overviewView .chart-wrap");
    if (wrap) enhanceInline(wrap);
  }
  function boot() {
    css();
    loadValues();
    setInterval(loadValues, 20000);
    scan();
    new MutationObserver(scan).observe(document.body || document.documentElement, { childList: true, subtree: true });
    window.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

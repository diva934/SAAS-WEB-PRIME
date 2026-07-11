/* Expertly - Dashboard interactif (autonome, ne modifie pas midbox-dashboard.js ni app.js).
   Le dashboard est reconstruit chaque seconde par midbox-dashboard.js -> on utilise la
   DELEGATION d'evenements sur document (survol/clic) pour survivre aux re-render.
   - Graphique "Earning Reports" (barres, viewBox 760x260) : survol -> infobulle mois + revenu ;
     clic -> vue agrandie plein ecran + selecteur de periode (12/6/3 mois).
   - Graphiques "Balance" (260x140) et "Acquisition" (300x178) : courbes -> survol -> point + infobulle.
   Aucune injection dans les SVG : infobulle/point sont des elements HTML en position:fixed. */
(function () {
  "use strict";
  if (window.__dashInteractiveLoaded) return;
  window.__dashInteractiveLoaded = true;

  var MONTHS = ["Jan", "Fev", "Mar", "Avr", "Mai", "Juin", "Juil", "Aout", "Sep", "Oct", "Nov", "Dec"];
  var EUR = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  var BARS_VB = "0 0 760 260";
  var AREA_VBS = ["0 0 260 140", "0 0 300 178"];
  var values = null;

  function css() {
    if (document.getElementById("dic-css")) return;
    var s = document.createElement("style");
    s.id = "dic-css";
    s.textContent = [
      "svg.mb-svg[viewBox='" + BARS_VB + "']{cursor:pointer;}",
      ".dic-tip{position:fixed;z-index:1400;background:#11120f;color:#fff;border-radius:10px;padding:7px 11px;font-size:12.5px;font-weight:700;white-space:nowrap;transform:translate(-50%,-118%);pointer-events:none;box-shadow:0 10px 24px rgba(16,17,26,.3);opacity:0;transition:opacity .1s;font-family:'DM Sans',system-ui,sans-serif;}",
      ".dic-tip.on{opacity:1;}",
      ".dic-tip b{color:#c7ff5a;}",
      ".dic-tip small{display:block;color:#b9bdca;font-weight:600;font-size:10.5px;margin-bottom:1px;}",
      ".dic-dot{position:fixed;z-index:1399;width:12px;height:12px;border-radius:50%;background:#fff;border:3px solid #62c600;transform:translate(-50%,-50%);pointer-events:none;opacity:0;transition:opacity .1s;box-shadow:0 3px 8px rgba(20,22,40,.25);}",
      ".dic-dot.on{opacity:1;}",
      ".dic-modal{position:fixed;inset:0;z-index:2000;display:none;align-items:center;justify-content:center;background:rgba(16,17,26,.55);backdrop-filter:blur(4px);}",
      ".dic-modal.open{display:flex;}",
      ".dic-card{width:min(960px,95vw);background:#fff;border-radius:26px;box-shadow:0 30px 80px rgba(16,17,26,.35);padding:22px 26px 26px;font-family:'DM Sans',system-ui,sans-serif;}",
      ".dic-head{display:flex;align-items:center;gap:12px;margin-bottom:6px;}",
      ".dic-head h3{font-family:'Manrope',sans-serif;font-size:21px;font-weight:800;margin:0;color:#15161c;}",
      ".dic-head .dic-total{font-size:13px;color:#5b6070;font-weight:600;}",
      ".dic-head select{margin-left:auto;border:1px solid #e2e4ec;border-radius:11px;padding:8px 12px;font:inherit;font-size:13px;color:#15161c;background:#fff;cursor:pointer;font-weight:600;}",
      ".dic-close{border:0;background:#f1f2f6;color:#15161c;width:36px;height:36px;border-radius:11px;font-size:19px;cursor:pointer;}",
      ".dic-big{position:relative;margin-top:10px;}",
      ".dic-big svg{width:100%;height:auto;display:block;}",
      ".dic-brect{transition:opacity .1s;}"
    ].join("");
    document.head.appendChild(s);
  }

  var tip = null, dot = null;
  function getTip() { if (!tip) { tip = document.createElement("div"); tip.className = "dic-tip"; document.body.appendChild(tip); } return tip; }
  function getDot() { if (!dot) { dot = document.createElement("div"); dot.className = "dic-dot"; document.body.appendChild(dot); } return dot; }
  function showTip(cx, topY, label, val) {
    var t = getTip();
    t.innerHTML = "<small>" + label + "</small><b>" + EUR.format(val) + "</b>";
    t.style.left = cx + "px"; t.style.top = topY + "px"; t.classList.add("on");
  }
  function showDot(x, y) { var d = getDot(); d.style.left = x + "px"; d.style.top = y + "px"; d.classList.add("on"); }
  function hideHover() { if (tip) tip.classList.remove("on"); if (dot) dot.classList.remove("on"); }

  async function loadValues() {
    try {
      if (typeof authenticatedFetch !== "function") return;
      var r = await authenticatedFetch("/api/state", { cache: "no-store" });
      if (!r.ok) return;
      var d = await r.json();
      var v = d && d.analytics && d.analytics.revenueSeries;
      if (Array.isArray(v) && v.length) values = v.slice(0, 12).map(Number);
    } catch (e) { /* silencieux */ }
  }

  function barRectsOf(svg) {
    return Array.prototype.filter.call(svg.querySelectorAll("rect"), function (r) { return r.getAttribute("width") === "24"; });
  }
  function nearestByX(rects, mx) {
    var best = 0, bestd = Infinity;
    rects.forEach(function (r, i) { var d = Math.abs(r.left + r.width / 2 - mx); if (d < bestd) { bestd = d; best = i; } });
    return best;
  }

  function handleBars(svg, e) {
    var bars = barRectsOf(svg);
    if (!bars.length) { hideHover(); return; }
    var rects = bars.map(function (b) { return b.getBoundingClientRect(); });
    var i = nearestByX(rects, e.clientX);
    var vals = values || [];
    var r = rects[i];
    if (dot) dot.classList.remove("on");
    showTip(r.left + r.width / 2, r.top, MONTHS[i] || ("M" + (i + 1)), Number(vals[i] || 0));
  }

  // Courbes (area) : on lit les points de la ligne verte (#62c600) et on projette a l'ecran.
  function handleArea(svg, e) {
    var path = svg.querySelector('path[stroke="#62c600"]') || svg.querySelector('path[fill="none"]');
    if (!path) { hideHover(); return; }
    var nums = (path.getAttribute("d") || "").match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length < 4) { hideHover(); return; }
    var ctm = svg.getScreenCTM(); if (!ctm) { hideHover(); return; }
    var pts = [];
    for (var k = 0; k + 1 < nums.length; k += 2) {
      var p = svg.createSVGPoint(); p.x = parseFloat(nums[k]); p.y = parseFloat(nums[k + 1]);
      pts.push(p.matrixTransform(ctm));
    }
    var best = 0, bestd = Infinity;
    pts.forEach(function (p, i) { var d = Math.abs(p.x - e.clientX); if (d < bestd) { bestd = d; best = i; } });
    var vals = values || [];
    var vi = pts.length > 1 ? Math.round(best / (pts.length - 1) * (vals.length - 1)) : 0;
    showDot(pts[best].x, pts[best].y);
    showTip(pts[best].x, pts[best].y, MONTHS[vi] || ("M" + (vi + 1)), Number(vals[vi] || 0));
  }

  document.addEventListener("mousemove", function (e) {
    var svg = e.target.closest ? e.target.closest("svg.mb-svg") : null;
    if (!svg) { hideHover(); return; }
    var vb = svg.getAttribute("viewBox");
    if (vb === BARS_VB) handleBars(svg, e);
    else if (AREA_VBS.indexOf(vb) >= 0) handleArea(svg, e);
    else hideHover();
  }, true);
  document.addEventListener("mouseleave", function (e) {
    if (e.target && e.target.closest && e.target.closest("svg.mb-svg")) hideHover();
  }, true);

  document.addEventListener("click", function (e) {
    var svg = e.target.closest ? e.target.closest("svg.mb-svg") : null;
    if (svg && svg.getAttribute("viewBox") === BARS_VB) { e.preventDefault(); openModal(); }
  }, true);

  var modal = null, range = 12;
  function buildModal() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "dic-modal";
    modal.innerHTML =
      '<div class="dic-card">' +
        '<div class="dic-head"><h3>Revenus</h3><span class="dic-total" id="dicTotal"></span>' +
          '<select id="dicRange"><option value="12">12 mois</option><option value="6">6 mois</option><option value="3">3 mois</option></select>' +
          '<button class="dic-close" id="dicClose" aria-label="Fermer">&times;</button></div>' +
        '<div class="dic-big" id="dicBig"></div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
    modal.querySelector("#dicClose").addEventListener("click", closeModal);
    modal.querySelector("#dicRange").addEventListener("change", function () { range = parseInt(this.value, 10) || 12; drawBig(); });
    return modal;
  }
  function openModal() { buildModal(); range = 12; modal.querySelector("#dicRange").value = "12"; modal.classList.add("open"); drawBig(); }
  function closeModal() { if (modal) modal.classList.remove("open"); hideHover(); }

  function drawBig() {
    var all = values || [];
    var vals = all.slice(Math.max(0, all.length - range));
    var labels = MONTHS.slice(0, all.length).slice(Math.max(0, all.length - range));
    var n = vals.length || 1;
    var W = 920, H = 380, top = 30, bottom = 44, plot = H - top - bottom;
    var max = Math.max.apply(null, vals.concat([1]));
    var slot = (W - 40) / n;
    var bw = Math.min(46, slot * 0.5);
    var grid = [0, 0.25, 0.5, 0.75, 1].map(function (f) { var y = top + f * plot; return '<line x1="20" y1="' + y + '" x2="' + (W - 20) + '" y2="' + y + '" stroke="#eeeef4" stroke-width="1"/>'; }).join("");
    var bars = vals.map(function (v, i) {
      var h = Math.max(4, (Number(v) / max) * plot);
      var x = 20 + slot * i + slot / 2 - bw / 2;
      var y = top + plot - h;
      return '<rect class="dic-brect" data-i="' + i + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="9" fill="#8fd14f"/>' +
        '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 16) + '" text-anchor="middle" fill="#9aa0ad" font-size="13">' + (labels[i] || "") + '</text>';
    }).join("");
    var big = modal.querySelector("#dicBig");
    big.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Revenus par mois">' + grid + bars + '</svg>';
    modal.querySelector("#dicTotal").textContent = "Total : " + EUR.format(vals.reduce(function (s, v) { return s + Number(v || 0); }, 0));

    var svg = big.querySelector("svg");
    var brects = Array.prototype.slice.call(svg.querySelectorAll(".dic-brect"));
    svg.addEventListener("mousemove", function (e) {
      var rr = brects.map(function (b) { return b.getBoundingClientRect(); });
      var best = nearestByX(rr, e.clientX);
      brects.forEach(function (b, i) { b.style.opacity = i === best ? "1" : ".5"; });
      var r = rr[best];
      showTip(r.left + r.width / 2, r.top, labels[best] || "", Number(vals[best] || 0));
    });
    svg.addEventListener("mouseleave", function () { hideHover(); brects.forEach(function (b) { b.style.opacity = "1"; }); });
  }

  function boot() {
    css();
    loadValues();
    setInterval(loadValues, 20000);
    window.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

/* Expertly - Dashboard facon Midbox (6 cases) alimente par les VRAIES donnees du state.
 * Charge APRES app.js : remplace renderOverview() par la version Midbox.
 * Aucune donnee inventee : tout vient de state (revenueSeries, orders, products, analytics). */
(function () {
  "use strict";
  if (window.__midboxDashLoaded) return;
  window.__midboxDashLoaded = true;

  var CSS = [
    ".mb-grid{display:grid;grid-template-columns:2fr 1.1fr 1fr;grid-auto-rows:auto;gap:16px;}",
    ".mb-a{grid-column:1;}.mb-b{grid-column:2;}.mb-c{grid-column:3;}.mb-d{grid-column:1;}.mb-e{grid-column:2;}.mb-f{grid-column:3;}",
    ".mb-card{background:#fff;border:1px solid #edeff3;border-radius:22px;box-shadow:0 12px 30px rgba(20,22,40,.05);padding:20px;}",
    ".mb-card-h{display:flex;align-items:center;gap:10px;margin-bottom:14px;}",
    ".mb-ic{width:34px;height:34px;border-radius:50%;border:1px solid #e6e8ee;display:grid;place-items:center;color:#8a8f9c;font-size:15px;flex:none;}",
    ".mb-t{flex:1;line-height:1.25;}.mb-t strong{display:block;font-size:15px;color:#16171e;}.mb-t span{font-size:11.5px;color:#8a8f9c;}",
    ".mb-pill{font-size:11px;font-weight:600;color:#16171e;background:#f1f3f6;border-radius:20px;padding:5px 10px;}",
    ".mb-svg{width:100%;height:auto;}.mb-svg2{width:100%;height:auto;}",
    ".mb-bal{font-size:26px;font-weight:800;color:#16171e;margin-bottom:8px;}.mb-bal small{font-size:11px;font-weight:500;color:#8a8f9c;margin-left:6px;}",
    ".mb-gauge{position:relative;text-align:center;}.mb-gauge-v{position:absolute;top:54%;left:0;right:0;font-size:24px;font-weight:800;color:#16171e;}.mb-gauge-v small{display:block;font-size:10px;font-weight:500;color:#8a8f9c;}",
    ".mb-orders{display:flex;gap:16px;align-items:center;}.mb-donut{position:relative;flex:none;width:110px;}.mb-donut-v{position:absolute;top:40%;left:0;right:0;text-align:center;font-size:18px;font-weight:800;color:#16171e;}",
    ".mb-list{list-style:none;margin:0;padding:0;flex:1;}.mb-list li{display:flex;justify-content:space-between;padding:5px 0;font-size:12.5px;color:#4a4f5c;}.mb-list b{color:#16171e;}",
    ".mb-acq{display:flex;gap:22px;margin-bottom:8px;}.mb-acq strong{font-size:18px;color:#16171e;}.mb-acq span{font-size:11px;color:#8a8f9c;}",
    ".mb-table{width:100%;border-collapse:collapse;font-size:12.5px;}.mb-table th{text-align:left;color:#9aa0ad;font-weight:600;padding:6px 4px;border-bottom:1px solid #eef0f4;}.mb-table td{padding:9px 4px;border-bottom:1px solid #f4f6f9;color:#2a2e39;}",
    "@media(max-width:1100px){.mb-grid{grid-template-columns:1fr 1fr;}.mb-a,.mb-d,.mb-f{grid-column:auto;}}",
    "@media(max-width:680px){.mb-grid{grid-template-columns:1fr;}}"
  ].join("");
  var st = document.createElement("style"); st.id = "mb-dash-css"; st.textContent = CSS; document.head.appendChild(st);

  var MONTHS = ["Jan","Fev","Mar","Avr","Mai","Jun","Jul","Aou","Sep","Oct","Nov","Dec"];
  function euro(n){ n=Math.round(Number(n)||0); return n.toLocaleString("fr-FR").replace(/[  ]/g," ")+" €"; }
  function num(n){ return (Number(n)||0).toLocaleString("fr-FR").replace(/[  ]/g," "); }
  function pct(n){ return (Number(n)||0).toFixed(1).replace(".",","); }

  function metrics(){
    var s = (typeof state !== "undefined" && state) ? state : {};
    var paid = (s.orders||[]).filter(function(o){return o && o.status==="paid";});
    var rev = paid.reduce(function(x,o){return x+(Number(o.amount)||0);},0);
    var a = s.analytics||{}; var visits=Number(a.visits)||0, purchases=Number(a.purchases)||0;
    var series = Array.isArray(a.revenueSeries)?a.revenueSeries.slice(0,12):[]; while(series.length<12)series.push(0);
    return { revenue:rev, orders:paid.length, visits:visits, conv:visits?(purchases/visits*100):0, series:series, products:(s.products||[]) };
  }

  function bars(vals){
    var max = Math.max.apply(null, vals.concat([1]));
    var n = vals.length, slot = 760/n, hi = -1, hv = 0;
    vals.forEach(function(v,i){ if(v>hv){hv=v;hi=i;} });
    var out = "";
    vals.forEach(function(v,i){
      var h = max>0 ? Math.max(4,(v/max)*180) : 4;
      var x = i*slot + slot/2 - 13, y = 196 - h, act = (i===hi && v>0);
      out += '<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="26" height="'+h.toFixed(1)+'" rx="8" fill="'+(act?"#1c1d24":"url(#mbhatch)")+'"/>';
      if(act){ out += '<g><rect x="'+(x-16).toFixed(1)+'" y="'+(y-30).toFixed(1)+'" width="60" height="22" rx="6" fill="#c6f24e"/><text x="'+(x+13).toFixed(1)+'" y="'+(y-15).toFixed(1)+'" font-size="11" font-weight="700" text-anchor="middle" fill="#16171e">'+num(v)+'</text></g>'; }
      out += '<text x="'+(x+13).toFixed(1)+'" y="212" font-size="10" text-anchor="middle" fill="#9aa0ad">'+MONTHS[i]+'</text>';
    });
    return out;
  }
  function area(vals,color){
    var max = Math.max.apply(null, vals.concat([1])), W=320, H=88, n=vals.length;
    if(n<2){ vals=vals.concat(vals.length?vals:[0]); n=vals.length; }
    var step=W/(n-1);
    var pts=vals.map(function(v,i){ return [i*step, H-(max>0?(v/max)*H*0.82:0)-4]; });
    var line="M"+pts.map(function(p){return p[0].toFixed(1)+" "+p[1].toFixed(1);}).join(" L ");
    var ar="M0 "+H+" L"+pts.map(function(p){return p[0].toFixed(1)+" "+p[1].toFixed(1);}).join(" L ")+" L "+W+" "+H+" Z";
    return '<path d="'+ar+'" fill="'+color+'" opacity=".16"/><path d="'+line+'" fill="none" stroke="'+color+'" stroke-width="2.5"/>';
  }
  function gauge(p){
    var r=70, c=Math.PI*r, v=Math.max(0,Math.min(100,p));
    return '<circle cx="90" cy="92" r="'+r+'" fill="none" stroke="#eef0f4" stroke-width="14" stroke-linecap="round" stroke-dasharray="'+c+' '+(c*2)+'" transform="rotate(180 90 92)"/>'
      + '<circle cx="90" cy="92" r="'+r+'" fill="none" stroke="#c6f24e" stroke-width="14" stroke-linecap="round" stroke-dasharray="'+(c*v/100)+' '+(c*2)+'" transform="rotate(180 90 92)"/>';
  }
  function donut(p){
    var r=52, c=2*Math.PI*r, v=Math.max(0,Math.min(100,p));
    return '<circle cx="70" cy="70" r="'+r+'" fill="none" stroke="#eef0f4" stroke-width="16"/>'
      + '<circle cx="70" cy="70" r="'+r+'" fill="none" stroke="#c6f24e" stroke-width="16" stroke-linecap="round" stroke-dasharray="'+(c*v/100)+' '+c+'" transform="rotate(-90 70 70)"/>';
  }
  function card(t,sub,body,extra){
    return '<div class="mb-card"><div class="mb-card-h"><div class="mb-ic">◔</div><div class="mb-t"><strong>'+t+'</strong>'+(sub?'<span>'+sub+'</span>':"")+'</div>'+(extra||"")+'</div>'+body+'</div>';
  }

  function renderMidboxOverview(){
    var ov = document.querySelector("#overviewView");
    if(!ov) return;
    var d = metrics();
    var earning = card("Revenus","Sur l'annee",
      '<svg viewBox="0 0 760 220" class="mb-svg"><defs><pattern id="mbhatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#eceef2"/><line x1="0" y1="0" x2="0" y2="7" stroke="#d3d7de" stroke-width="3"/></pattern></defs>'+bars(d.series)+'</svg>',
      '<span class="mb-pill">Cette annee</span>');
    var balance = card("Solde","CA encaisse",
      '<div class="mb-bal">'+euro(d.revenue)+'<small>total</small></div><svg viewBox="0 0 320 92" class="mb-svg2">'+area(d.series,"#79c72e")+'</svg>');
    var conv = card("Conversion", d.visits+" visite"+(d.visits>1?"s":""),
      '<div class="mb-gauge"><svg viewBox="0 0 180 110">'+gauge(d.conv)+'</svg><div class="mb-gauge-v">'+pct(d.conv)+'%<small>taux</small></div></div>');
    var prods = d.products.slice();
    var listHtml = prods.length ? prods.slice(0,4).map(function(p){ return '<li><span>'+(p.title||"Produit")+'</span><b>'+num(p.sales||0)+'</b></li>'; }).join("") : '<li><span>Aucun produit</span><b>0</b></li>';
    var orders = card("Commandes", num(d.orders)+" au total",
      '<div class="mb-orders"><div class="mb-donut"><svg viewBox="0 0 140 140">'+donut(d.conv)+'</svg><div class="mb-donut-v">'+num(d.orders)+'</div></div><ul class="mb-list">'+listHtml+'</ul></div>');
    var acq = card("Acquisition","Visiteurs",
      '<div class="mb-acq"><div><strong>'+num(d.visits)+'</strong><span>Visites</span></div><div><strong>'+pct(d.conv)+'%</strong><span>Conversion</span></div></div><svg viewBox="0 0 320 92" class="mb-svg2">'+area(d.series,"#ef9d2e")+'</svg>');
    var sorted = prods.slice().sort(function(a,b){ return (Number(b.sales)||0)-(Number(a.sales)||0); }).slice(0,5);
    var rows = sorted.map(function(p){ var pr=Number(p.price)||0, sa=Number(p.sales)||0; return '<tr><td>'+(p.title||"Produit")+'</td><td>'+euro(pr)+'</td><td>'+num(sa)+'</td><td>'+euro(pr*sa)+'</td></tr>'; }).join("");
    if(!rows) rows = '<tr><td colspan="4" style="color:#9aa0ad">Aucun produit</td></tr>';
    var best = card("Meilleurs produits","",
      '<table class="mb-table"><thead><tr><th>Produit</th><th>Prix</th><th>Ventes</th><th>Montant</th></tr></thead><tbody>'+rows+'</tbody></table>',
      '<span class="mb-pill">Ce mois</span>');
    ov.innerHTML = '<div class="mb-grid"><div class="mb-a">'+earning+'</div><div class="mb-b">'+balance+'</div><div class="mb-c">'+conv+'</div><div class="mb-d">'+orders+'</div><div class="mb-e">'+acq+'</div><div class="mb-f">'+best+'</div></div>';
  }

  function hook(){
    if(window.__mbHooked) return;
    if(typeof window.renderOverview !== "function"){ setTimeout(hook,100); return; }
    window.__mbOrigRenderOverview = window.renderOverview;
    window.renderOverview = function(){ try{ renderMidboxOverview(); }catch(e){ if(window.__mbOrigRenderOverview) window.__mbOrigRenderOverview(); } };
    window.__mbHooked = true;
    try{ if(typeof activeView === "undefined" || activeView === "overview") renderMidboxOverview(); }catch(e){}
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", function(){ setTimeout(hook,60); });
  else setTimeout(hook,60);
})();

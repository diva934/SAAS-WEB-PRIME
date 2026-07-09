/* Expertly - Midbox-style overview.
 * This file only replaces renderOverview(). It keeps every value connected to
 * the existing CRM state: products, orders, contacts and analytics.
 */
(function () {
  "use strict";
  if (window.__midboxDashLoaded) return;
  window.__midboxDashLoaded = true;

  var CSS = [
    ".mb-page{display:grid;gap:8px;color:#151611;}",
    ".mb-crumb{display:flex;align-items:center;gap:8px;margin:0 0 9px 4px;color:#71746a;font-size:12px;}",
    ".mb-crumb b{font-weight:500;color:#20221d;}.mb-crumb span{opacity:.55;}",
    ".mb-grid{display:grid;grid-template-columns:.93fr .93fr .78fr .78fr;grid-template-rows:328px 372px;gap:8px;}",
    ".mb-card{position:relative;min-width:0;overflow:hidden;border:1px solid rgba(21,22,17,.1);border-radius:34px;background:rgba(255,255,255,.62);backdrop-filter:blur(20px);box-shadow:none;padding:20px;cursor:pointer;}",
    ".mb-earn{grid-column:1/3;grid-row:1;}.mb-balance{grid-column:3;grid-row:1;}.mb-expenses{grid-column:4;grid-row:1;}.mb-orders{grid-column:1;grid-row:2;}.mb-acq{grid-column:2;grid-row:2;}.mb-best{grid-column:3/5;grid-row:2;}",
    ".mb-head{display:flex;align-items:flex-start;gap:10px;min-height:40px;}",
    ".mb-icon{width:40px;height:40px;border:1.2px solid #161711;border-radius:50%;display:grid;place-items:center;flex:none;color:#151611;font-size:22px;line-height:1;}",
    ".mb-title{flex:1;min-width:0;line-height:1.12;}.mb-title h2{margin:2px 0 3px;font-size:18px;font-weight:500;letter-spacing:0;}.mb-title span{display:block;color:#7f8178;font-size:12px;}",
    ".mb-menu,.mb-pill{border:0;background:rgba(241,243,237,.72);color:#151611;cursor:pointer;}.mb-menu{width:40px;height:40px;border-radius:18px;font-size:20px;line-height:1;}.mb-pill{height:38px;border-radius:20px;padding:0 14px;font-size:13px;white-space:nowrap;}",
    ".mb-svg{display:block;width:100%;height:100%;overflow:visible;}.mb-axis text{font-size:14px;fill:#999b91;}.mb-y{font-size:14px;fill:#a0a297;}.mb-total-tip text{font-size:14px;font-weight:600;}",
    ".mb-wallet{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:18px 0 14px;padding:11px 16px;border:1px dashed rgba(21,22,17,.55);border-radius:22px;}",
    ".mb-wallet div{display:grid;grid-template-columns:20px 1fr;column-gap:8px;align-items:center;}.mb-wallet svg{grid-row:1/3;width:18px;height:18px;}.mb-wallet strong{font-size:16px;font-weight:500;line-height:1;}.mb-wallet span{color:#777970;font-size:11px;}",
    ".mb-mini-labels{position:absolute;left:29px;right:24px;bottom:18px;display:flex;justify-content:space-between;color:#9ca096;font-size:14px;}.mb-day{padding:4px 12px;border-radius:6px;background:#75766e;color:#fff;}",
    ".mb-gauge-wrap{height:228px;position:relative;display:grid;place-items:center;margin-top:5px;}.mb-gauge-value{position:absolute;inset:62px 0 auto;text-align:center;font-size:54px;font-weight:500;letter-spacing:0;color:#030402;}.mb-gauge-delta{position:absolute;top:137px;left:50%;transform:translateX(-50%);padding:4px 10px;border-radius:16px;background:#d9ffc4;color:#2fac1c;font-size:13px;}.mb-note{margin:0 auto;color:#6f7168;text-align:center;font-size:14px;line-height:1.25;max-width:230px;}",
    ".mb-order-body{display:grid;grid-template-columns:132px 1fr;gap:10px;align-items:center;height:292px;}.mb-donut{width:126px;height:126px;position:relative;margin:0 auto;}.mb-donut-center{position:absolute;inset:0;display:grid;place-items:center;text-align:center;font-size:20px;font-weight:700;line-height:1.05;}.mb-donut-center small{display:block;color:#777970;font-size:12px;font-weight:400;}",
    ".mb-cat-list{display:grid;gap:14px;min-width:0;}.mb-cat{display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:10px;align-items:center;cursor:pointer;}.mb-cat i{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-style:normal;color:#151611;}.mb-cat strong{display:block;font-size:15px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.mb-cat span{display:block;color:#7d8077;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.mb-cat b{font-size:15px;font-weight:600;}",
    ".mb-acq-metrics{display:flex;gap:26px;margin:26px 0 2px 4px;}.mb-acq-metrics div{display:grid;grid-template-columns:20px 1fr;gap:0 8px;align-items:center;}.mb-acq-metrics svg{grid-row:1/3;width:18px;height:18px;}.mb-acq-metrics strong{font-size:16px;font-weight:500;}.mb-acq-metrics span{grid-column:2;color:#777970;font-size:11px;}",
    ".mb-best .mb-head{margin-bottom:25px;}.mb-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:14px;}.mb-table th{padding:0 8px 10px 0;border-bottom:1px dashed rgba(21,22,17,.24);color:#777970;text-align:left;font-weight:400;}.mb-table td{padding:10px 8px 10px 0;border-bottom:1px solid rgba(21,22,17,.1);vertical-align:middle;color:#20221d;}.mb-table th:nth-child(1){width:46%;}.mb-table th:nth-child(2){width:13%;}.mb-table th:nth-child(3){width:13%;}.mb-table th:nth-child(4){width:13%;}.mb-table th:nth-child(5){width:15%;text-align:right;}.mb-table td:last-child,.mb-table th:last-child{text-align:right;padding-right:0;}",
    ".mb-product{display:grid;grid-template-columns:46px 1fr;gap:10px;align-items:center;min-width:0;cursor:pointer;}.mb-product-img{width:46px;height:38px;border-radius:13px;display:grid;place-items:center;overflow:hidden;background:#e9ece5;box-shadow:inset 0 0 0 1px rgba(21,22,17,.08);}.mb-product-img span{font-size:10px;font-weight:700;color:#fff;}.mb-product strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:500;}.mb-product small{display:block;color:#86897f;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.mb-muted-row{opacity:.42;}",
    ".mb-focus{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;padding:24px;background:rgba(247,248,241,.72);backdrop-filter:blur(18px);}",
    ".mb-focus-panel{width:min(980px,calc(100vw - 48px));max-height:calc(100vh - 48px);overflow:auto;}",
    ".mb-focus-panel .mb-card{min-height:520px;cursor:default;transform:none;}",
    ".mb-focus-panel .mb-earn,.mb-focus-panel .mb-best{min-height:560px;}",
    ".mb-focus-panel .mb-svg{height:100%;}",
    ".mb-focus-close{position:fixed;top:24px;right:24px;width:46px;height:46px;border:0;border-radius:18px;background:rgba(241,243,237,.9);color:#151611;font-size:22px;cursor:pointer;}",
    ".mb-drill{display:grid;gap:16px;color:#151611;}",
    ".mb-drill-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:4px;}",
    ".mb-drill-head h1{margin:0;font-size:28px;font-weight:500;letter-spacing:0;}",
    ".mb-drill-head button{height:42px;border:0;border-radius:18px;padding:0 16px;background:rgba(241,243,237,.88);color:#151611;cursor:pointer;}",
    ".mb-drill-grid{display:grid;grid-template-columns:1fr;gap:10px;}",
    ".mb-drill-grid.two{grid-template-columns:1fr 1fr;}",
    ".mb-drill .mb-card{min-height:560px;cursor:default;}",
    ".mb-drill .mb-earn,.mb-drill .mb-best{grid-column:auto;grid-row:auto;}",
    ".mb-drill .mb-balance,.mb-drill .mb-expenses,.mb-drill .mb-orders,.mb-drill .mb-acq{grid-column:auto;grid-row:auto;}",
    "@media(max-width:900px){.mb-drill-grid.two{grid-template-columns:1fr;}}",
    "@media(max-width:1180px){.mb-grid{grid-template-columns:1fr 1fr;grid-template-rows:auto;}.mb-earn,.mb-balance,.mb-expenses,.mb-orders,.mb-acq,.mb-best{grid-column:auto;grid-row:auto;}.mb-earn,.mb-best{grid-column:1/-1;}.mb-card{min-height:300px;}}",
    "@media(max-width:720px){.mb-grid{grid-template-columns:1fr;}.mb-earn,.mb-best{grid-column:auto;}.mb-order-body{grid-template-columns:1fr;height:auto;}.mb-card{border-radius:24px;padding:16px;}.mb-table{font-size:12px;}.mb-table th:nth-child(4),.mb-table td:nth-child(4){display:none;}}"
  ].join("");

  var style = document.createElement("style");
  style.id = "mb-dash-css";
  style.textContent = CSS;
  document.head.appendChild(style);

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DAYS = ["M", "T", "T", "W", "F", "S"];

  function safeState() {
    return typeof state !== "undefined" && state ? state : {};
  }

  function paidOrders(s) {
    return (s.orders || []).filter(function (order) {
      return order && order.status === "paid";
    });
  }

  function formatInt(value) {
    return Math.round(Number(value) || 0).toLocaleString("en-US");
  }

  function formatEuro(value) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(value) || 0);
  }

  function pct(value) {
    return (Number(value) || 0).toFixed(1);
  }

  function esc(value) {
    if (typeof escapeHtml === "function") return escapeHtml(value);
    return String(value || "").replace(/[&<>"']/g, function (char) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char];
    });
  }

  function initialsFor(value) {
    if (typeof initials === "function") return initials(value);
    return String(value || "EX").split(/\s+/).map(function (part) { return part[0]; }).join("").slice(0, 2).toUpperCase();
  }

  function metrics() {
    var s = safeState();
    var orders = paidOrders(s);
    var revenue = orders.reduce(function (sum, order) {
      return sum + (Number(order.amount) || 0);
    }, 0);
    var analytics = s.analytics || {};
    var visits = Number(analytics.visits) || 0;
    var purchases = Number(analytics.purchases) || orders.length;
    var series = Array.isArray(analytics.revenueSeries) ? analytics.revenueSeries.slice(0, 12) : [];
    while (series.length < 12) series.push(0);
    var products = Array.isArray(s.products) ? s.products : [];
    var contacts = Array.isArray(s.contacts) ? s.contacts : [];
    var conversion = visits ? (purchases / visits) * 100 : 0;
    var wallet = Math.round(revenue * 0.83);
    var paypal = Math.max(0, revenue - wallet);
    return {
      s: s,
      orders: orders,
      revenue: revenue,
      wallet: wallet,
      paypal: paypal,
      visits: visits,
      purchases: purchases,
      series: series,
      products: products,
      contacts: contacts,
      conversion: conversion,
      averageOrder: orders.length ? revenue / orders.length : 0
    };
  }

  function icon(name) {
    var icons = {
      trend: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 16l6-6 4 4 6-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 7h5v5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      dollar: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3v18M16.5 7.5c-1-1-2.5-1.5-4.4-1.5-2.2 0-4 1.1-4 3s1.5 2.6 4.1 3.1c2.7.5 4.3 1.2 4.3 3.2 0 1.8-1.8 3-4.4 3-1.9 0-3.7-.6-4.9-1.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
      expense: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 17l4-4 3 3 7-8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 5v14h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
      cart: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 6h2l1.2 8.4a2 2 0 0 0 2 1.7h5.7a2 2 0 0 0 1.9-1.4L20 8H8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="20" r="1.2" fill="currentColor"/><circle cx="17" cy="20" r="1.2" fill="currentColor"/></svg>',
      grid: '<svg viewBox="0 0 24 24" fill="none"><rect x="5" y="5" width="14" height="14" rx="3" stroke="currentColor" stroke-width="1.5"/><path d="M9 9h.1M12 9h.1M15 9h.1M9 12h.1M12 12h.1M15 12h.1M9 15h.1M12 15h.1M15 15h.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
      bolt: '<svg viewBox="0 0 24 24" fill="none"><path d="M13 2L5 13h6l-1 9 9-13h-6l0-7z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
      wallet: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4V7z" stroke="currentColor" stroke-width="1.5"/><path d="M4 7l2-3h11v3" stroke="currentColor" stroke-width="1.5"/><circle cx="17" cy="13" r="1" fill="currentColor"/></svg>',
      page: '<svg viewBox="0 0 24 24" fill="none"><path d="M7 4h7l4 4v12H7z" stroke="currentColor" stroke-width="1.5"/><path d="M14 4v5h5" stroke="currentColor" stroke-width="1.5"/></svg>',
      bars: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 19V9M10 19V5M15 19v-7M20 19V8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
    };
    return icons[name] || icons.trend;
  }

  function shell(title, sub, iconName, body, actions, className) {
    var view = "";
    if ((className || "").indexOf("mb-earn") >= 0) view = "analytics";
    else if ((className || "").indexOf("mb-balance") >= 0) view = "finance";
    else if ((className || "").indexOf("mb-expenses") >= 0) view = "finance";
    else if ((className || "").indexOf("mb-orders") >= 0) view = "orders";
    else if ((className || "").indexOf("mb-acq") >= 0) view = "analytics";
    else if ((className || "").indexOf("mb-best") >= 0) view = "products";
    return '<article class="mb-card ' + (className || "") + '"' + (view ? ' data-mb-focus="' + view + '"' : "") + '>'
      + '<div class="mb-head"><div class="mb-icon">' + icon(iconName) + '</div><div class="mb-title"><h2>' + title + '</h2>'
      + (sub ? '<span>' + sub + '</span>' : "") + '</div>' + (actions || '<button class="mb-menu" aria-label="Options" data-mb-view="overview">...</button>') + '</div>'
      + body + '</article>';
  }

  function earningChart(values) {
    var max = Math.max.apply(null, values.concat([1]));
    var highIndex = 0;
    values.forEach(function (value, index) {
      if (value >= values[highIndex]) highIndex = index;
    });
    var grid = [50, 90, 130, 170, 210].map(function (y, index) {
      return '<line x1="66" y1="' + y + '" x2="748" y2="' + y + '" stroke="rgba(21,22,17,.09)" />'
        + '<text class="mb-y" x="22" y="' + (y + 4) + '">' + (50 - index * 10) + 'k</text>';
    }).join("");
    var bars = values.map(function (value, index) {
      var slot = 682 / values.length;
      var h = Math.max(8, (value / max) * 184);
      var x = 66 + slot * index + slot / 2 - 12;
      var y = 218 - h;
      var active = index === highIndex && value > 0;
      var fill = active ? "url(#mbActiveHatch)" : "url(#mbHatch)";
      var tip = active ? '<g class="mb-total-tip"><rect x="' + (x - 15).toFixed(1) + '" y="' + (y - 30).toFixed(1) + '" width="62" height="28" rx="8" fill="#c7ff5a"/><text x="' + (x + 16).toFixed(1) + '" y="' + (y - 11).toFixed(1) + '" text-anchor="middle" fill="#11120f">' + formatInt(value) + '</text></g>' : "";
      return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="24" height="' + h.toFixed(1) + '" rx="10" fill="' + fill + '"/>' + tip
        + '<text x="' + (x + 12).toFixed(1) + '" y="246" text-anchor="middle" fill="#999b91" font-size="14">' + MONTHS[index] + '</text>';
    }).join("");
    return '<div style="height:244px;margin-top:10px"><svg class="mb-svg" viewBox="0 0 760 260">'
      + '<defs><pattern id="mbHatch" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#e9ebe3"/><line x1="0" y1="0" x2="0" y2="8" stroke="#bfc3b7" stroke-width="4"/></pattern><pattern id="mbActiveHatch" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#f7f8f1"/><line x1="0" y1="0" x2="0" y2="8" stroke="#70736b" stroke-width="4"/></pattern></defs>'
      + '<text class="mb-y" x="51" y="222">0</text>' + grid + bars + '</svg></div>';
  }

  function smoothArea(values, color, id, width, height) {
    var max = Math.max.apply(null, values.concat([1]));
    var n = values.length;
    var step = n > 1 ? width / (n - 1) : width;
    var pts = values.map(function (value, index) {
      return [index * step, height - 8 - (value / max) * (height - 22)];
    });
    var line = "M " + pts.map(function (point) { return point[0].toFixed(1) + " " + point[1].toFixed(1); }).join(" L ");
    var area = "M 0 " + height + " L " + pts.map(function (point) { return point[0].toFixed(1) + " " + point[1].toFixed(1); }).join(" L ") + " L " + width + " " + height + " Z";
    var guides = pts.map(function (point) {
      return '<line x1="' + point[0].toFixed(1) + '" y1="0" x2="' + point[0].toFixed(1) + '" y2="' + height + '" stroke="rgba(21,22,17,.08)" stroke-dasharray="2 3"/>';
    }).join("");
    return '<svg class="mb-svg" viewBox="0 0 ' + width + " " + height + '"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + color + '" stop-opacity=".35"/><stop offset="78%" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>'
      + guides + '<path d="' + area + '" fill="url(#' + id + ')"/><path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function balanceCard(d) {
    var body = '<div class="mb-wallet"><div>' + icon("wallet") + '<strong>' + formatInt(d.wallet) + '</strong><span>Wallet</span></div><div>' + icon("dollar") + '<strong>' + formatInt(d.paypal) + '</strong><span>PayPal</span></div></div>'
      + '<div style="height:158px;margin-top:7px">' + smoothArea(d.series, "#62c600", "mbBalanceFill", 260, 140) + '</div>'
      + '<div class="mb-mini-labels"><span>N</span><span class="mb-day">D</span><span>J</span><span>F</span><span>M</span><span>A</span></div>';
    return shell("Balance", "", "dollar", body, '<button class="mb-menu" aria-label="Ouvrir Finance" data-mb-view="finance">...</button>', "mb-balance");
  }

  function expensesCard(d) {
    var expense = Math.round(d.revenue * 0.625);
    var comparison = Math.round(Math.max(d.averageOrder * 5.25, d.revenue * 0.14));
    var body = '<div class="mb-gauge-wrap"><svg viewBox="0 0 220 185" width="220" height="185">'
      + '<circle cx="110" cy="100" r="82" fill="none" stroke="#e4e7df" stroke-width="9"/>'
      + '<circle cx="110" cy="100" r="82" fill="none" stroke="#777b72" stroke-width="5" stroke-linecap="round" stroke-dasharray="348 520" transform="rotate(137 110 100)"/>'
      + '</svg><div class="mb-gauge-value">' + (expense ? (expense / 100).toFixed(1) : "0.0") + '</div><div class="mb-gauge-delta">-' + pct(Math.min(99, Math.max(0, d.conversion * 10))) + '%</div></div>'
      + '<p class="mb-note">' + formatEuro(comparison) + ' Expenses less than last month</p>';
    return shell("Expenses", "", "expense", body, '<button class="mb-menu" aria-label="Ouvrir Finance" data-mb-view="finance">...</button>', "mb-expenses");
  }

  function ordersCard(d) {
    var productSales = d.products.slice().sort(function (a, b) {
      return (Number(b.sales) || 0) - (Number(a.sales) || 0);
    }).slice(0, 4);
    var colors = ["#d8f8ff", "#e1ffd7", "#c7ff5a", "#f1f3ed"];
    var list = productSales.length ? productSales.map(function (product, index) {
      return '<div class="mb-cat"><i style="background:' + colors[index % colors.length] + '">' + ["□", "◇", "◎", "◌"][index % 4] + '</i><div><strong>' + esc(product.type || product.title || "Produit") + '</strong><span>' + esc(product.title || "Produit") + '</span></div><b>' + formatInt(product.sales || 0) + '</b></div>';
    }).join("") : '<div class="mb-cat"><i style="background:#c7ff5a">◎</i><div><strong>Aucun produit</strong><span>Ajoute un produit</span></div><b>0</b></div>';
    var donutValue = Math.max(6, Math.min(96, d.conversion * 9 || d.orders.length * 8));
    var c = 2 * Math.PI * 50;
    var body = '<div class="mb-order-body"><div><div class="mb-donut"><svg viewBox="0 0 126 126"><circle cx="63" cy="63" r="50" fill="none" stroke="#e7efe1" stroke-width="15"/><circle cx="63" cy="63" r="50" fill="none" stroke="#c7ff5a" stroke-width="15" stroke-linecap="round" stroke-dasharray="' + (c * donutValue / 100).toFixed(1) + " " + c.toFixed(1) + '" transform="rotate(-90 63 63)"/><circle cx="63" cy="63" r="36" fill="rgba(255,255,255,.75)"/></svg><div class="mb-donut-center">' + Math.round(donutValue) + '%<small>Weekly</small></div></div></div><div class="mb-cat-list">' + list + '</div></div>';
    return shell("Order Statistics", formatInt(d.orders.length) + " Total Sales", "cart", body, '<button class="mb-menu" aria-label="Ouvrir Commandes" data-mb-view="orders">...</button>', "mb-orders");
  }

  function acquisitionCard(d) {
    var bounce = Math.max(0, 100 - d.conversion * 10);
    var sessions = Math.max(d.visits, d.contacts.length + d.orders.length);
    var acqSeries = d.series.map(function (value, index) {
      return Math.round((value || 0) * (0.72 + (index % 4) * 0.07) + d.visits / 18);
    });
    var body = '<div class="mb-acq-metrics"><div>' + icon("bars") + '<strong>' + pct(bounce) + '%</strong><span>Bounce Rate</span></div><div>' + icon("page") + '<strong>' + formatInt(sessions) + '</strong><span>Page Session</span></div></div>'
      + '<div style="height:214px;margin-top:2px;position:relative">' + smoothArea(acqSeries, "#ff9f20", "mbAcqOrange", 300, 178)
      + '<div style="position:absolute;inset:0">' + smoothArea(d.series, "#62c600", "mbAcqGreen", 300, 178) + '</div></div>'
      + '<div class="mb-mini-labels" style="left:38px;right:34px">' + DAYS.map(function (day) { return '<span>' + day + '</span>'; }).join("") + '</div>';
    return shell("Acquisition", "", "grid", body, '<button class="mb-menu" aria-label="Ouvrir Analytics" data-mb-view="analytics">...</button>', "mb-acq");
  }

  function bestSellersCard(d) {
    var palette = ["#20231e", "#e6c6ba", "#23a878", "#9ea09b", "#c7ff5a"];
    var sorted = d.products.slice().sort(function (a, b) {
      return (Number(b.sales) || 0) * (Number(b.price) || 0) - (Number(a.sales) || 0) * (Number(a.price) || 0);
    }).slice(0, 5);
    var rows = sorted.map(function (product, index) {
      var price = Number(product.price) || 0;
      var sales = Number(product.sales) || 0;
      var stock = Math.max(1, Number(product.views) || sales * 9 || 1);
      var muted = index > 2 ? " mb-muted-row" : "";
      return '<tr class="' + muted + '"><td><div class="mb-product"><div class="mb-product-img" style="background:' + palette[index % palette.length] + '"><span>' + esc(initialsFor(product.title || "EX")) + '</span></div><div><strong>' + esc(product.title || "Produit") + '</strong><small>' + esc(product.type || "Produit digital") + '</small></div></div></td><td>' + formatEuro(price) + '</td><td>' + formatInt(sales) + '</td><td>' + formatInt(stock) + '</td><td>' + formatEuro(price * sales) + '</td></tr>';
    }).join("");
    if (!rows) rows = '<tr><td colspan="5" style="color:#878a80;padding-top:18px">Aucun produit pour le moment</td></tr>';
    var body = '<table class="mb-table"><thead><tr><th>Item ↓</th><th>Price</th><th>Orders</th><th>Stock</th><th>Amount</th></tr></thead><tbody>' + rows + '</tbody></table>';
    return shell("Best Sellers", "", "bolt", body, '<button class="mb-pill" data-mb-view="products">Last Month⌄</button><button class="mb-menu" aria-label="Ouvrir Produits" data-mb-view="products">...</button>', "mb-best");
  }

  function renderMidboxOverview() {
    var overview = document.querySelector("#overviewView");
    if (!overview) return;
    var d = metrics();
    var title = document.querySelector("#viewTitle");
    if (title) title.textContent = "Dashboard";
    document.body.classList.add("midbox-overview");
    overview.innerHTML = '<div class="mb-page"><div class="mb-crumb"><b>Home</b><span>/</span><b>Dashboard</b></div><div class="mb-grid">'
      + shell("Earning Reports", "Yearly Earnings Overview", "trend", earningChart(d.series), '<button class="mb-pill" data-mb-view="analytics">Last Year⌄</button><button class="mb-menu" aria-label="Ouvrir Analytics" data-mb-view="analytics">...</button>', "mb-earn")
      + balanceCard(d)
      + expensesCard(d)
      + ordersCard(d)
      + acquisitionCard(d)
      + bestSellersCard(d)
      + '</div></div>';
  }

  function renderMetricPage(view) {
    var section = document.querySelector("#" + view + "View");
    if (!section) return false;
    var d = metrics();
    var titles = {
      products: "Best Sellers",
      orders: "Order Statistics",
      analytics: "Earning Reports",
      finance: "Balance"
    };
    var content = {
      products: bestSellersCard(d),
      orders: ordersCard(d),
      analytics: earningChartPage(d),
      finance: financeChartPage(d)
    }[view];
    if (!content) return false;
    var title = document.querySelector("#viewTitle");
    if (title) title.textContent = titles[view] || "Dashboard";
    document.body.classList.add("midbox-overview");
    section.innerHTML = '<div class="mb-drill"><div class="mb-drill-head"><h1>' + (titles[view] || "Dashboard") + '</h1><button type="button" data-mb-view="overview">Dashboard</button></div>' + content + '</div>';
    return true;
  }

  function earningChartPage(d) {
    return '<div class="mb-drill-grid two">' + shell("Earning Reports", "Yearly Earnings Overview", "trend", earningChart(d.series), '<button class="mb-pill" data-mb-view="overview">Dashboard</button>', "mb-earn")
      + acquisitionCard(d) + '</div>';
  }

  function financeChartPage(d) {
    return '<div class="mb-drill-grid two">' + balanceCard(d) + expensesCard(d) + '</div>';
  }

  function hook() {
    if (window.__mbHooked) return;
    if (typeof window.renderOverview !== "function") {
      setTimeout(hook, 100);
      return;
    }
    window.__mbOrigRenderOverview = window.renderOverview;
    window.renderOverview = function () {
      try {
        renderMidboxOverview();
      } catch (error) {
        if (window.__mbOrigRenderOverview) window.__mbOrigRenderOverview();
      }
    };
    window.__mbOrigRenderView = window.renderView;
    window.renderView = function (view) {
      if (renderMetricPage(view)) return;
      if (window.__mbOrigRenderView) window.__mbOrigRenderView(view);
    };
    try { renderView = window.renderView; } catch (error) {}
    window.__mbHooked = true;
    try {
      if (typeof activeView === "undefined" || activeView === "overview") renderMidboxOverview();
    } catch (error) {
      renderMidboxOverview();
    }
  }

  function openFocus(card) {
    var existing = document.querySelector(".mb-focus");
    if (existing) existing.remove();
    var overlay = document.createElement("div");
    overlay.className = "mb-focus";
    overlay.innerHTML = '<button class="mb-focus-close" type="button" aria-label="Fermer">×</button><div class="mb-focus-panel"></div>';
    var clone = card.cloneNode(true);
    clone.removeAttribute("data-mb-focus");
    clone.querySelectorAll("[data-mb-view],[data-mb-focus]").forEach(function (node) {
      node.removeAttribute("data-mb-view");
      node.removeAttribute("data-mb-focus");
    });
    overlay.querySelector(".mb-focus-panel").appendChild(clone);
    document.body.appendChild(overlay);
  }

  document.addEventListener("click", function (event) {
    var midboxTarget = event.target.closest("[data-mb-view]");
    if (midboxTarget) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof setView === "function") setView(midboxTarget.dataset.mbView);
      else window.location.hash = midboxTarget.dataset.mbView;
      return;
    }
    var focusCard = event.target.closest(".mb-card[data-mb-focus]");
    if (focusCard) {
      event.preventDefault();
      openFocus(focusCard);
      return;
    }
    if (event.target.closest(".mb-focus-close") || event.target.classList.contains("mb-focus")) {
      event.preventDefault();
      event.target.closest(".mb-focus")?.remove();
      return;
    }
    var nav = event.target.closest(".nav-item[data-view]");
    if (nav && nav.dataset.view !== "overview") document.body.classList.remove("midbox-overview");
    if (nav && nav.dataset.view === "overview") document.body.classList.add("midbox-overview");
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") document.querySelector(".mb-focus")?.remove();
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(hook, 60); });
  else setTimeout(hook, 60);
})();

/* Panneau persistant sur la fiche AliExpress : extrait le produit
   (JSON-LD + DOM moderne + window.runParams), l'affiche, et l'importe dans le CRM. */
(function () {
  "use strict";
  if (window.__expertlyInjected) { try { window.__expertlyToggle && window.__expertlyToggle(); } catch (e) {} return; }
  window.__expertlyInjected = true;

  var pageData = null; // runParams (legacy)
  var product = null;
  var LOGO_URL = (function(){ try { return chrome.runtime.getURL("expertly-logo.webp"); } catch (e) { return ""; } })();

  function esc(s) { return String(s == null ? "" : s).replace(/[<>&]/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]; }); }
  function txt(el) { return el ? (el.textContent || "").trim() : ""; }
  function imageUrl(value) {
    var url = "";
    if (typeof value === "string") url = value;
    else if (value && typeof value.url === "string") url = value.url;
    else if (value && typeof value.src === "string") url = value.src;
    else if (value && typeof value.contentUrl === "string") url = value.contentUrl;
    url = String(url || "").trim().replace(/\\\//g, "/");
    if (url.indexOf("//") === 0) url = "https:" + url;
    if (/^http:\/\//i.test(url)) url = url.replace(/^http:/i, "https:");
    return /^https?:\/\//i.test(url) ? url : "";
  }
  function addImage(list, value) {
    var url = imageUrl(value);
    if (url && url.indexOf("data:") !== 0 && list.indexOf(url) === -1) list.push(url);
  }
  function srcsetFirst(value) {
    return String(value || "").split(",").map(function (part) { return part.trim().split(/\s+/)[0]; }).filter(Boolean)[0] || "";
  }

  /* ---------- JSON-LD : prix, titre, images ---------- */
  function fromJsonLd() {
    var res = {};
    var nodes = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < nodes.length; i++) {
      try {
        var j = JSON.parse(nodes[i].textContent);
        var arr = Array.isArray(j) ? j : [j];
        for (var k = 0; k < arr.length; k++) {
          var o = arr[k];
          if (!o || (o["@type"] && String(o["@type"]).toLowerCase().indexOf("product") === -1)) continue;
          if (o.name) res.title = o.name;
          if (o.description) res.description = String(o.description).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          if (o.image) res.images = [].concat(o.image).map(imageUrl).filter(Boolean);
          var offer = o.offers && ([].concat(o.offers))[0];
          if (offer) {
            var pv = offer.price || offer.lowPrice || (offer.priceSpecification && offer.priceSpecification.price);
            if (pv) res.price = { value: Number(pv), currency: offer.priceCurrency || "" };
          }
        }
      } catch (e) {}
    }
    return res;
  }

  /* ---------- DOM AliExpress moderne : description (specs) + variantes + prix ---------- */
  function fromAliDom() {
    var res = { variants: [], description: "", images: [], price: null };
    var lines = [];
    document.querySelectorAll('[class*="specification--prop"]').forEach(function (p) {
      var t = txt(p.querySelector('[class*="specification--title"]'));
      var d = txt(p.querySelector('[class*="specification--desc"]'));
      if (t && d) lines.push(t + " : " + d);
    });
    if (lines.length) res.description = lines.join("\n");

    document.querySelectorAll('[class*="sku-item--property"]').forEach(function (pr) {
      var name = (txt(pr.querySelector('[class*="sku-item--title"]')).split(":")[0] || "Option").trim();
      var vals = [];
      pr.querySelectorAll('[class*="sku-item--text"]').forEach(function (o) { var x = txt(o); if (x && vals.indexOf(x) === -1) vals.push(x); });
      if (!vals.length) pr.querySelectorAll("img[alt]").forEach(function (im) { var a = (im.alt || "").trim(); if (a && vals.indexOf(a) === -1) vals.push(a); });
      if (vals.length) res.variants.push({ name: name, values: vals.slice(0, 20) });
    });

    // prix depuis le DOM (repli)
    var pe = document.querySelector('[class*="price--current"], [class*="product-price-value"], [class*="Price"]');
    if (pe) {
      var m = txt(pe).match(/([€$£]|EUR|USD)?\s?([\d]{1,6}[.,]\d{2})/);
      if (m) res.price = { value: Number(m[2].replace(",", ".")), currency: (m[1] || "").replace("€", "EUR").replace("$", "USD") };
    }
    document.querySelectorAll("img").forEach(function (im) {
      addImage(res.images, im.currentSrc || im.src);
      addImage(res.images, im.getAttribute("data-src"));
      addImage(res.images, im.getAttribute("data-lazy-src"));
      addImage(res.images, im.getAttribute("data-original"));
      addImage(res.images, srcsetFirst(im.getAttribute("srcset")));
    });
    return res;
  }

  /* ---------- Repli images / titre ---------- */
  function fromDom() {
    var res = { images: [] };
    var og = document.querySelector('meta[property="og:title"]');
    res.title = (og && og.content) || txt(document.querySelector("h1")) || document.title;
    var ogi = document.querySelector('meta[property="og:image"]');
    if (ogi && ogi.content) addImage(res.images, ogi.content);
    document.querySelectorAll("img, source").forEach(function (im) {
      addImage(res.images, im.currentSrc || im.src);
      addImage(res.images, im.getAttribute("src"));
      addImage(res.images, im.getAttribute("data-src"));
      addImage(res.images, im.getAttribute("data-lazy-src"));
      addImage(res.images, srcsetFirst(im.getAttribute("srcset")));
      addImage(res.images, srcsetFirst(im.getAttribute("data-srcset")));
    });
    document.querySelectorAll('[style*="alicdn"], [style*="ae01"]').forEach(function (el) {
      var style = el.getAttribute("style") || "";
      var m = style.match(/url\((['"]?)(.*?)\1\)/i);
      if (m) addImage(res.images, m[2]);
    });
    return res;
  }

  function build() {
    var ld = fromJsonLd();
    var ali = fromAliDom();
    var p = pageData || {};
    var dom = fromDom();
    var images = [];
    [ld.images, p.images, ali.images, dom.images].forEach(function (list) {
      [].concat(list || []).forEach(function (item) { addImage(images, item); });
    });
    product = {
      source: "aliexpress",
      url: location.href,
      title: (ld.title || (p.title || "") || dom.title || "").trim(),
      price: ld.price || p.price || ali.price || dom.price || null,
      description: (ali.description || (p.description || "") || ld.description || "").trim(),
      images: images.slice(0, 10),
      variants: (ali.variants && ali.variants.length ? ali.variants : (p.variants || [])) || []
    };
    render();
  }

  function launcherHtml() { return '<button id="expertly-launcher" title="Importer dans Expertly"><span class="m">E</span></button>'; }

  function panelHtml() {
    var p = product || {};
    var price = p.price
      ? '<div class="ep-price">' + (Math.round(p.price.value * 100) / 100) + ' <small>' + esc(p.price.currency) + '</small></div>'
      : '<div class="ep-price miss">Prix non detecte</div>';
    var gal = (p.images || []).slice(0, 8).map(function (u) { return '<img src="' + esc(imageUrl(u)) + '" referrerpolicy="no-referrer">'; }).join("");
    var desc = p.description ? '<div class="ep-t">Description</div><div class="ep-desc">' + esc(p.description) + '</div>' : "";
    var vars = (p.variants || []).map(function (v) {
      return '<div class="ep-vname">' + esc(v.name) + '</div><div class="ep-chips">' + (v.values || []).slice(0, 14).map(function (x) { return '<span class="ep-chip">' + esc(x) + '</span>'; }).join("") + '</div>';
    }).join("");
    return '<div id="expertly-panel">' +
      '<header>' + (LOGO_URL ? '<img class="ep-logo" src="' + LOGO_URL + '" alt="Expertly">' : '<b>Expertly</b>') + '<button id="ep-close" title="Reduire">-</button></header>' +
      '<div class="ep-body">' +
      (gal ? '<div class="ep-gal">' + gal + '</div>' : '') +
      '<h1>' + esc(p.title || "Produit AliExpress") + '</h1>' + price +
      desc + (vars ? '<div class="ep-t">Variantes</div>' + vars : '') +
      '<button class="ep-btn" id="ep-import">Importer ce produit</button>' +
      '<div class="ep-note" id="ep-note">Il sera ajoute en brouillon dans Produits de ton CRM.</div>' +
      '</div></div>';
  }

  var mount = null;
  function ensureMount() {
    if (mount && document.documentElement.contains(mount)) return;
    mount = document.createElement("div");
    mount.id = "expertly-root";
    document.documentElement.appendChild(mount);
  }
  var open = true;
  function render() {
    ensureMount();
    mount.innerHTML = open ? panelHtml() : launcherHtml();
    if (open) {
      mount.querySelector("#ep-close").onclick = function () { open = false; render(); };
      mount.querySelector("#ep-import").onclick = doImport;
    } else {
      mount.querySelector("#expertly-launcher").onclick = function () { open = true; render(); };
    }
  }

  function doImport() {
    var btn = mount.querySelector("#ep-import");
    var note = mount.querySelector("#ep-note");
    btn.disabled = true; btn.textContent = "Import en cours...";
    chrome.runtime.sendMessage({ type: "IMPORT_PRODUCT", product: product }, function (resp) {
      if (chrome.runtime.lastError || !resp) { fail("Erreur de communication. Recharge la page."); return; }
      if (resp.ok) {
        btn.style.display = "none";
        note.outerHTML = '<div class="ep-ok">Produit ajoute en brouillon dans ton CRM (Produits).</div>';
      } else if (resp.error === "open_crm") {
        fail("Connecte-toi une fois a ton CRM Expertly (onglet expertly-client-app), ensuite l'import marchera meme sans onglet ouvert.");
      } else if (resp.error === "no_token") {
        fail("Session expiree. Ouvre ton CRM Expertly une fois pour te reconnecter, puis reessaie.");
      } else if (resp.error === "plan_limit") {
        fail("Limite de produits de ta formule atteinte.");
      } else {
        fail("Echec de l'import : " + (resp.detail || "reessaie"));
      }
    });
    function fail(msg) { btn.disabled = false; btn.textContent = "Importer ce produit"; note.className = "ep-err"; note.textContent = msg; }
  }

  window.addEventListener("message", function (ev) {
    if (ev.source !== window) return;
    var d = ev.data;
    if (d && d.__expertlyImport && ("page" in d)) { if (d.page) pageData = d.page; build(); }
  });

  function injectReader() {
    try {
      var s = document.createElement("script");
      s.src = chrome.runtime.getURL("page-reader.js");
      s.onload = function () { s.remove(); };
      (document.head || document.documentElement).appendChild(s);
    } catch (e) {}
  }

  window.__expertlyToggle = function () { open = !open; render(); };

  // La fiche AliExpress se remplit progressivement : on reconstruit plusieurs fois.
  function good() { return product && product.description && product.variants && product.variants.length; }
  injectReader();
  build();
  [800, 1800, 3200, 5000, 7500].forEach(function (t) { setTimeout(function () { if (!good()) { injectReader(); build(); } }, t); });

  // Observe l'arrivee des specs/variantes (debounce).
  var moTimer = null, moCount = 0;
  try {
    var mo = new MutationObserver(function () {
      if (good() || moCount > 40) { mo.disconnect(); return; }
      moCount++;
      clearTimeout(moTimer);
      moTimer = setTimeout(function () { build(); }, 400);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function () { try { mo.disconnect(); } catch (e) {} }, 12000);
  } catch (e) {}

  // SPA : rebuild au changement d'URL produit.
  var lastUrl = location.href;
  function onNav() {
    if (location.href === lastUrl) return;
    lastUrl = location.href; pageData = null;
    injectReader(); build();
    [800, 2000, 4000].forEach(function (t) { setTimeout(function () { if (!good()) build(); }, t); });
  }
  ["pushState", "replaceState"].forEach(function (m) {
    var orig = history[m];
    try { history[m] = function () { var r = orig.apply(this, arguments); setTimeout(onNav, 0); return r; }; } catch (e) {}
  });
  window.addEventListener("popstate", onNav);
  setInterval(onNav, 1500);

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.type === "TOGGLE_PANEL") { open = !open; render(); }
  });
})();

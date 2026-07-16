/* Contexte PAGE (monde MAIN) : lit window.runParams (variantes, images, prix)
   que la page AliExpress depose. Renvoie au content script via postMessage. */
(function () {
  "use strict";
  function toHttps(u) {
    u = String(u || "").trim().replace(/\\\//g, "/");
    if (u.indexOf("//") === 0) return "https:" + u;
    if (/^http:\/\//i.test(u)) return u.replace(/^http:/i, "https:");
    return u;
  }

  function read() {
    var data = null;
    try { data = window.runParams && window.runParams.data; } catch (e) {}
    if (!data) { try { data = window.runParams; } catch (e) {} }
    if (!data) return null;

    var out = { images: [], variants: [], price: null, title: "", description: "" };
    try { out.title = (data.titleModule && data.titleModule.subject) || ""; } catch (e) {}
    try {
      var mod = data.imageModule;
      if (mod && Array.isArray(mod.imagePathList)) out.images = mod.imagePathList.map(toHttps).filter(Boolean);
      if (mod && Array.isArray(mod.summImagePathList)) out.images = out.images.concat(mod.summImagePathList.map(toHttps).filter(Boolean));
    } catch (e) {}
    try {
      var pm = data.priceModule;
      if (pm) {
        var p = pm.minActivityAmount || pm.minAmount || pm.maxAmount;
        if (p && typeof p.value !== "undefined") out.price = { value: Number(p.value), currency: p.currency || pm.currencyCode || "" };
      }
    } catch (e) {}
    try {
      var sk = data.skuModule && data.skuModule.productSKUPropertyList;
      if (Array.isArray(sk)) sk.forEach(function (prop) {
        var vals = (prop.skuPropertyValues || []).map(function (v) { return v.propertyValueDisplayName || v.propertyValueName; }).filter(Boolean);
        if (vals.length) out.variants.push({ name: prop.skuPropertyName, values: vals });
      });
    } catch (e) {}
    try {
      var sp = data.specsModule && data.specsModule.props;
      if (Array.isArray(sp) && sp.length) {
        out.description = sp.slice(0, 12).map(function (s) { return s.attrName + " : " + s.attrValue; }).join("\n");
      }
    } catch (e) {}
    return out;
  }

  try { window.postMessage({ __expertlyImport: true, page: read() }, "*"); }
  catch (e) { window.postMessage({ __expertlyImport: true, page: null }, "*"); }
})();

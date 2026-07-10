/* Expertly - Icones monoline homogenes pour la sidebar (remplace les glyphes emoji).
 * Charge APRES app.js : remplace le contenu de chaque .nav-icon par une icone SVG
 * selon data-view. Additif, sans risque (repli : si un view est inconnu on ne touche rien). */
(function () {
  "use strict";
  if (window.__navIconsLoaded) return;
  window.__navIconsLoaded = true;

  var W = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="21" height="21" aria-hidden="true">';
  var E = '</svg>';
  var ICONS = {
    overview: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
    products: '<path d="M12 3.2l7.5 4.3v9L12 20.8 4.5 16.5v-9L12 3.2z"/><path d="M4.7 7.6L12 11.8l7.3-4.2M12 11.8v9"/>',
    pages: '<rect x="3.5" y="5" width="17" height="14" rx="2.4"/><path d="M3.5 9.2h17"/>',
    tunnel: '<path d="M4 5.5h16l-6.2 7v6.3l-3.6 1.7v-8L4 5.5z"/>',
    orders: '<path d="M6.2 8h11.6l-.9 12H7.1L6.2 8z"/><path d="M9 8V6.3a3 3 0 0 1 6 0V8"/>',
    contacts: '<circle cx="9" cy="8.2" r="3.1"/><path d="M3.6 19.6a5.4 5.4 0 0 1 10.8 0"/><path d="M15.8 5.6a3 3 0 0 1 0 5.5M17.6 19.6a5 5 0 0 0-2.8-4.5"/>',
    analytics: '<line x1="6.5" y1="20" x2="6.5" y2="13"/><line x1="12" y1="20" x2="12" y2="6"/><line x1="17.5" y1="20" x2="17.5" y2="10"/>',
    finance: '<rect x="3.5" y="6" width="17" height="13" rx="3"/><path d="M3.5 10.5h17"/><circle cx="16.5" cy="14.5" r="1.3"/>',
    emails: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.6"/><path d="M4.2 7.2l7.8 5.6 7.8-5.6"/>',
    social: '<circle cx="6" cy="12" r="2.3"/><circle cx="17.5" cy="6.2" r="2.3"/><circle cx="17.5" cy="17.8" r="2.3"/><path d="M8 10.9l7.5-3.6M8 13.1l7.5 3.6"/>'
  };

  function apply() {
    var items = document.querySelectorAll(".main-nav .nav-item, #socialNavItem");
    if (!items.length) return;
    items.forEach(function (n) {
      var view = n.getAttribute("data-view") || (n.id === "socialNavItem" ? "social" : "");
      var ic = n.querySelector(".nav-icon");
      if (ic && ICONS[view] && ic.getAttribute("data-svg") !== "1") {
        ic.innerHTML = W + ICONS[view] + E;
        ic.setAttribute("data-svg", "1");
      }
    });
  }

  function boot() {
    apply();
    var tries = 0;
    var iv = setInterval(function () { apply(); if (++tries > 12) clearInterval(iv); }, 400);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 150); });
  else setTimeout(boot, 150);
})();

// Rendu de l'interstitiel « ouvrir dans le navigateur » pour les navigateurs
// in-app iOS / inconnus. Les redirections (desktop, in-app Android) ont déjà été
// gérées par le script pré-paint de open.html.
(function () {
  function getSlug() {
    if (window.__EXPERTLY_SLUG__) return window.__EXPERTLY_SLUG__;
    var qs = new URLSearchParams(location.search);
    var fromQuery = qs.get("slug");
    var fromPath = (location.pathname.match(/\/go\/([^\/?#]+)/) || [])[1];
    return (fromQuery || fromPath || "").trim().toLowerCase();
  }

  var slug = getSlug();
  if (!slug) return;
  var dest = window.__EXPERTLY_DEST__ || location.origin + "/b/" + encodeURIComponent(slug);

  // Si le script pré-paint n'a pas tranché (ex. ouverture directe de open.html),
  // refaire la détection ici par sécurité.
  if (typeof window.__EXPERTLY_INTERSTITIAL__ === "undefined") {
    var ua = navigator.userAgent || "";
    var inApp = /Instagram|FBAN|FBAV|FB_IAB|FBIOS|FB4A|Line\/|TikTok|musical_ly|Bytedance|Snapchat|LinkedInApp|Pinterest|Twitter|GSA/i.test(ua);
    if (!inApp) {
      location.replace(dest);
      return;
    }
    if (/Android/i.test(ua)) {
      var intent =
        "intent://" + location.host + "/b/" + encodeURIComponent(slug) +
        "#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=" +
        encodeURIComponent(dest) + ";end";
      location.replace(intent);
      return;
    }
  }

  var urlField = document.getElementById("storeUrl");
  var copyBtn = document.getElementById("copyBtn");
  var openBtn = document.getElementById("openBtn");
  var hint = document.getElementById("hint");

  if (urlField) urlField.value = dest;
  if (openBtn) openBtn.href = dest;
  document.title = "Ouvre " + slug + " dans ton navigateur";
  document.body.classList.add("show");

  function fallbackCopy() {
    if (!urlField) return false;
    urlField.removeAttribute("readonly");
    urlField.focus();
    urlField.select();
    urlField.setSelectionRange(0, urlField.value.length);
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    urlField.setAttribute("readonly", "");
    return ok;
  }

  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      var done = function () {
        copyBtn.textContent = "Copié ✓";
        if (hint) hint.textContent = "Lien copié — colle-le dans Safari ou Chrome.";
        setTimeout(function () { copyBtn.textContent = "Copier"; }, 2200);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(dest).then(done).catch(function () {
          if (fallbackCopy()) done();
        });
      } else if (fallbackCopy()) {
        done();
      }
    });
  }
})();

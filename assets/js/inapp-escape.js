/* Ouvre la page dans le vrai navigateur quand elle est chargee depuis un navigateur
   in-app (Instagram, Facebook, TikTok, Messenger, Line...).
   S'appuie sur la lib open-source InAppBrowserEscaper (MIT, @jhrunning/inappbrowserescaper) :
   detection + escape(). On affiche une banniere FR aux couleurs de la boutique ; au tap,
   on lance escape({force:true}) DANS le geste utilisateur (les navigateurs bloquent
   l'ouverture automatique sans geste). Ne s'affiche jamais dans un navigateur normal. */
(function () {
  "use strict";
  if (window.__inappEscapeLoaded) return;
  window.__inappEscapeLoaded = true;

  function ns() { return window.InAppBrowserEscaper || null; }

  // Detection : lib du repo si dispo, sinon repli sur l'user-agent.
  function isInApp() {
    var lib = ns();
    if (lib && lib.InAppBrowserDetector) {
      try { return !!lib.InAppBrowserDetector.isInAppBrowser(); } catch (e) {}
    }
    return /instagram|FBAN|FBAV|FB_IAB|Messenger|Line\/|musical_ly|TikTok|MicroMessenger|KAKAOTALK/i.test(navigator.userAgent || "");
  }

  // Ouverture : escape() du repo (Android intent, Instagram iOS instagram://extbrowser, x-safari...),
  // avec repli window.open puis navigation directe.
  function openInBrowser() {
    var lib = ns();
    if (lib && lib.InAppBrowserEscaper) {
      try { lib.InAppBrowserEscaper.escape({ force: true }); return; } catch (e) {}
    }
    try { var w = window.open(location.href, "_blank", "noopener,noreferrer"); if (w) return; } catch (e) {}
    try { location.href = location.href; } catch (e) {}
  }

  function injectCss() {
    if (document.getElementById("iaeCss")) return;
    var css =
      '#iaeBar{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;display:flex;justify-content:center;padding:12px;box-sizing:border-box;font-family:"DM Sans",system-ui,-apple-system,sans-serif}' +
      '#iaeBar *{box-sizing:border-box}' +
      '.iae-card{width:100%;max-width:440px;background:#fff;border:1px solid #e8eaf0;border-radius:18px;box-shadow:0 -10px 34px rgba(16,17,26,.20);padding:16px 18px;display:flex;flex-direction:column;gap:12px;transform:translateY(120%);transition:transform .32s cubic-bezier(.2,.8,.2,1)}' +
      '#iaeBar.iae-in .iae-card{transform:translateY(0)}' +
      '.iae-row{display:flex;align-items:flex-start;gap:12px}' +
      '.iae-ico{flex:none;width:38px;height:38px;border-radius:11px;background:#16171e;color:#fff;display:grid;place-items:center}' +
      '.iae-ico svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}' +
      '.iae-text strong{display:block;font-family:"Manrope",sans-serif;font-size:15px;font-weight:800;color:#15161c;margin-bottom:2px}' +
      '.iae-text span{font-size:12.5px;line-height:1.45;color:#6b7280}' +
      '.iae-open{width:100%;padding:13px;border:0;border-radius:12px;background:#16171e;color:#fff;font:inherit;font-size:15px;font-weight:700;cursor:pointer}' +
      '.iae-open:active{opacity:.9}' +
      '.iae-close{width:100%;padding:8px;border:0;background:none;color:#8a8f9c;font:inherit;font-size:13px;font-weight:600;cursor:pointer}';
    var s = document.createElement("style");
    s.id = "iaeCss";
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  function show() {
    if (document.getElementById("iaeBar")) return;
    injectCss();
    var bar = document.createElement("div");
    bar.id = "iaeBar";
    bar.innerHTML =
      '<div class="iae-card">' +
        '<div class="iae-row">' +
          '<span class="iae-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/></svg></span>' +
          '<div class="iae-text"><strong>Ouvre dans ton navigateur</strong>' +
          '<span>Pour un paiement securise et le bon fonctionnement, ouvre cette page dans Safari ou Chrome.</span></div>' +
        '</div>' +
        '<button type="button" class="iae-open" id="iaeOpen">Ouvrir dans le navigateur</button>' +
        '<button type="button" class="iae-close" id="iaeClose">Continuer ici</button>' +
      '</div>';
    document.body.appendChild(bar);
    requestAnimationFrame(function () { bar.classList.add("iae-in"); });
    document.getElementById("iaeOpen").addEventListener("click", openInBrowser);
    document.getElementById("iaeClose").addEventListener("click", function () { bar.remove(); });
  }

  function run() {
    if (new URLSearchParams(location.search).get("embed") === "1") return; // pas dans l'apercu CRM
    if (isInApp()) show();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();

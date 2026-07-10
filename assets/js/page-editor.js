/* Editeur de page de vente (link-in-bio) : clic sur "Personnaliser" -> editeur plein ecran
   avec apercu live au centre et panneau de reglages sur le cote :
   couleur/image de fond, photo de profil, description, choix des produits affiches.
   Autonome : lit/ecrit l'etat via /api/state (client Supabase independant), ne modifie pas app.js. */
(function () {
  "use strict";
  if (window.__pageEditorLoaded) return;
  window.__pageEditorLoaded = true;

  var cfg = null, client = null, fullState = null;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]; }); }
  function eur(n) { return Number(n) ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n) : "Gratuit"; }

  function getConfig() {
    if (cfg) return Promise.resolve(cfg);
    return fetch("/api/config", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (c) { cfg = c; return c; });
  }
  function getClient() {
    if (client) return Promise.resolve(client);
    return getConfig().then(function (c) {
      if (!window.supabase || !c.supabaseUrl || !c.supabaseAnonKey) throw new Error("Auth indisponible.");
      client = window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey);
      return client;
    });
  }
  function authFetch(url, opts) {
    opts = opts || {};
    return getClient().then(function (c) { return c.auth.getSession(); }).then(function (res) {
      var token = res && res.data && res.data.session && res.data.session.access_token;
      var headers = Object.assign({}, opts.headers || {}, token ? { Authorization: "Bearer " + token } : {});
      return fetch(url, Object.assign({}, opts, { headers: headers }));
    });
  }
  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !file.size) return resolve("");
      if (file.size > 900000) return reject(new Error("Image trop lourde (max 900 Ko)."));
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error("Lecture image impossible.")); };
      r.readAsDataURL(file);
    });
  }

  function injectCss() {
    if (document.getElementById("pageEditorCss")) return;
    var css =
      ".pe-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(16,17,26,.55);display:flex;align-items:center;justify-content:center;padding:18px;font-family:'DM Sans',system-ui,sans-serif}" +
      ".pe-modal{background:#f3f4f6;width:100%;max-width:960px;max-height:94vh;border-radius:22px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 30px 70px rgba(16,17,26,.4)}" +
      ".pe-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:#fff;border-bottom:1px solid #edeff3}" +
      ".pe-head h2{margin:0;font-family:'Manrope',sans-serif;font-size:17px;font-weight:800;color:#15161c}" +
      ".pe-x{border:0;background:none;font-size:24px;line-height:1;color:#9aa0ad;cursor:pointer}" +
      ".pe-body{display:grid;grid-template-columns:320px 1fr;gap:0;flex:1;min-height:0}" +
      ".pe-controls{padding:18px;overflow-y:auto;background:#fff;border-right:1px solid #edeff3}" +
      ".pe-preview-wrap{padding:22px;overflow-y:auto;display:flex;align-items:flex-start;justify-content:center}" +
      ".pe-field{margin:0 0 18px}" +
      ".pe-field>label{display:block;font-size:12.5px;font-weight:700;color:#15161c;margin-bottom:8px}" +
      ".pe-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}" +
      ".pe-color{width:42px;height:34px;border:1px solid #e2e4ec;border-radius:9px;padding:0;background:none;cursor:pointer}" +
      ".pe-btn{border:1px solid #e2e4ec;background:#fff;border-radius:10px;padding:8px 12px;font:inherit;font-size:12.5px;font-weight:600;color:#15161c;cursor:pointer}" +
      ".pe-btn:hover{background:#f5f6f9}" +
      ".pe-txt{width:100%;border:1px solid #e2e4ec;border-radius:11px;padding:10px 12px;font:inherit;font-size:13.5px;resize:vertical;min-height:70px;outline:none}" +
      ".pe-txt:focus{border-color:#5547e7}" +
      ".pe-prod{display:flex;align-items:center;gap:9px;padding:8px 10px;border:1px solid #edeff3;border-radius:10px;margin-bottom:7px;font-size:13px;cursor:pointer}" +
      ".pe-prod input{width:16px;height:16px;accent-color:#5547e7}" +
      ".pe-prod b{font-weight:600;color:#15161c}.pe-prod small{color:#8a8f9c;margin-left:auto}" +
      ".pe-foot{display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;background:#fff;border-top:1px solid #edeff3}" +
      ".pe-cancel{border:1px solid #e2e4ec;background:#fff;border-radius:12px;padding:11px 18px;font:inherit;font-weight:700;font-size:14px;cursor:pointer}" +
      ".pe-save{border:0;background:#16171e;color:#fff;border-radius:12px;padding:11px 20px;font:inherit;font-weight:700;font-size:14px;cursor:pointer}" +
      ".pe-save:disabled{opacity:.6}" +
      ".pe-hint{font-size:11.5px;color:#9aa0ad;margin:6px 0 0}" +
      /* apercu telephone link-in-bio */
      ".pe-phone{width:280px;border:0.5px solid #d7dae3;border-radius:26px;padding:8px;background:#fff;flex:none}" +
      ".pe-screen{border-radius:20px;overflow:hidden;min-height:440px;display:flex;flex-direction:column;align-items:center;padding:34px 18px 18px}" +
      ".pe-av{width:84px;height:84px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:#f1f3f7;border:1px solid #e5e8ef}" +
      ".pe-av img{width:100%;height:100%;object-fit:cover}" +
      ".pe-av svg{width:40px;height:40px;fill:none;stroke:#c2c8d4;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}" +
      ".pe-name{margin:12px 0 0;font-family:'Manrope',sans-serif;font-weight:800;font-size:18px;color:#15161c;text-align:center}" +
      ".pe-desc{margin:5px 0 0;font-size:12.5px;line-height:1.45;color:#6b7280;text-align:center;max-width:230px}" +
      ".pe-links{display:flex;flex-direction:column;gap:10px;width:100%;margin-top:16px}" +
      ".pe-link{position:relative;min-height:50px;display:flex;align-items:center;justify-content:center;border:1px solid #e8eaf0;border-radius:14px;background:#fff;font-size:13.5px;font-weight:600;color:#15161c;box-shadow:0 4px 12px rgba(20,22,40,.05);padding:0 54px}" +
      ".pe-link .p{position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:11px;font-weight:700;background:#f1f3f7;border-radius:999px;padding:4px 8px}" +
      "@media(max-width:720px){.pe-body{grid-template-columns:1fr}.pe-preview-wrap{display:none}}";
    var s = document.createElement("style"); s.id = "pageEditorCss"; s.textContent = css;
    document.head.appendChild(s);
  }

  var AV_PH = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.6" r="3.6"/><path d="M5.2 19.2c.9-3.4 3.5-5.2 6.8-5.2s5.9 1.8 6.8 5.2"/></svg>';

  function renderPreview(host, draft, page, profile, products) {
    var bgImg = (draft.backgroundImageUrl || "").trim();
    var bgCol = (draft.backgroundColor || "").trim();
    var bg = "#fff";
    if (/^https?:\/\//i.test(bgImg) || /^data:image\//i.test(bgImg)) bg = '#f4f4f7 url("' + bgImg + '") center/cover no-repeat';
    else if (bgCol) bg = bgCol;
    var logo = (draft.logoUrl || profile.logo || "").trim();
    var validLogo = /^https?:\/\//i.test(logo) || /^data:image\//i.test(logo);
    var name = profile.creatorName || "Boutique";
    var desc = (draft.subheadline || "").trim() || profile.bio || "";
    var sel = draft.productIds || [];
    var list = (products || []).filter(function (p) { return !sel.length || sel.indexOf(p.id) >= 0; });
    var links = list.map(function (p) {
      return '<div class="pe-link">' + esc(p.title) + '<span class="p">' + eur(p.price) + '</span></div>';
    }).join("") || '<div class="pe-desc">Aucun produit sélectionné</div>';
    host.innerHTML =
      '<div class="pe-screen" style="background:' + esc(bg) + '">' +
        '<div class="pe-av">' + (validLogo ? '<img src="' + esc(logo) + '" alt="" />' : AV_PH) + '</div>' +
        '<p class="pe-name">' + esc(name) + '</p>' +
        (desc ? '<p class="pe-desc">' + esc(desc) + '</p>' : '') +
        '<div class="pe-links">' + links + '</div>' +
      '</div>';
  }

  function openEditor(pageId) {
    injectCss();
    var overlay = document.createElement("div");
    overlay.className = "pe-overlay";
    overlay.innerHTML = '<div class="pe-modal"><div class="pe-head"><h2>Personnaliser la page</h2><button class="pe-x" type="button" aria-label="Fermer">×</button></div><div class="pe-loading" style="padding:40px;text-align:center;color:#6b7280;font-family:DM Sans,sans-serif">Chargement…</div></div>';
    document.body.appendChild(overlay);
    var modal = overlay.querySelector(".pe-modal");
    function close() { overlay.remove(); }
    overlay.querySelector(".pe-x").addEventListener("click", close);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });

    authFetch("/api/state", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (st) {
        fullState = st;
        var page = (st.pages || []).find(function (p) { return p.id === pageId; });
        if (!page) throw new Error("Page introuvable.");
        var profile = st.profile || {};
        var products = (st.products || []).filter(function (p) { return p.status === "published"; });
        var draft = {
          backgroundColor: page.backgroundColor || "",
          backgroundImageUrl: page.backgroundImageUrl || "",
          logoUrl: page.logoUrl || "",
          subheadline: page.subheadline || "",
          productIds: Array.isArray(page.productIds) ? page.productIds.slice() : []
        };
        buildEditor(modal, close, page, profile, products, draft);
      })
      .catch(function (err) {
        modal.querySelector(".pe-loading").textContent = err.message || "Erreur de chargement.";
      });
  }

  function buildEditor(modal, close, page, profile, products, draft) {
    var prodRows = products.map(function (p) {
      var checked = !draft.productIds.length || draft.productIds.indexOf(p.id) >= 0;
      return '<label class="pe-prod"><input type="checkbox" data-prod="' + esc(p.id) + '"' + (checked ? " checked" : "") + ' /><b>' + esc(p.title) + '</b><small>' + eur(p.price) + '</small></label>';
    }).join("") || '<p class="pe-hint">Aucun produit publié. Crée et publie un produit d\'abord.</p>';

    modal.innerHTML =
      '<div class="pe-head"><h2>Personnaliser la page</h2><button class="pe-x" type="button" aria-label="Fermer">×</button></div>' +
      '<div class="pe-body">' +
        '<div class="pe-controls">' +
          '<div class="pe-field"><label>Couleur de fond</label><div class="pe-row">' +
            '<input type="color" class="pe-color" id="peColor" value="' + esc(/^#/.test(draft.backgroundColor) ? draft.backgroundColor : "#ffffff") + '" />' +
            '<button type="button" class="pe-btn" id="peColorReset">Blanc</button>' +
          '</div></div>' +
          '<div class="pe-field"><label>Image de fond</label><div class="pe-row">' +
            '<button type="button" class="pe-btn" id="peBgPick">Importer une image</button>' +
            '<button type="button" class="pe-btn" id="peBgClear">Retirer</button>' +
            '<input type="file" id="peBgFile" accept="image/png,image/jpeg,image/webp" hidden />' +
          '</div><p class="pe-hint">L\'image prend le dessus sur la couleur.</p></div>' +
          '<div class="pe-field"><label>Photo de profil</label><div class="pe-row">' +
            '<button type="button" class="pe-btn" id="peAvPick">Importer une photo</button>' +
            '<button type="button" class="pe-btn" id="peAvClear">Retirer</button>' +
            '<input type="file" id="peAvFile" accept="image/png,image/jpeg,image/webp" hidden />' +
          '</div></div>' +
          '<div class="pe-field"><label>Description</label><textarea class="pe-txt" id="peDesc" placeholder="Présente ta boutique en une phrase.">' + esc(draft.subheadline) + '</textarea></div>' +
          '<div class="pe-field"><label>Produits affichés</label>' + prodRows + '<p class="pe-hint">Coche ceux à montrer sur cette page.</p></div>' +
        '</div>' +
        '<div class="pe-preview-wrap"><div class="pe-phone"><div id="pePreview"></div></div></div>' +
      '</div>' +
      '<div class="pe-foot"><button type="button" class="pe-cancel">Annuler</button><button type="button" class="pe-save">Enregistrer</button></div>';

    var previewHost = modal.querySelector("#pePreview");
    function refresh() { renderPreview(previewHost, draft, page, profile, products); }
    refresh();

    modal.querySelector(".pe-x").addEventListener("click", close);
    modal.querySelector(".pe-cancel").addEventListener("click", close);

    modal.querySelector("#peColor").addEventListener("input", function (e) { draft.backgroundColor = e.target.value; refresh(); });
    modal.querySelector("#peColorReset").addEventListener("click", function () { draft.backgroundColor = ""; modal.querySelector("#peColor").value = "#ffffff"; refresh(); });
    modal.querySelector("#peBgPick").addEventListener("click", function () { modal.querySelector("#peBgFile").click(); });
    modal.querySelector("#peBgClear").addEventListener("click", function () { draft.backgroundImageUrl = ""; refresh(); });
    modal.querySelector("#peBgFile").addEventListener("change", function (e) {
      fileToDataUrl(e.target.files[0]).then(function (u) { if (u) { draft.backgroundImageUrl = u; refresh(); } }).catch(function (err) { alert(err.message); });
    });
    modal.querySelector("#peAvPick").addEventListener("click", function () { modal.querySelector("#peAvFile").click(); });
    modal.querySelector("#peAvClear").addEventListener("click", function () { draft.logoUrl = ""; refresh(); });
    modal.querySelector("#peAvFile").addEventListener("change", function (e) {
      fileToDataUrl(e.target.files[0]).then(function (u) { if (u) { draft.logoUrl = u; refresh(); } }).catch(function (err) { alert(err.message); });
    });
    modal.querySelector("#peDesc").addEventListener("input", function (e) { draft.subheadline = e.target.value; refresh(); });
    [].forEach.call(modal.querySelectorAll("[data-prod]"), function (cb) {
      cb.addEventListener("change", function () {
        var ids = [].filter.call(modal.querySelectorAll("[data-prod]"), function (x) { return x.checked; }).map(function (x) { return x.getAttribute("data-prod"); });
        // Si tout est coche, on stocke vide (= tous) ; sinon la selection.
        draft.productIds = ids.length === products.length ? [] : ids;
        refresh();
      });
    });

    var saveBtn = modal.querySelector(".pe-save");
    saveBtn.addEventListener("click", function () {
      saveBtn.disabled = true; saveBtn.textContent = "Enregistrement…";
      var target = (fullState.pages || []).find(function (p) { return p.id === page.id; });
      if (target) {
        target.backgroundColor = draft.backgroundColor;
        target.backgroundImageUrl = draft.backgroundImageUrl;
        target.logoUrl = draft.logoUrl;
        target.subheadline = draft.subheadline;
        target.productIds = draft.productIds;
      }
      authFetch("/api/state", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fullState) })
        .then(function (r) { if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || "Sauvegarde impossible."); }); })
        .then(function () { window.location.reload(); })
        .catch(function (err) { saveBtn.disabled = false; saveBtn.textContent = "Enregistrer"; alert(err.message || "Erreur."); });
    });
  }

  // Intercepte "Personnaliser" avant app.js (phase capture) pour ouvrir notre editeur.
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("[data-edit-page]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    openEditor(btn.getAttribute("data-edit-page"));
  }, true);
})();

let state = null; // { page, product, products, profile }
let selectedProduct = null;

const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function currentSalesRoute() {
  const parts = location.pathname.split("/").filter(Boolean);
  const pageIndex = parts.indexOf("p");
  const routeParts = pageIndex >= 0 ? parts.slice(pageIndex + 1) : parts;
  return {
    store: routeParts.length > 1 ? routeParts[0] : "",
    slug: routeParts.at(-1) || "",
  };
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function initials(value = "") {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const SOCIAL_LINKS = [
  { key: "instagram", label: "Instagram" },
  { key: "youtube", label: "YouTube" },
  { key: "tiktok", label: "TikTok" },
];

function safeUrl(value = "") {
  const trimmed = String(value).trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : "";
}

function safeColor(value = "", fallbackColor = "#6558f5") {
  const trimmed = String(value).trim();
  return /^#[0-9a-f]{3,8}$|^(rgb|hsl)a?\([\d.,%\s/]+\)$/i.test(trimmed) ? trimmed : fallbackColor;
}

function setOgMeta(property, content) {
  if (!content) return;
  let el = document.querySelector(`meta[property="${property}"]`);
  if (!el) { el = document.createElement("meta"); el.setAttribute("property", property); document.head.appendChild(el); }
  el.setAttribute("content", content);
}

function renderSocials(profile) {
  const container = document.querySelector("#creatorSocials");
  if (!container) return;
  const links = SOCIAL_LINKS.map(({ key, label }) => ({ label, url: safeUrl(profile[key]) })).filter((item) => item.url);
  if (!links.length) { container.hidden = true; container.innerHTML = ""; return; }
  container.hidden = false;
  container.innerHTML = links
    .map((item) => `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.label)}</a>`)
    .join("");
}

function renderPageStore() {
  const { page, products, profile } = state;
  document.documentElement.style.setProperty("--accent", (page && page.accent) || profile.accent || "#6558f5");

  // Fond personnalise de la page : image en priorite, sinon couleur ; sinon blanc.
  const bgImage = (page && (page.backgroundImageUrl || "").trim()) || "";
  const bgColor = (page && (page.backgroundColor || "").trim()) || "";
  const validBgImg = /^https?:\/\//i.test(bgImage) || /^data:image\//i.test(bgImage);
  if (validBgImg) {
    document.body.style.background = `#f4f4f7 url("${bgImage}") center / cover no-repeat fixed`;
    document.body.classList.add("has-custom-bg");
  } else if (/^(#|rgb|hsl)/i.test(bgColor) && !/^#f{3,6}$/i.test(bgColor)) {
    document.body.style.background = bgColor;
    document.body.classList.add("has-custom-bg");
  }
  const title = `${profile.creatorName || "Boutique"} · ${page?.name || "Boutique"}`;
  document.title = title;
  setOgMeta("og:title", title);
  setOgMeta("og:description", profile.bio || page?.subheadline || `Découvre les offres de ${profile.creatorName || "cette boutique"}`);
  setOgMeta("og:image", (profile.logo || "").trim().match(/^https?:\/\//i) ? profile.logo : "");
  setOgMeta("og:url", location.href);
  setOgMeta("og:type", "website");

  const avatar = document.querySelector("#creatorAvatar");
  const logo = ((page && page.logoUrl) || profile.logo || "").trim();
  const validLogo = /^https?:\/\//i.test(logo) || /^data:image\//i.test(logo);
  if (validLogo) {
    avatar.classList.add("has-logo");
    avatar.classList.remove("is-empty");
    avatar.innerHTML = `<img class="creator-avatar-img" src="${escapeHtml(logo)}" alt="${escapeHtml(profile.creatorName || "")}" />`;
  } else {
    avatar.classList.remove("has-logo");
    avatar.classList.add("is-empty");
    avatar.innerHTML = '<svg class="creator-avatar-ph" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.6" r="3.6"/><path d="M5.2 19.2c.9-3.4 3.5-5.2 6.8-5.2s5.9 1.8 6.8 5.2"/></svg>';
  }

  document.querySelector("#creatorName").textContent = profile.creatorName || "Boutique";
  document.querySelector("#creatorRole").textContent = profile.creatorRole || "";
  document.querySelector("#creatorBio").textContent = (page && (page.subheadline || page.headline)) || profile.bio || "";

  // Couleur de texte personnalisee (nom / role / description), pour rester lisible sur le fond choisi.
  const textColor = (page && (page.textColor || "").trim()) || "";
  if (/^(#|rgb|hsl)/i.test(textColor)) {
    ["#creatorName", "#creatorRole", "#creatorBio"].forEach((sel) => {
      const el = document.querySelector(sel);
      if (el) el.style.color = textColor;
    });
  }

  renderSocials(profile);

  // Produits : ceux selectionnes pour la page (page.productIds) sinon tous les publies.
  const selected = Array.isArray(page && page.productIds) && page.productIds.length ? page.productIds : null;
  const featured = page?.productId;
  const list = (products || []).filter((p) => !selected || selected.indexOf(p.id) >= 0).slice().sort((a, b) => {
    const fa = a.id === featured ? 1 : 0;
    const fb = b.id === featured ? 1 : 0;
    return fb - fa || Number(b.featured) - Number(a.featured);
  });

  document.querySelector("#publicOffers").innerHTML =
    list
      .map((product) => {
        const priceLabel = Number(product.price) ? euro.format(product.price) : "Gratuit";
        const isFeatured = product.id === featured;
        return `
        <button class="store-link ${isFeatured ? "is-featured" : ""}" data-buy="${product.id}">
          <span class="store-link-label">${escapeHtml(product.title)}</span>
          <span class="store-link-price">${priceLabel}</span>
        </button>`;
      })
      .join("") || '<p class="store-empty">Aucun produit publié pour le moment.</p>';

  window.ExpertlyTracking?.track("sales_page_viewed", {
    sales_page_id: page?.id,
    sales_page_slug: page?.slug,
    creator_slug: profile.slug,
    product_count: list.length,
    referrer: document.referrer || "direct",
  });
}

function showFatal(message) {
  const el = document.querySelector("#publicOffers");
  if (el) el.innerHTML = `<p class="store-empty">${escapeHtml(message)}</p>`;
  const name = document.querySelector("#creatorName");
  if (name) name.textContent = "Page indisponible";
}

function currentProducts() {
  if (!state) return [];
  if (Array.isArray(state.products) && state.products.length) return state.products;
  return state.product ? [state.product] : [];
}

function openCheckout(product) {
  if (!product) return;
  selectedProduct = product;
  const isFree = Number(product.price) === 0;
  document.querySelector("#checkoutContent").innerHTML = `
    <div class="checkout-product">
      <div class="public-offer-icon" style="--offer-color:${safeColor(product.color, safeColor(state.profile.accent, "#6558f5"))}">${initials(product.title)}</div>
      <div><h2>${escapeHtml(product.title)}</h2><p>${escapeHtml(product.type || "")} · Accès immédiat après confirmation</p></div>
    </div>
    <div class="checkout-summary">
      <div><span>Sous-total</span><span>${isFree ? "Gratuit" : euro.format(product.price)}</span></div>
      <div><span>TVA incluse</span><span>${isFree ? "0 €" : euro.format(Math.round(product.price * 0.2))}</span></div>
      <div><span>Total</span><span>${isFree ? "Gratuit" : euro.format(product.price)}</span></div>
    </div>
    <form id="checkoutForm">
      <label>Prénom et nom<input name="name" required autocomplete="name" placeholder="Sofia Bernard" /></label>
      <label>Email<input name="email" type="email" required autocomplete="email" placeholder="sofia@email.com" /></label>
      <button type="submit">${isFree ? "Recevoir l'accès" : `Continuer vers Stripe · ${euro.format(product.price)}`}</button>
      <p class="secure-note">${isFree ? "Aucun paiement requis." : "Le produit est débloqué uniquement après confirmation du paiement Stripe."}</p>
      <p class="checkout-error" id="checkoutError" role="alert"></p>
    </form>
  `;
  const modal = document.querySelector("#checkoutModal");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.querySelector("#checkoutForm").addEventListener("submit", completeCheckout);
  window.ExpertlyTracking?.track("checkout_form_opened", { product_id: product.id, source: "sales_page" });
}

function closeCheckout() {
  const modal = document.querySelector("#checkoutModal");
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

async function completeCheckout(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const button = event.currentTarget.querySelector("button[type='submit']");
  const errorRegion = document.querySelector("#checkoutError");
  button.disabled = true;
  button.textContent = "Préparation du paiement…";
  errorRegion.textContent = "";
  try {
    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: selectedProduct.id,
        customerName: data.get("name").trim(),
        customerEmail: data.get("email").trim(),
        distinctId: window.ExpertlyTracking?.getDistinctId(),
        source: "sales_page",
        salesPageSlug: state.page?.slug || "",
        creatorSlug: state.profile.slug,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Impossible de démarrer le paiement.");
    if (result.url) { location.assign(result.url); return; }
    if (result.free && result.accessUrl) { location.assign(result.accessUrl); return; }
    throw new Error("Réponse de paiement invalide.");
  } catch (error) {
    errorRegion.textContent = error.message;
    button.disabled = false;
    button.textContent = selectedProduct.price
      ? `Continuer vers Stripe · ${euro.format(selectedProduct.price)}`
      : "Recevoir l'accès";
  }
}

document.addEventListener("click", (event) => {
  const buy = event.target.closest("[data-buy]");
  if (buy) openCheckout(currentProducts().find((product) => product.id === buy.dataset.buy));
  if (event.target.closest("[data-close-checkout]") || event.target === document.querySelector("#checkoutModal")) closeCheckout();
});

window.addEventListener("keydown", (event) => { if (event.key === "Escape") closeCheckout(); });

if (new URLSearchParams(location.search).get("embed") === "1") {
  document.body.classList.add("embed");
}

async function startSales() {
  const { slug } = currentSalesRoute();
  if (!slug) { showFatal("Page introuvable."); return; }
  try {
    const response = await fetch(`/api/page?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) { showFatal(payload?.error || "Page indisponible."); return; }
    state = payload;
  } catch {
    showFatal("Connexion impossible. Réessaie dans un instant.");
    return;
  }
  const isEmbed = new URLSearchParams(location.search).get("embed") === "1";
  if (!isEmbed && location.protocol.startsWith("http")) {
    fetch("/api/events/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "pageview",
        slug,
        surface: "sales_page",
        source: new URLSearchParams(location.search).get("utm_source") || "",
        referrer: document.referrer || "",
        url: location.href,
      }),
    }).catch(() => {});
  }
  renderPageStore();
}

startSales();

const STORAGE_KEY = "expertly_client_v2";

const fallback = {
  profile: {
    firstName: "Expertly",
    creatorName: "Boutique",
    creatorRole: "",
    bio: "",
    slug: "boutique",
    accent: "#6558f5",
  },
  products: [],
};

let state = fallback;
let selectedProduct = null;

function currentStoreSlug() {
  const params = new URLSearchParams(location.search);
  const querySlug = params.get("slug");
  const pathMatch = location.pathname.match(/\/b\/([^/?#]+)/);
  return (querySlug || pathMatch?.[1] || "").trim();
}

const euro = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

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

function renderSocials(profile) {
  const container = document.querySelector("#creatorSocials");
  if (!container) return;
  const links = SOCIAL_LINKS.map(({ key, label }) => ({ label, url: safeUrl(profile[key]) })).filter(
    (item) => item.url,
  );
  if (!links.length) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }
  container.hidden = false;
  container.innerHTML = links
    .map(
      (item) =>
        `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(
          item.label,
        )}">${escapeHtml(item.label)}</a>`,
    )
    .join("");
}

function renderFeaturedBanner() {
  // La banniere "ressource gratuite" a ete remplacee par un bouton dans la liste.
  const banner = document.querySelector("#featuredBanner");
  if (banner) { banner.hidden = true; banner.style.display = "none"; }
}

function setOgMeta(property, content) {
  if (!content) return;
  let el = document.querySelector(`meta[property="${property}"]`);
  if (!el) { el = document.createElement("meta"); el.setAttribute("property", property); document.head.appendChild(el); }
  el.setAttribute("content", content);
}

function renderStore() {
  const profile = state.profile;
  document.documentElement.style.setProperty("--accent", profile.accent || "#6558f5");
  const storeTitle = `${profile.creatorName || "Boutique"} · Boutique`;
  document.title = storeTitle;
  setOgMeta("og:title", storeTitle);
  setOgMeta("og:description", profile.bio || `Découvre les offres de ${profile.creatorName || "cette boutique"}`);
  setOgMeta("og:image", (profile.logo || "").trim().match(/^https?:\/\//i) ? profile.logo : "");
  setOgMeta("og:url", location.href);
  setOgMeta("og:type", "website");

  // Fond personnalise de la boutique (image en priorite, sinon couleur), sinon blanc.
  const bgImage = (profile.backgroundImageUrl || "").trim();
  const bgColor = (profile.backgroundColor || "").trim();
  if (/^https?:\/\//i.test(bgImage) || /^data:image\//i.test(bgImage)) {
    document.body.style.background = `#f4f4f7 url("${bgImage}") center / cover no-repeat fixed`;
    document.body.classList.add("has-custom-bg");
  } else if (/^(#|rgb|hsl)/i.test(bgColor) && !/^#f{3,6}$/i.test(bgColor)) {
    document.body.style.background = bgColor;
    document.body.classList.add("has-custom-bg");
  }

  const avatar = document.querySelector("#creatorAvatar");
  const logo = (profile.logo || "").trim();
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
  document.querySelector("#creatorBio").textContent = profile.bio || "";

  // Couleur de texte personnalisee (nom / role / description).
  const textColor = (profile.textColor || "").trim();
  if (/^(#|rgb|hsl)/i.test(textColor)) {
    ["#creatorName", "#creatorRole", "#creatorBio"].forEach((sel) => {
      const el = document.querySelector(sel);
      if (el) el.style.color = textColor;
    });
  }

  renderSocials(profile);

  const selectedIds = Array.isArray(profile.storeProductIds) && profile.storeProductIds.length ? profile.storeProductIds : null;
  const products = state.products
    .filter((product) => product.status === "published")
    .filter((product) => !selectedIds || selectedIds.indexOf(product.id) >= 0)
    .sort((a, b) => Number(b.featured) - Number(a.featured));

  document.querySelector("#publicOffers").innerHTML =
    products
      .map((product) => {
        const priceLabel = Number(product.price) ? euro.format(product.price) : "Gratuit";
        return `
        <button class="store-link ${product.featured ? "is-featured" : ""}" data-buy="${product.id}">
          <span class="store-link-label">${escapeHtml(product.title)}</span>
          <span class="store-link-price">${priceLabel}</span>
        </button>`;
      })
      .join("") || '<p class="store-empty">Aucun produit publié pour le moment.</p>';

  renderFeaturedBanner();

  window.ExpertlyTracking?.track("store_viewed", {
    product_count: products.length,
    creator_slug: profile.slug,
  });
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
  window.ExpertlyTracking?.track("store_product_clicked", {
    product_id: product.id,
    product_type: product.type,
    price: product.price,
  });
  window.ExpertlyTracking?.track("checkout_form_opened", {
    product_id: product.id,
    source: "store",
  });
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
        source: "store",
        creatorSlug: state.profile.slug,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Impossible de démarrer le paiement.");
    window.ExpertlyTracking?.track("checkout_request_succeeded", {
      product_id: selectedProduct.id,
      source: "store",
      free: Boolean(result.free),
    });
    if (result.url) {
      location.assign(result.url);
      return;
    }
    if (result.free && result.accessUrl) {
      location.assign(result.accessUrl);
      return;
    }
    throw new Error("Réponse de paiement invalide.");
  } catch (error) {
    errorRegion.textContent = error.message;
    button.disabled = false;
    button.textContent = selectedProduct.price
      ? `Continuer vers Stripe · ${euro.format(selectedProduct.price)}`
      : "Recevoir l'accès";
    window.ExpertlyTracking?.track("checkout_request_failed", {
      product_id: selectedProduct.id,
      source: "store",
      error: error.message,
    });
  }
}

function openLeadModal() {
  const modal = document.querySelector("#leadModal");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeLeadModal() {
  const modal = document.querySelector("#leadModal");
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function showToast(message) {
  const toast = document.querySelector("#storeToast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2600);
}

document.addEventListener("click", (event) => {
  const buy = event.target.closest("[data-buy]");
  if (buy) openCheckout(state.products.find((product) => product.id === buy.dataset.buy));
  if (event.target.closest("[data-close-checkout]") || event.target === document.querySelector("#checkoutModal")) closeCheckout();
  if (event.target.closest("[data-close-lead]") || event.target === document.querySelector("#leadModal")) closeLeadModal();
});

document.querySelector("#leadButton")?.addEventListener("click", openLeadModal);
document.querySelector("#leadForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const freeProduct = state.products.find((product) => product.price === 0 && product.status === "published");
  if (!freeProduct) {
    showToast("Aucune ressource gratuite n'est encore configurée.");
    closeLeadModal();
    return;
  }
  try {
    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: freeProduct.id,
        customerName: data.get("name").trim(),
        customerEmail: data.get("email").trim(),
        creatorSlug: state.profile.slug,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    closeLeadModal();
    showToast("Vérifie tes emails — la ressource arrive dans quelques secondes !");
    setTimeout(() => { if (result.accessUrl) location.assign(result.accessUrl); }, 1800);
  } catch (error) {
    showToast(error.message || "Impossible d'envoyer la ressource.");
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeCheckout();
    closeLeadModal();
  }
});

if (new URLSearchParams(location.search).get("embed") === "1") {
  document.body.classList.add("embed");
}

async function startStore() {
  const slug = currentStoreSlug();
  try {
    const response = await fetch(`/api/store?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!response.ok) throw new Error();
    state = await response.json();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    try {
      state = { ...fallback, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
    } catch {
      state = fallback;
    }
    showToast("Mode hors ligne : paiement indisponible.");
  }
  const isEmbed = new URLSearchParams(location.search).get("embed") === "1";
  if (!isEmbed && location.protocol.startsWith("http") && !sessionStorage.getItem("expertly_visit_counted_v2")) {
    sessionStorage.setItem("expertly_visit_counted_v2", "1");
    fetch("/api/events/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "pageview",
        slug,
        surface: "creator_store",
        source: new URLSearchParams(location.search).get("utm_source") || "",
        referrer: document.referrer || "",
        url: location.href,
      }),
    }).catch(() => {});
  }
  renderStore();
}

startStore();

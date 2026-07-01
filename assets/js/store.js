const STORAGE_KEY = "expertly_client_v2";

const fallback = {
  profile: {
    firstName: "Expertly",
    creatorName: "Boutique Expertly",
    creatorRole: "Infopreneur",
    bio: "Bienvenue dans ma boutique de produits digitaux.",
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

function safeColor(value = "", fallback = "#6558f5") {
  const trimmed = String(value).trim();
  return /^#[0-9a-f]{3,8}$|^(rgb|hsl)a?\([\d.,%\s/]+\)$/i.test(trimmed) ? trimmed : fallback;
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

function renderFeaturedBanner(publishedProducts) {
  const banner = document.querySelector("#featuredBanner");
  if (!banner) return;
  const freeProduct = publishedProducts.find((product) => Number(product.price) === 0);
  if (!freeProduct) {
    banner.hidden = true;
    banner.style.display = "none";
    return;
  }
  banner.hidden = false;
  banner.style.display = "";
  const title = document.querySelector("#featuredBannerTitle");
  if (title) title.textContent = freeProduct.title || "Ressource gratuite offerte";
}

function renderStore() {
  const profile = state.profile;
  document.documentElement.style.setProperty("--accent", profile.accent || "#6558f5");
  document.title = `${profile.creatorName} · Boutique`;
  const avatar = document.querySelector("#creatorAvatar");
  const logo = (profile.logo || "").trim();
  const validLogo = /^https?:\/\//i.test(logo) || /^data:image\//i.test(logo);
  if (validLogo) {
    avatar.classList.add("has-logo");
    avatar.innerHTML = `<img class="creator-avatar-img" src="${escapeHtml(logo)}" alt="${escapeHtml(profile.creatorName)}" />`;
  } else {
    avatar.classList.remove("has-logo");
    avatar.textContent = initials(profile.creatorName);
  }
  document.querySelector("#creatorName").textContent = profile.creatorName;
  document.querySelector("#creatorRole").textContent = profile.creatorRole;
  document.querySelector("#creatorBio").textContent = profile.bio;

  renderSocials(profile);

  const products = state.products
    .filter((product) => product.status === "published")
    .sort((a, b) => Number(b.featured) - Number(a.featured));

  document.querySelector("#offerCount").textContent = `${products.length} offre${products.length > 1 ? "s" : ""}`;
  const singleProduct = products.length === 1;
  const accent = safeColor(profile.accent, "#6558f5");
  document.querySelector("#publicOffers").innerHTML =
    products
      .map((product) => {
        const requested = ["s", "m", "l", "xl"].includes(product.cardSize) ? product.cardSize : "m";
        const size = singleProduct ? "l" : requested;
        const cover = (product.coverUrl || "").trim();
        const hasCover = /^https?:\/\//i.test(cover) || /^data:image\//i.test(cover);
        const offerColor = safeColor(product.color, accent);
        const media = hasCover
          ? `<img class="offer-cover" src="${escapeHtml(cover)}" alt="${escapeHtml(product.title)}" loading="lazy" />`
          : `<div class="offer-cover offer-cover-fallback"><span>${initials(product.title)}</span></div>`;
        return `
        <article class="public-offer size-${size} ${product.featured ? "featured" : ""}" style="--offer-color:${offerColor}">
          <div class="offer-media">
            ${media}
            ${product.featured ? '<span class="featured-label">★ Recommandé</span>' : ""}
            <span class="offer-price">${product.price ? euro.format(product.price) : "Gratuit"}</span>
          </div>
          <div class="offer-body">
            ${product.type ? `<span class="offer-type">${escapeHtml(product.type)}</span>` : ""}
            <h3>${escapeHtml(product.title)}</h3>
            <p>${escapeHtml(product.description || "")}</p>
            <button data-buy="${product.id}">${product.price ? "Acheter" : "Accéder"}</button>
          </div>
        </article>`;
      })
      .join("") || "<p>Aucun produit publié pour le moment.</p>";

  renderFeaturedBanner(products);

  window.ExpertlyTracking?.track("store_viewed", {
    product_count: products.length,
    creator_slug: profile.slug,
  });
}

function openCheckout(product) {
  if (!product) return;
  selectedProduct = product;
  const isFree = product.price === 0;
  document.querySelector("#checkoutContent").innerHTML = `
    <div class="checkout-product">
      <div class="public-offer-icon" style="--offer-color:${safeColor(product.color, safeColor(state.profile.accent, "#6558f5"))}">${initials(product.title)}</div>
      <div><h2>${escapeHtml(product.title)}</h2><p>${escapeHtml(product.type)} · Accès immédiat après confirmation</p></div>
    </div>
    <div class="checkout-summary">
      <div><span>Sous-total</span><span>${isFree ? "Gratuit" : euro.format(product.price)}</span></div>
      <div><span>TVA incluse</span><span>${isFree ? "0 €" : euro.format(Math.round(product.price * 0.2))}</span></div>
      <div><span>Total</span><span>${isFree ? "Gratuit" : euro.format(product.price)}</span></div>
    </div>
    <form id="checkoutForm">
      <label>Prénom et nom<input name="name" required autocomplete="name" placeholder="Sofia Bernard" /></label>
      <label>Email<input name="email" type="email" required autocomplete="email" placeholder="sofia@email.com" /></label>
      <button type="submit">${isFree ? "Recevoir l’accès" : `Continuer vers Stripe · ${euro.format(product.price)}`}</button>
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
      : "Recevoir l’accès";
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

document.querySelector("#leadButton").addEventListener("click", openLeadModal);
document.querySelector("#leadForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const freeProduct = state.products.find((product) => product.price === 0 && product.status === "published");
  if (!freeProduct) {
    showToast("Aucune ressource gratuite n’est encore configurée.");
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
    location.assign(result.accessUrl);
  } catch (error) {
    showToast(error.message || "Impossible d’envoyer la ressource.");
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
      body: JSON.stringify({ slug }),
    }).catch(() => {});
  }
  renderStore();
}

startStore();

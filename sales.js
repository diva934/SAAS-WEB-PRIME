let salesData = null;
const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function currentSlug() {
  return location.pathname.split("/").filter(Boolean).pop();
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function applyPage({ page, product, profile }) {
  salesData = { page, product, profile };
  const seller = profile.creatorName || "Expertly";
  document.title = `${page.headline} · ${seller}`;
  document.documentElement.style.setProperty("--page-accent", page.accent || "#6558f5");
  document.documentElement.style.setProperty("--page-bg", page.backgroundColor || "#f5f3ff");
  document.documentElement.style.setProperty("--page-text", page.textColor || "#17172a");
  document.documentElement.style.setProperty("--page-bg-image", page.backgroundImageUrl ? `url("${page.backgroundImageUrl}")` : "none");
  document.querySelector("#salesShell").classList.add(`layout-${page.layout || "split"}`);
  document.querySelector("#salesBadge").textContent = page.badge || product.type;
  document.querySelector("#sellerName").textContent = `${seller} · ${profile.creatorRole || "Créateur"}`;
  document.querySelector("#salesHeadline").textContent = page.headline;
  document.querySelector("#salesSubheadline").textContent = page.subheadline;
  document.querySelector("#salesProof").textContent = page.proof || "";
  document.querySelector("#salesPrice").textContent = product.price ? euro.format(product.price) : "Gratuit";
  document.querySelector("#salesButton").textContent = page.buttonText || "Je découvre l’offre";
  document.querySelector("#salesButton").disabled = false;
  document.querySelector("#salesDisclosure").textContent =
    page.disclosure || `Produit digital vendu par ${seller}.`;
  if (page.logoUrl) {
    const logo = document.querySelector("#salesLogo");
    logo.src = page.logoUrl;
    logo.hidden = false;
  }
  if (page.productImageUrl) {
    document.querySelector("#salesProductImage").src = page.productImageUrl;
    document.querySelector("#salesVisual").hidden = false;
  }
  renderSalesSections(page, product);
  window.ExpertlyTracking?.track("sales_page_viewed", {
    sales_page_id: page.id,
    sales_page_slug: page.slug,
    product_id: product.id,
    product_type: product.type,
    price: product.price,
    layout: page.layout,
    referrer: document.referrer || "direct",
  });
}

function renderLines(value = "") {
  return String(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");
}

function renderSalesSections(page, product) {
  const blocks = page.blocks || {};
  const sections = [];
  if (blocks.benefits) {
    sections.push(`
      <article class="sales-section-card">
        <span>Résultat</span>
        <h2>Ce que tu obtiens</h2>
        <p>${escapeHtml(page.subheadline || product.description)}</p>
      </article>
    `);
  }
  if (blocks.program && page.program) {
    sections.push(`
      <article class="sales-section-card">
        <span>Programme</span>
        <h2>Contenu de l'offre</h2>
        <ul>${renderLines(page.program)}</ul>
      </article>
    `);
  }
  if (blocks.testimonials && page.testimonial) {
    sections.push(`
      <article class="sales-section-card quote">
        <span>Preuve</span>
        <h2>Témoignage</h2>
        <p>${escapeHtml(page.testimonial)}</p>
      </article>
    `);
  }
  if (blocks.faq && page.faq) {
    sections.push(`
      <article class="sales-section-card">
        <span>FAQ</span>
        <h2>Questions fréquentes</h2>
        <ul>${renderLines(page.faq)}</ul>
      </article>
    `);
  }
  if (blocks.guarantee && page.proof) {
    sections.push(`
      <article class="sales-section-card">
        <span>Garantie</span>
        <h2>Achat sécurisé</h2>
        <p>${escapeHtml(page.proof)}</p>
      </article>
    `);
  }
  if (blocks.leadMagnet) {
    sections.push(`
      <article class="sales-section-card">
        <span>Lead magnet</span>
        <h2>Commence gratuitement</h2>
        <p>Inscris-toi pour recevoir la ressource gratuite puis découvre l'offre complète.</p>
      </article>
    `);
  }
  document.querySelector("#salesSections").innerHTML = sections.join("");
}

function openCheckout() {
  document.querySelector("#checkoutTitle").textContent = salesData.product.title;
  document.querySelector("#checkoutDescription").textContent =
    salesData.product.price ? `${euro.format(salesData.product.price)} · paiement sécurisé par Stripe` : "Accès gratuit envoyé par email";
  document.querySelector("#salesModal").classList.add("open");
  window.ExpertlyTracking?.track("sales_cta_clicked", {
    sales_page_id: salesData.page.id,
    sales_page_slug: salesData.page.slug,
    product_id: salesData.product.id,
    price: salesData.product.price,
  });
  window.ExpertlyTracking?.track("checkout_form_opened", {
    sales_page_slug: salesData.page.slug,
    product_id: salesData.product.id,
  });
}

function closeCheckout() {
  document.querySelector("#salesModal").classList.remove("open");
}

document.querySelector("#salesButton").addEventListener("click", openCheckout);
document.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-sales]") || event.target === document.querySelector("#salesModal")) closeCheckout();
});
document.querySelector("#salesCheckoutForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const button = event.currentTarget.querySelector("button");
  const error = document.querySelector("#salesError");
  button.disabled = true;
  button.textContent = "Préparation…";
  error.textContent = "";
  try {
    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: salesData.product.id,
        customerName: data.get("name").trim(),
        customerEmail: data.get("email").trim(),
        distinctId: window.ExpertlyTracking?.getDistinctId(),
        salesPageSlug: salesData.page.slug,
        source: "sales_page",
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Paiement indisponible.");
    window.ExpertlyTracking?.track("checkout_request_succeeded", {
      sales_page_slug: salesData.page.slug,
      product_id: salesData.product.id,
      free: Boolean(result.free),
    });
    location.assign(result.url || result.accessUrl);
  } catch (err) {
    error.textContent = err.message;
    button.disabled = false;
    button.textContent = "Continuer vers le paiement";
    window.ExpertlyTracking?.track("checkout_request_failed", {
      sales_page_slug: salesData.page.slug,
      product_id: salesData.product.id,
      error: err.message,
    });
  }
});

if (new URLSearchParams(location.search).get("embed") === "1") document.body.classList.add("embed");

fetch(`/api/page?slug=${encodeURIComponent(currentSlug())}`)
  .then(async (response) => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    applyPage(data);
  })
  .catch((error) => {
    document.querySelector("#salesHeadline").textContent = "Page indisponible";
    document.querySelector("#salesSubheadline").textContent = error.message || "Cette page n’est pas publiée.";
  });

const STORAGE_KEY = "offerlab_mvp_state_v1";

const fallback = {
  store: {
    creatorName: "Claire Mentor",
    creatorRole: "Business coach",
    bio: "Je t’aide à transformer ton expertise en une offre claire, désirable et rentable.",
    color: "#5965f2",
    showProof: true,
    showLeadMagnet: true,
    instagram: "@clairementor",
    youtube: "youtube.com/@clairementor",
  },
  offers: [],
  contacts: [],
  orders: [],
  traffic: { purchases: 0 },
};

function loadState() {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return fallback;
  }
}

let state = loadState();
let selectedOffer = null;
const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function initials(value) {
  return value
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function enablePointerTilt(cards) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  cards.forEach((card) => {
    const update = (event) => {
      const bounds = card.getBoundingClientRect();
      const x = Math.min(Math.max(event.clientX - bounds.left, 0), bounds.width);
      const y = Math.min(Math.max(event.clientY - bounds.top, 0), bounds.height);

      card.style.setProperty("--glow-x", `${(x / bounds.width) * 100}%`);
      card.style.setProperty("--glow-y", `${(y / bounds.height) * 100}%`);

      if (!reducedMotion) {
        card.style.setProperty("--card-rotate-x", `${((0.5 - y / bounds.height) * 5).toFixed(2)}deg`);
        card.style.setProperty("--card-rotate-y", `${((x / bounds.width - 0.5) * 5).toFixed(2)}deg`);
      }
    };

    const reset = () => {
      card.classList.remove("is-interacting");
      card.style.setProperty("--card-rotate-x", "0deg");
      card.style.setProperty("--card-rotate-y", "0deg");
    };

    card.addEventListener("pointerenter", (event) => {
      card.classList.add("is-interacting");
      update(event);
    });
    card.addEventListener("pointermove", update);
    card.addEventListener("pointerdown", (event) => {
      card.classList.add("is-interacting");
      update(event);
    });
    card.addEventListener("pointerleave", reset);
    card.addEventListener("pointerup", reset);
    card.addEventListener("pointercancel", reset);
  });
}

function renderStore() {
  const store = state.store;
  document.documentElement.style.setProperty("--accent", store.color || "#5965f2");
  document.title = `${store.creatorName} · Boutique`;
  document.querySelector("#creatorAvatar").textContent = initials(store.creatorName);
  document.querySelector("#creatorName").textContent = store.creatorName;
  document.querySelector("#creatorRole").textContent = store.creatorRole;
  document.querySelector("#creatorBio").textContent = store.bio;
  document.querySelector("#proofStrip").hidden = !store.showProof;
  document.querySelector("#leadCard").hidden = !store.showLeadMagnet;

  const instagram = document.querySelector("#instagramLink");
  instagram.textContent = store.instagram || "Instagram";
  instagram.hidden = !store.instagram;
  instagram.href = store.instagram?.startsWith("http") ? store.instagram : `https://instagram.com/${store.instagram?.replace("@", "")}`;

  const youtube = document.querySelector("#youtubeLink");
  youtube.hidden = !store.youtube;
  youtube.href = store.youtube?.startsWith("http") ? store.youtube : `https://${store.youtube}`;

  const offers = state.offers
    .filter((offer) => offer.status === "published")
    .sort((a, b) => Number(b.featured) - Number(a.featured));
  document.querySelector("#offerCount").textContent = `${offers.length} offres`;
  document.querySelector("#publicOffers").innerHTML =
    offers
      .map((offer) => `
        <article class="public-offer ${offer.featured ? "featured" : ""}" style="--offer-color:${offer.color}">
          ${offer.featured ? '<span class="featured-label">Recommandée</span>' : ""}
          <div class="public-offer-icon">${initials(offer.title)}</div>
          <div>
            <h3>${escapeHtml(offer.title)}</h3>
            <p>${escapeHtml(offer.description)}</p>
          </div>
          <div class="offer-buy">
            <strong>${offer.price ? euro.format(offer.price) : "Gratuit"}</strong>
            <button data-buy="${offer.id}">${offer.price ? "Découvrir" : "Accéder"}</button>
          </div>
        </article>
      `)
      .join("") || "<p>Aucune offre publiée pour le moment.</p>";
  enablePointerTilt(document.querySelectorAll(".public-offer"));
}

function openCheckout(offer) {
  selectedOffer = offer;
  const isFree = offer.price === 0;
  document.querySelector("#checkoutContent").innerHTML = `
    <div class="checkout-offer">
      <div class="public-offer-icon" style="--offer-color:${offer.color};background:${offer.color}">${initials(offer.title)}</div>
      <div><h2>${escapeHtml(offer.title)}</h2><p>${escapeHtml(offer.type)} · Accès immédiat</p></div>
    </div>
    <div class="checkout-summary">
      <div><span>Sous-total</span><span>${isFree ? "Gratuit" : euro.format(offer.price)}</span></div>
      <div><span>TVA incluse</span><span>${isFree ? "0 €" : euro.format(Math.round(offer.price * 0.2))}</span></div>
      <div><span>Total</span><span>${isFree ? "Gratuit" : euro.format(offer.price)}</span></div>
    </div>
    <form id="checkoutForm">
      <label>Prénom et nom<input name="name" required autocomplete="name" placeholder="Sofia Bernard" /></label>
      <label>Email<input name="email" type="email" required autocomplete="email" placeholder="sofia@email.com" /></label>
      ${isFree ? "" : '<label>Numéro de carte<input name="card" required inputmode="numeric" placeholder="4242 4242 4242 4242" maxlength="19" /></label>'}
      <button type="submit">${isFree ? "Recevoir l’accès" : `Payer ${euro.format(offer.price)}`}</button>
      <p class="secure-note">${isFree ? "Aucun paiement requis." : "Paiement de démonstration sécurisé par Stripe."}</p>
    </form>
  `;
  document.querySelector("#checkoutModal").classList.add("open");
  document.querySelector("#checkoutModal").setAttribute("aria-hidden", "false");
  document.querySelector("#checkoutForm").addEventListener("submit", completeCheckout);
  const card = document.querySelector('input[name="card"]');
  if (card) {
    card.addEventListener("input", () => {
      card.value = card.value.replace(/\D/g, "").replace(/(.{4})/g, "$1 ").trim().slice(0, 19);
    });
  }
}

function closeCheckout() {
  document.querySelector("#checkoutModal").classList.remove("open");
  document.querySelector("#checkoutModal").setAttribute("aria-hidden", "true");
}

function completeCheckout(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const name = data.get("name").trim();
  const email = data.get("email").trim();
  let contact = state.contacts.find((item) => item.email.toLowerCase() === email.toLowerCase());
  if (!contact) {
    contact = {
      id: `c_${Date.now()}`,
      name,
      email,
      segment: "Client",
      activity: "Achat à l’instant",
      value: selectedOffer.price,
    };
    state.contacts.unshift(contact);
  } else {
    contact.segment = "Client";
    contact.activity = "Achat à l’instant";
    contact.value += selectedOffer.price;
  }

  const order = {
    id: `OL-${1050 + state.orders.length}`,
    contactId: contact.id,
    offerId: selectedOffer.id,
    date: "À l’instant",
    amount: selectedOffer.price,
    status: "Payée",
  };
  state.orders.unshift(order);
  selectedOffer.sales += 1;
  state.traffic.purchases += 1;
  saveState();

  document.querySelector("#checkoutContent").innerHTML = `
    <div class="success-state">
      <div class="success-icon">✓</div>
      <h2>Commande confirmée</h2>
      <p>Un email d’accès a été envoyé à <strong>${escapeHtml(email)}</strong>.<br />Référence ${order.id}.</p>
      <button data-close-modal>Fermer</button>
    </div>
  `;
}

function openLeadModal() {
  document.querySelector("#leadModal").classList.add("open");
  document.querySelector("#leadModal").setAttribute("aria-hidden", "false");
}

function closeLeadModal() {
  document.querySelector("#leadModal").classList.remove("open");
  document.querySelector("#leadModal").setAttribute("aria-hidden", "true");
}

function showToast(message) {
  const toast = document.querySelector("#storeToast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2600);
}

document.addEventListener("click", (event) => {
  const buy = event.target.closest("[data-buy]");
  if (buy) openCheckout(state.offers.find((offer) => offer.id === buy.dataset.buy));
  if (event.target.closest("[data-close-modal]") || event.target === document.querySelector("#checkoutModal")) closeCheckout();
  if (event.target.closest("[data-close-lead]") || event.target === document.querySelector("#leadModal")) closeLeadModal();
});

document.querySelector("#openLeadModal").addEventListener("click", openLeadModal);
document.querySelector("#leadForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const email = data.get("email").trim();
  if (!state.contacts.some((contact) => contact.email.toLowerCase() === email.toLowerCase())) {
    state.contacts.unshift({
      id: `c_${Date.now()}`,
      name: data.get("name").trim(),
      email,
      segment: "Lead",
      activity: "Checklist téléchargée",
      value: 0,
    });
    saveState();
  }
  closeLeadModal();
  event.currentTarget.reset();
  showToast("Checklist envoyée. Vérifie ta boîte mail.");
});

window.addEventListener("storage", () => {
  state = loadState();
  renderStore();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeCheckout();
    closeLeadModal();
  }
});

renderStore();

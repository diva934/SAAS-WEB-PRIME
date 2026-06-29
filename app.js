const STORAGE_KEY = "offerlab_mvp_state_v1";

const seedState = {
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
  offers: [
    {
      id: "off_bootcamp",
      title: "Bootcamp Offre Signature",
      type: "Formation",
      price: 997,
      description: "8 semaines pour construire, positionner et vendre une offre premium.",
      status: "published",
      featured: true,
      color: "#5965f2",
      sales: 18,
      views: 642,
    },
    {
      id: "off_audit",
      title: "Audit stratégique 1:1",
      type: "Coaching",
      price: 249,
      description: "90 minutes pour identifier les blocages et prioriser ton plan d’action.",
      status: "published",
      featured: false,
      color: "#159b78",
      sales: 12,
      views: 311,
    },
    {
      id: "off_kit",
      title: "Kit Offre Signature",
      type: "Produit digital",
      price: 29,
      description: "Templates, scripts et exercices pour clarifier une offre qui se vend.",
      status: "published",
      featured: false,
      color: "#e65050",
      sales: 47,
      views: 1284,
    },
    {
      id: "off_masterclass",
      title: "Masterclass de conversion",
      type: "Formation",
      price: 0,
      description: "45 minutes pour corriger les trois erreurs qui bloquent tes ventes.",
      status: "draft",
      featured: false,
      color: "#151922",
      sales: 0,
      views: 0,
    },
  ],
  contacts: [
    { id: "c1", name: "Sofia Bernard", email: "sofia@atelier.co", segment: "Client", activity: "Achat il y a 12 min", value: 997 },
    { id: "c2", name: "Thomas Leroy", email: "thomas@pulse.fr", segment: "Prospect chaud", activity: "Checkout abandonné", value: 0 },
    { id: "c3", name: "Inès Mercier", email: "ines@studioim.fr", segment: "Client", activity: "Achat hier", value: 1246 },
    { id: "c4", name: "Lucas Fontaine", email: "lucas@independant.fr", segment: "Lead", activity: "Kit téléchargé", value: 0 },
    { id: "c5", name: "Sarah Petit", email: "sarah@collectif.io", segment: "Prospect chaud", activity: "3 pages consultées", value: 29 },
    { id: "c6", name: "Mehdi Amari", email: "mehdi@scaleup.fr", segment: "Client", activity: "Achat il y a 4 jours", value: 997 },
  ],
  orders: [
    { id: "OL-1048", contactId: "c1", offerId: "off_bootcamp", date: "23 juin, 10:42", amount: 997, status: "Payée" },
    { id: "OL-1047", contactId: "c3", offerId: "off_audit", date: "22 juin, 18:15", amount: 249, status: "Payée" },
    { id: "OL-1046", contactId: "c3", offerId: "off_bootcamp", date: "22 juin, 18:12", amount: 997, status: "Payée" },
    { id: "OL-1045", contactId: "c5", offerId: "off_kit", date: "21 juin, 09:30", amount: 29, status: "Payée" },
    { id: "OL-1044", contactId: "c6", offerId: "off_bootcamp", date: "19 juin, 15:04", amount: 997, status: "Payée" },
  ],
  traffic: {
    visits: 4832,
    leads: 624,
    checkouts: 146,
    purchases: 77,
    sources: [
      { name: "Instagram", value: 46 },
      { name: "YouTube", value: 24 },
      { name: "Email", value: 18 },
      { name: "Direct", value: 12 },
    ],
    revenueSeries: [620, 880, 740, 1260, 1180, 1740, 1420, 2050, 1920, 2630, 2360, 3180],
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...clone(seedState), ...JSON.parse(saved) } : clone(seedState);
  } catch {
    return clone(seedState);
  }
}

let state = loadState();
let activeView = "dashboard";

if (!localStorage.getItem(STORAGE_KEY)) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const viewNames = {
  dashboard: "Vue d’ensemble",
  offers: "Offres",
  store: "Boutique",
  contacts: "Contacts",
  orders: "Commandes",
  analytics: "Analytics",
  settings: "Réglages",
};

const euro = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: JSON.stringify(state) }));
}

function initials(name) {
  return name
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

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.querySelector("#toastRegion").append(toast);
  setTimeout(() => toast.remove(), 2800);
}

function setView(view) {
  if (!viewNames[view]) return;
  activeView = view;
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("active", section.id === `${view}View`);
  });
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  document.querySelector("#viewTitle").textContent = viewNames[view];
  history.replaceState(null, "", `#${view}`);
  document.querySelector("#sidebar").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
  renderView(view);
}

function totalRevenue() {
  return state.orders
    .filter((order) => order.status === "Payée")
    .reduce((sum, order) => sum + order.amount, 0);
}

function metricCard(label, value, trend, detail, down = false) {
  return `
    <article class="metric-card">
      <div class="metric-head"><span>${label}</span><span class="trend ${down ? "down" : ""}">${trend}</span></div>
      <strong>${value}</strong>
      <small>${detail}</small>
    </article>
  `;
}

function renderDashboard() {
  const revenue = totalRevenue();
  const conversion = ((state.traffic.purchases / state.traffic.visits) * 100).toFixed(1).replace(".", ",");
  const average = state.orders.length ? Math.round(revenue / state.orders.length) : 0;
  document.querySelector("#metricsGrid").innerHTML = [
    metricCard("Chiffre d’affaires", euro.format(revenue), "+18,4 %", "vs. période précédente"),
    metricCard("Commandes", state.orders.length, "+11,2 %", "77 ventes sur 30 jours"),
    metricCard("Taux de conversion", `${conversion} %`, "+0,6 pt", `${state.traffic.visits.toLocaleString("fr-FR")} visites`),
    metricCard("Panier moyen", euro.format(average), "-2,1 %", "Opportunité : order bump", true),
  ].join("");

  document.querySelector("#revenueTotal").textContent = euro.format(
    state.traffic.revenueSeries.reduce((sum, value) => sum + value, 0),
  );
  renderRevenueChart();

  document.querySelector("#offerPerformance").innerHTML = state.offers
    .filter((offer) => offer.status === "published")
    .slice(0, 4)
    .map((offer) => {
      const rate = offer.views ? ((offer.sales / offer.views) * 100).toFixed(1) : "0";
      return `
        <div class="performance-row">
          <div class="performance-name">
            <span class="offer-symbol" style="background:${offer.color}">${initials(offer.title)}</span>
            <span><strong>${escapeHtml(offer.title)}</strong><small>${offer.sales} ventes · ${euro.format(offer.price)}</small></span>
          </div>
          <div class="progress-track"><span style="width:${Math.min(Number(rate) * 9, 100)}%"></span></div>
          <strong>${rate} %</strong>
        </div>
      `;
    })
    .join("");

  document.querySelector("#activityList").innerHTML = state.orders
    .slice(0, 4)
    .map((order) => {
      const contact = state.contacts.find((item) => item.id === order.contactId);
      const offer = state.offers.find((item) => item.id === order.offerId);
      return `
        <div class="activity-item">
          <span class="activity-avatar">${initials(contact?.name || "Client")}</span>
          <span><strong>${escapeHtml(contact?.name || "Client")}</strong><small>${escapeHtml(offer?.title || "Offre")} · ${order.date}</small></span>
          <span class="activity-value">+${euro.format(order.amount)}</span>
        </div>
      `;
    })
    .join("");
}

function renderRevenueChart() {
  const svg = document.querySelector("#revenueChart");
  const values = state.traffic.revenueSeries;
  const max = Math.max(...values) * 1.12;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 700;
    const y = 225 - (value / max) * 205;
    return [x, y];
  });
  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `0,240 ${line} 700,240`;
  svg.innerHTML = `
    <defs>
      <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#5965f2" stop-opacity=".18"/>
        <stop offset="100%" stop-color="#5965f2" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <polygon points="${area}" fill="url(#chartFill)"></polygon>
    <polyline points="${line}" fill="none" stroke="#5965f2" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
    ${points.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="#fff" stroke="#5965f2" stroke-width="3"></circle>`).join("")}
  `;
}

function renderOffers() {
  const query = document.querySelector("#offerSearch")?.value.toLowerCase() || "";
  const filter = document.querySelector("#offerFilter")?.value || "all";
  const offers = state.offers.filter((offer) => {
    const matchesQuery = offer.title.toLowerCase().includes(query);
    const matchesFilter = filter === "all" || offer.status === filter;
    return matchesQuery && matchesFilter;
  });

  document.querySelector("#offerGrid").innerHTML =
    offers
      .map((offer) => {
        const rate = offer.views ? ((offer.sales / offer.views) * 100).toFixed(1).replace(".", ",") : "0";
        return `
          <article class="offer-card">
            <div class="offer-card-visual">
              <span class="offer-symbol" style="background:${offer.color}">${initials(offer.title)}</span>
              <span class="status-badge ${offer.status === "draft" ? "draft" : ""}">${offer.status === "draft" ? "Brouillon" : "Publiée"}</span>
            </div>
            <div class="offer-card-body">
              <h3>${escapeHtml(offer.title)}</h3>
              <p>${escapeHtml(offer.description)}</p>
              <div class="offer-card-stats">
                <div><span>Prix</span><strong>${offer.price ? euro.format(offer.price) : "Gratuit"}</strong></div>
                <div><span>Ventes</span><strong>${offer.sales}</strong></div>
                <div><span>Conversion</span><strong>${rate} %</strong></div>
              </div>
              <div class="offer-card-actions">
                <button data-edit-offer="${offer.id}">Modifier</button>
                <button data-toggle-offer="${offer.id}" title="${offer.status === "published" ? "Dépublier" : "Publier"}">${offer.status === "published" ? "◉" : "○"}</button>
                <button data-delete-offer="${offer.id}" title="Supprimer">×</button>
              </div>
            </div>
          </article>
        `;
      })
      .join("") || '<div class="empty-state">Aucune offre ne correspond à cette recherche.</div>';
}

function renderStoreEditor() {
  const form = document.querySelector("#storeForm");
  Object.entries(state.store).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (!field) return;
    if (field.type === "checkbox") field.checked = Boolean(value);
    else field.value = value;
  });
  document.querySelectorAll("[data-color]").forEach((button) => {
    button.classList.toggle("active", button.dataset.color === state.store.color);
  });
}

function renderContacts() {
  const query = document.querySelector("#contactSearch")?.value.toLowerCase() || "";
  const filter = document.querySelector("#contactFilter")?.value || "all";
  const contacts = state.contacts.filter((contact) => {
    const haystack = `${contact.name} ${contact.email}`.toLowerCase();
    return haystack.includes(query) && (filter === "all" || contact.segment === filter);
  });
  const clients = state.contacts.filter((contact) => contact.segment === "Client");
  const hot = state.contacts.filter((contact) => contact.segment === "Prospect chaud");
  document.querySelector("#contactMetrics").innerHTML = [
    metricCard("Contacts", state.contacts.length, "+42", "ce mois-ci"),
    metricCard("Clients", clients.length, "+12", "acheteurs uniques"),
    metricCard("Prospects chauds", hot.length, "+7", "à relancer"),
  ].join("");

  document.querySelector("#contactTable").innerHTML = contacts
    .map((contact) => {
      const badgeClass = contact.segment === "Client" ? "client" : contact.segment === "Prospect chaud" ? "hot" : "";
      return `
        <tr>
          <td><div class="contact-cell"><span class="activity-avatar">${initials(contact.name)}</span><span><strong>${escapeHtml(contact.name)}</strong><small>${escapeHtml(contact.email)}</small></span></div></td>
          <td><span class="segment-badge ${badgeClass}">${contact.segment}</span></td>
          <td>${contact.activity}</td>
          <td><strong>${euro.format(contact.value)}</strong></td>
          <td>•••</td>
        </tr>
      `;
    })
    .join("");
}

function renderOrders() {
  document.querySelector("#orderTable").innerHTML = state.orders
    .map((order) => {
      const contact = state.contacts.find((item) => item.id === order.contactId);
      const offer = state.offers.find((item) => item.id === order.offerId);
      return `
        <tr>
          <td><strong>${order.id}</strong></td>
          <td>${escapeHtml(contact?.name || "Client")}</td>
          <td>${escapeHtml(offer?.title || "Offre supprimée")}</td>
          <td>${order.date}</td>
          <td><strong>${euro.format(order.amount)}</strong></td>
          <td><span class="status-badge">${order.status}</span></td>
        </tr>
      `;
    })
    .join("");
}

function renderAnalytics() {
  const conversion = ((state.traffic.purchases / state.traffic.visits) * 100).toFixed(1).replace(".", ",");
  const checkoutRate = ((state.traffic.purchases / state.traffic.checkouts) * 100).toFixed(1).replace(".", ",");
  document.querySelector("#analyticsMetrics").innerHTML = [
    metricCard("Visites", state.traffic.visits.toLocaleString("fr-FR"), "+22,6 %", "sessions uniques"),
    metricCard("Leads capturés", state.traffic.leads, "+14,8 %", "12,9 % des visites"),
    metricCard("Conversion globale", `${conversion} %`, "+0,6 pt", "visite vers achat"),
    metricCard("Checkout vers achat", `${checkoutRate} %`, "+4,1 pt", "paiements finalisés"),
  ].join("");

  const steps = [
    ["Visites", state.traffic.visits, 100],
    ["Leads", state.traffic.leads, 72],
    ["Checkouts", state.traffic.checkouts, 47],
    ["Achats", state.traffic.purchases, 31],
  ];
  document.querySelector("#funnel").innerHTML = steps
    .map(([name, value, width]) => `
      <div class="funnel-step"><span>${name}</span><div class="funnel-bar"><span style="width:${width}%"></span></div><strong>${value.toLocaleString("fr-FR")}</strong></div>
    `)
    .join("");
  document.querySelector("#sourceList").innerHTML = state.traffic.sources
    .map((source) => `
      <div class="source-row"><strong>${source.name}</strong><div class="progress-track"><span style="width:${source.value}%"></span></div><span>${source.value} %</span></div>
    `)
    .join("");
}

function renderView(view) {
  if (view === "dashboard") renderDashboard();
  if (view === "offers") renderOffers();
  if (view === "store") renderStoreEditor();
  if (view === "contacts") renderContacts();
  if (view === "orders") renderOrders();
  if (view === "analytics") renderAnalytics();
}

function openOfferModal(offer = null) {
  const modal = document.querySelector("#offerModal");
  const form = document.querySelector("#offerForm");
  form.reset();
  form.elements.id.value = offer?.id || "";
  form.elements.title.value = offer?.title || "";
  form.elements.type.value = offer?.type || "Formation";
  form.elements.price.value = offer?.price ?? 0;
  form.elements.description.value = offer?.description || "";
  form.elements.status.value = offer?.status || "published";
  form.elements.color.value = offer?.color || "#5965f2";
  form.elements.featured.checked = Boolean(offer?.featured);
  document.querySelector("#offerModalTitle").textContent = offer ? "Modifier l’offre" : "Créer une offre";
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  setTimeout(() => form.elements.title.focus(), 50);
}

function closeOfferModal() {
  const modal = document.querySelector("#offerModal");
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function submitOffer(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const id = data.get("id");
  const existing = state.offers.find((offer) => offer.id === id);
  const nextOffer = {
    id: id || `off_${Date.now()}`,
    title: data.get("title").trim(),
    type: data.get("type"),
    price: Number(data.get("price")),
    description: data.get("description").trim(),
    status: data.get("status"),
    color: data.get("color"),
    featured: data.get("featured") === "on",
    sales: existing?.sales || 0,
    views: existing?.views || 0,
  };
  if (nextOffer.featured) state.offers.forEach((offer) => (offer.featured = false));
  if (existing) Object.assign(existing, nextOffer);
  else state.offers.unshift(nextOffer);
  saveState();
  closeOfferModal();
  renderOffers();
  showToast(existing ? "Offre mise à jour." : "Offre créée et ajoutée au catalogue.");
}

function refreshPreview() {
  const frame = document.querySelector("#storePreview");
  if (frame) frame.src = `./store.html?preview=1&t=${Date.now()}`;
}

function saveStore() {
  const form = document.querySelector("#storeForm");
  const data = new FormData(form);
  state.store = {
    ...state.store,
    creatorName: data.get("creatorName").trim(),
    creatorRole: data.get("creatorRole").trim(),
    bio: data.get("bio").trim(),
    instagram: data.get("instagram").trim(),
    youtube: data.get("youtube").trim(),
    showProof: data.get("showProof") === "on",
    showLeadMagnet: data.get("showLeadMagnet") === "on",
  };
  saveState();
  refreshPreview();
  showToast("Boutique publiée.");
}

function exportContacts() {
  const rows = [["Nom", "Email", "Segment", "Valeur"], ...state.contacts.map((contact) => [contact.name, contact.email, contact.segment, contact.value])];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "offerlab-contacts.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function simulateOrder() {
  const publishedOffers = state.offers.filter((offer) => offer.status === "published" && offer.price > 0);
  const offer = publishedOffers[Math.floor(Math.random() * publishedOffers.length)];
  const contact = state.contacts[Math.floor(Math.random() * state.contacts.length)];
  const number = 1049 + state.orders.length;
  state.orders.unshift({
    id: `OL-${number}`,
    contactId: contact.id,
    offerId: offer.id,
    date: "À l’instant",
    amount: offer.price,
    status: "Payée",
  });
  offer.sales += 1;
  contact.segment = "Client";
  contact.value += offer.price;
  contact.activity = "Achat à l’instant";
  state.traffic.purchases += 1;
  saveState();
  renderOrders();
  showToast(`Nouvelle vente simulée : ${euro.format(offer.price)}.`);
}

document.addEventListener("click", (event) => {
  const navButton = event.target.closest("[data-view]");
  const viewTarget = event.target.closest("[data-view-target], [data-view-trigger]");
  if (navButton) setView(navButton.dataset.view);
  if (viewTarget) setView(viewTarget.dataset.viewTarget || viewTarget.dataset.viewTrigger);

  if (event.target.closest('[data-action="new-offer"]')) openOfferModal();
  if (event.target.closest("[data-close-modal]") || event.target === document.querySelector("#offerModal")) closeOfferModal();

  const edit = event.target.closest("[data-edit-offer]");
  if (edit) openOfferModal(state.offers.find((offer) => offer.id === edit.dataset.editOffer));

  const toggle = event.target.closest("[data-toggle-offer]");
  if (toggle) {
    const offer = state.offers.find((item) => item.id === toggle.dataset.toggleOffer);
    offer.status = offer.status === "published" ? "draft" : "published";
    saveState();
    renderOffers();
    showToast(offer.status === "published" ? "Offre publiée." : "Offre passée en brouillon.");
  }

  const remove = event.target.closest("[data-delete-offer]");
  if (remove) {
    const offer = state.offers.find((item) => item.id === remove.dataset.deleteOffer);
    if (offer && window.confirm(`Supprimer « ${offer.title} » ?`)) {
      state.offers = state.offers.filter((item) => item.id !== offer.id);
      saveState();
      renderOffers();
      showToast("Offre supprimée.");
    }
  }

  const color = event.target.closest("[data-color]");
  if (color) {
    state.store.color = color.dataset.color;
    document.querySelectorAll("[data-color]").forEach((button) => button.classList.toggle("active", button === color));
    saveState();
    refreshPreview();
  }

  const device = event.target.closest("[data-device]");
  if (device) {
    document.querySelectorAll("[data-device]").forEach((button) => button.classList.toggle("active", button === device));
    document.querySelector("#storePreviewFrame").classList.toggle("mobile", device.dataset.device === "mobile");
  }
});

document.querySelector("#menuButton").addEventListener("click", () => document.querySelector("#sidebar").classList.toggle("open"));
document.querySelector("#offerForm").addEventListener("submit", submitOffer);
document.querySelector("#saveStoreButton").addEventListener("click", saveStore);
document.querySelector("#exportContacts").addEventListener("click", exportContacts);
document.querySelector("#simulateOrder").addEventListener("click", simulateOrder);
document.querySelector("#offerSearch").addEventListener("input", renderOffers);
document.querySelector("#offerFilter").addEventListener("change", renderOffers);
document.querySelector("#contactSearch").addEventListener("input", renderContacts);
document.querySelector("#contactFilter").addEventListener("change", renderContacts);
document.querySelector("#settingsForm").addEventListener("submit", (event) => {
  event.preventDefault();
  showToast("Réglages enregistrés.");
});
document.querySelector("#notificationButton").addEventListener("click", () => showToast("Aucune nouvelle notification."));

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeOfferModal();
});

const initialView = location.hash.replace("#", "");
setView(viewNames[initialView] ? initialView : "dashboard");

if (new URLSearchParams(location.search).get("payment") === "success") {
  showToast("Paiement confirmé. Bienvenue dans OfferLab.");
  history.replaceState(null, "", `${location.pathname}${location.hash}`);
}

const STORAGE_KEY = "expertly_client_v2";
const DEMO_MODE = new URLSearchParams(window.location.search).get("demo") === "1";
let publicConfig = window.EXPERTLY_CONFIG || {};
let supabaseClient = null;
let activeSupabaseSession = null;

const seedState = {
  profile: {
    firstName: "",
    creatorName: "",
    creatorRole: "Business coach",
    bio: "J'aide les indépendants à transformer leur expertise en une offre claire, désirable et rentable.",
    slug: "boutique",
    accent: "#6558f5",
    logo: "",
  },
  products: [
    {
      id: "prod_bootcamp",
      title: "Bootcamp Offre Signature",
      type: "Formation",
      price: 997,
      description: "8 semaines pour construire, positionner et vendre une offre premium.",
      status: "published",
      featured: true,
      color: "#6558f5",
      fileName: "espace-membre-bootcamp",
      sales: 18,
      views: 642,
    },
    {
      id: "prod_audit",
      title: "Audit stratégique 1:1",
      type: "Coaching",
      price: 249,
      description: "90 minutes pour identifier les blocages et prioriser ton plan d'action.",
      status: "published",
      featured: false,
      color: "#1eaa73",
      fileName: "https://cal.com/expertly/audit",
      sales: 12,
      views: 311,
    },
    {
      id: "prod_kit",
      title: "Kit Offre Signature",
      type: "Produit digital",
      price: 29,
      description: "Templates, scripts et exercices pour clarifier une offre qui se vend.",
      status: "published",
      featured: false,
      color: "#e85a6a",
      fileName: "kit-offre-signature.zip",
      sales: 47,
      views: 1284,
    },
    {
      id: "prod_masterclass",
      title: "Masterclass Conversion",
      type: "Masterclass",
      price: 0,
      description: "45 minutes pour corriger les trois erreurs qui bloquent tes ventes.",
      status: "draft",
      featured: false,
      color: "#ef8d32",
      fileName: "masterclass-conversion.mp4",
      sales: 0,
      views: 0,
    },
  ],
  pages: [
    {
      id: "page_bootcamp",
      name: "Page Bootcamp Offre Signature",
      productId: "prod_bootcamp",
      headline: "Construis une offre premium que tes clients veulent acheter.",
      status: "draft",
      visits: 642,
      conversion: 2.8,
    },
    {
      id: "page_kit",
      name: "Page Kit Offre Signature",
      productId: "prod_kit",
      headline: "Le kit pratique pour clarifier ton offre dès aujourd'hui.",
      status: "published",
      visits: 1284,
      conversion: 3.7,
    },
  ],
  contacts: [
    { id: "c1", name: "Sofia Bernard", email: "sofia@atelier.co", segment: "Client", activity: "Achat il y a 12 min", value: 997, joined: "25 juin 2026" },
    { id: "c2", name: "Thomas Leroy", email: "thomas@pulse.fr", segment: "Prospect chaud", activity: "Checkout abandonné", value: 0, joined: "24 juin 2026" },
    { id: "c3", name: "Inès Mercier", email: "ines@studioim.fr", segment: "Client", activity: "Achat hier", value: 1246, joined: "22 juin 2026" },
    { id: "c4", name: "Lucas Fontaine", email: "lucas@independant.fr", segment: "Lead", activity: "Checklist téléchargée", value: 0, joined: "21 juin 2026" },
    { id: "c5", name: "Sarah Petit", email: "sarah@collectif.io", segment: "Prospect chaud", activity: "3 pages consultées", value: 29, joined: "19 juin 2026" },
    { id: "c6", name: "Mehdi Amari", email: "mehdi@scaleup.fr", segment: "Client", activity: "Achat il y a 4 jours", value: 997, joined: "18 juin 2026" },
    { id: "c7", name: "Chloé Robert", email: "chloe@studio.fr", segment: "Lead", activity: "Inscription newsletter", value: 0, joined: "17 juin 2026" },
  ],
  orders: [
    { id: "EXP-1052", contactId: "c1", productId: "prod_bootcamp", date: "25 juin, 10:42", amount: 997, status: "paid" },
    { id: "EXP-1051", contactId: "c3", productId: "prod_audit", date: "24 juin, 18:15", amount: 249, status: "paid" },
    { id: "EXP-1050", contactId: "c3", productId: "prod_bootcamp", date: "24 juin, 18:12", amount: 997, status: "paid" },
    { id: "EXP-1049", contactId: "c5", productId: "prod_kit", date: "23 juin, 09:30", amount: 29, status: "paid" },
    { id: "EXP-1048", contactId: "c6", productId: "prod_bootcamp", date: "21 juin, 15:04", amount: 997, status: "paid" },
    { id: "EXP-1047", contactId: "c2", productId: "prod_kit", date: "20 juin, 13:17", amount: 29, status: "refunded" },
  ],
  analytics: {
    visits: 4832,
    leads: 624,
    checkouts: 146,
    purchases: 77,
    revenueSeries: [510, 760, 590, 980, 870, 1420, 1230, 1690, 1510, 2160, 1920, 2790],
    sources: [
      { name: "Instagram", value: 46 },
      { name: "YouTube", value: 24 },
      { name: "Email", value: 18 },
      { name: "Direct", value: 12 },
    ],
  },
  emails: [
    { id: "em1", name: "Livraison post-achat", description: "Envoie automatiquement le lien d'accès au client après le paiement.", trigger: "Achat confirmé", sent: 77, openRate: 86, active: false },
    { id: "em2", name: "Relance panier abandonné", description: "Relance les prospects qui ont commencé leur paiement sans le terminer.", trigger: "Checkout abandonné", sent: 41, openRate: 52, active: true },
    { id: "em3", name: "Bienvenue nouveau lead", description: "Livre la ressource gratuite et présente ton offre principale.", trigger: "Nouveau contact", sent: 624, openRate: 71, active: true },
  ],
};

const demoState = JSON.parse(JSON.stringify(seedState));
demoState.profile = {
  ...demoState.profile,
  firstName: "Léa",
  creatorName: "Atelier Nova",
  creatorRole: "Coach business",
  slug: "atelier-nova",
};

// Un nouveau compte démarre sans catalogue ni données commerciales.
seedState.products = [];
seedState.pages = [];
seedState.contacts = [];
seedState.orders = [];
seedState.analytics = {
  visits: 0,
  leads: 0,
  checkouts: 0,
  purchases: 0,
  sources: [
    { name: "Instagram", value: 0 },
    { name: "YouTube", value: 0 },
    { name: "Email", value: 0 },
    { name: "Direct", value: 0 },
  ],
  revenueSeries: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeState(input = {}) {
  const base = clone(seedState);
  const next = {
    ...base,
    ...input,
    profile: { ...base.profile, ...(input.profile || {}) },
    analytics: { ...base.analytics, ...(input.analytics || {}) },
  };
  next.products = Array.isArray(input.products)
    ? input.products.map((product) => ({
        featured: false,
        sales: 0,
      views: 0,
      offerRole: "core",
      accessType: "link",
      compareAtPrice: 0,
      funnelPriority: "standard",
      bumpProductId: "",
      upsellProductId: "",
      coverUrl: "",
      cardSize: "m",
      ...product,
    }))
    : base.products;
  next.pages = Array.isArray(input.pages)
    ? input.pages.map((page) => ({
        blocks: {
          benefits: true,
          program: true,
          testimonials: false,
          faq: true,
          guarantee: true,
          leadMagnet: false,
          ...(page.blocks || {}),
        },
        program: "",
        faq: "",
        testimonial: "",
        ...page,
      }))
    : base.pages;
  next.contacts = Array.isArray(input.contacts)
    ? input.contacts.map((contact) => ({
        notes: "",
        nextAction: contact.segment === "Client" ? "Suivi satisfaction" : "Relance personnalisée",
        source: "Direct",
        tags: [],
        buyingScore: contact.segment === "Client" ? 100 : contact.segment === "Prospect chaud" ? 72 : 28,
        lastProductId: "",
        ...contact,
      }))
    : base.contacts;
  next.orders = Array.isArray(input.orders) ? input.orders : base.orders;
  const incomingEmails = Array.isArray(input.emails) ? input.emails : [];
  const emailById = new Map(incomingEmails.map((email) => [email.id, email]));
  const defaultEmails = [
    ...base.emails,
    { id: "em2", name: "Bienvenue nouveau lead", description: "Livre le lead magnet, présente l'offre principale et crée la première relation.", trigger: "Nouveau lead", sent: 0, openRate: 0, active: false },
    { id: "em3", name: "Relance checkout abandonné", description: "Relance les prospects qui ont ouvert le paiement sans finaliser.", trigger: "Checkout ouvert sans achat", sent: 0, openRate: 0, active: false },
    { id: "em4", name: "Demande d'avis client", description: "Collecte preuve sociale et témoignages après achat.", trigger: "7 jours après achat", sent: 0, openRate: 0, active: false },
    { id: "em5", name: "Proposition upsell", description: "Propose l'offre suivante aux clients déjà engagés.", trigger: "Achat confirmé", sent: 0, openRate: 0, active: false },
  ];
  next.emails = defaultEmails
    .filter((email, index, list) => list.findIndex((item) => item.id === email.id) === index)
    .map((email) => ({ ...email, ...(emailById.get(email.id) || {}) }));
  for (const email of incomingEmails) {
    if (!next.emails.some((item) => item.id === email.id)) next.emails.push(email);
  }
  next.analytics.sources = Array.isArray(next.analytics.sources) ? next.analytics.sources : clone(base.analytics.sources);
  next.analytics.revenueSeries =
    Array.isArray(next.analytics.revenueSeries) && next.analytics.revenueSeries.length
      ? next.analytics.revenueSeries
      : clone(base.analytics.revenueSeries);
  return next;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return normalizeState(saved || seedState);
  } catch {
    return normalizeState(seedState);
  }
}

let state = DEMO_MODE ? normalizeState(demoState) : loadState();
let activeView = "overview";
let integrationConfig = {
  stripe: false,
  stripeWebhook: false,
  email: false,
  umami: { enabled: false },
};

const offerRoleLabels = {
  lead: "Lead magnet",
  tripwire: "Produit d'appel",
  core: "Offre principale",
  upsell: "Upsell",
};

const accessTypeLabels = {
  link: "Lien privé",
  file: "Fichier",
  calendar: "Calendrier",
  video: "Vidéo",
  member: "Espace membre",
};

const emailStatusLabels = {
  sent: "Accès envoyé",
  pending: "En attente",
  failed: "Erreur email",
  not_configured: "Email non configuré",
};

function trackEvent(name, properties = {}) {
  if (DEMO_MODE) return;
  window.ExpertlyTracking?.track(name, properties);
}

if (!DEMO_MODE && !localStorage.getItem(STORAGE_KEY)) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const viewNames = {
  overview: "Vue d'ensemble",
  products: "Produits",
  pages: "Pages de vente",
  tunnel: "Tunnel",
  orders: "Commandes",
  contacts: "Contacts",
  analytics: "Analytics",
  finance: "Finance",
  emails: "Emails",
  settings: "Réglages",
};

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

function slugify(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function pagePublicPath(page) {
  return `/p/${page.slug}`;
}

function pagePublicUrl(page) {
  return location.protocol.startsWith("http")
    ? `${location.origin}${pagePublicPath(page)}`
    : `http://127.0.0.1:4310${pagePublicPath(page)}`;
}

function storePublicPath() {
  const slug = slugify(state.profile.slug || state.profile.creatorName || "boutique");
  return `/b/${slug}`;
}

function storePublicUrl() {
  return location.protocol.startsWith("http")
    ? `${location.origin}${storePublicPath()}`
    : `http://127.0.0.1:4310${storePublicPath()}`;
}

function storePreviewPath() {
  return `${storePublicPath()}?embed=1&t=${Date.now()}`;
}

function isShortCode(value) {
  return /^[a-z0-9]{6}$/.test(value || "");
}

// Code court aléatoire (6 caractères a-z0-9) pour un lien de bio minimal.
function generateStoreCode() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  const buf =
    window.crypto && window.crypto.getRandomValues
      ? window.crypto.getRandomValues(new Uint32Array(6))
      : Array.from({ length: 6 }, () => Math.floor(Math.random() * 1e9));
  for (let i = 0; i < 6; i += 1) code += alphabet[buf[i] % alphabet.length];
  return code;
}

// Lien court à la racine si le slug est un code 6 caractères (domaine/a7k2x9),
// sinon repli sécurisé sur /go/{slug}.
function goPathFor(slug) {
  const clean = slugify(slug || "");
  return isShortCode(clean) ? `/${clean}` : `/go/${clean}`;
}

function goPublicPath() {
  return goPathFor(state.profile.slug || state.profile.creatorName || "boutique");
}

// Lien « bio Instagram » : redirecteur intelligent qui sort du navigateur in-app.
// Utilise un domaine court si SHORT_LINK_BASE est configuré, sinon l'origine courante.
function goPublicUrl() {
  const base = (publicConfig.shortLinkBase || "").replace(/\/+$/, "");
  const origin = base || (location.protocol.startsWith("http") ? location.origin : "http://127.0.0.1:4310");
  return `${origin}${goPublicPath()}`;
}

// Dessine le QR du lien de bio sur un <canvas>. La lib qrcode-generator tourne
// côté client : l'URL ne quitte jamais le navigateur. Échoue en silence si
// indisponible — le lien copiable reste l'option principale.
function renderBioQr(canvas, text) {
  if (!canvas || typeof qrcode === "undefined" || !text) return;
  try {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    const ctx = canvas.getContext("2d");
    const size = canvas.width;
    const cell = Math.floor(size / (count + 4));
    const offset = Math.floor((size - cell * count) / 2);
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#17172a";
    for (let r = 0; r < count; r += 1) {
      for (let c = 0; c < count; c += 1) {
        if (qr.isDark(r, c)) ctx.fillRect(offset + c * cell, offset + r * cell, cell, cell);
      }
    }
  } catch {
    // QR indisponible : on ignore.
  }
}

// Garantit qu'une boutique a toujours un code unique en fin de lien, même si
// l'assistant d'onboarding n'a pas été utilisé (ex. produit créé avant).
async function ensureStoreCode() {
  if (DEMO_MODE) return;
  const current = (state.profile.slug || "").trim();
  // Déjà un code valide, ou un identifiant personnalisé choisi -> on garde.
  if (isShortCode(current)) return;
  if (current && current !== "boutique") return;

  let code = generateStoreCode();
  if (location.protocol.startsWith("http")) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const response = await authenticatedFetch(`/api/slug-available?slug=${encodeURIComponent(code)}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({ available: true }));
        if (data.available !== false) break;
      } catch {
        break;
      }
      code = generateStoreCode();
    }
  }
  state.profile.slug = code;
  saveState();
  renderIdentity();
  showToast(`Ton lien de boutique est prêt : ${goPublicUrl()}`);
}

function orderAccessUrl(order) {
  if (!order?.accessToken) return "";
  return location.protocol.startsWith("http")
    ? `${location.origin}/access.html?token=${encodeURIComponent(order.accessToken)}`
    : `http://127.0.0.1:4310/access.html?token=${encodeURIComponent(order.accessToken)}`;
}

function emailStatusLabel(status) {
  return emailStatusLabels[status] || "Non envoyé";
}

function emailStatusClass(status) {
  if (status === "sent") return "client";
  if (status === "failed") return "draft";
  if (status === "pending") return "hot";
  return "";
}

function productReadiness(product) {
  const issues = [];
  if (!product.fileName) issues.push("accès manquant");
  if (!product.description || product.description.length < 30) issues.push("description courte");
  if (product.status === "published" && product.price > 0 && !integrationConfig.stripe) issues.push("Stripe non connecté");
  return issues;
}

function marketingUrl() {
  return publicConfig.marketingUrl?.startsWith("http") ? publicConfig.marketingUrl : "https://saas-web-prime.vercel.app";
}

async function loadPublicConfig() {
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    if (response.ok) publicConfig = { ...publicConfig, ...(await response.json()) };
  } catch {
    // En local, le serveur peut injecter directement la configuration dans la page.
  }
  supabaseClient =
    publicConfig.supabaseUrl?.startsWith("http") &&
    publicConfig.supabaseAnonKey &&
    !publicConfig.supabaseAnonKey.startsWith("%") &&
    window.supabase
      ? window.supabase.createClient(publicConfig.supabaseUrl, publicConfig.supabaseAnonKey)
      : null;
}

async function authHeaders() {
  if (!supabaseClient) return {};
  const { data } = await supabaseClient.auth.getSession();
  activeSupabaseSession = data.session;
  return activeSupabaseSession?.access_token ? { Authorization: `Bearer ${activeSupabaseSession.access_token}` } : {};
}

async function authenticatedFetch(url, options = {}) {
  const headers = {
    ...(options.headers || {}),
    ...(await authHeaders()),
  };
  return fetch(url, { ...options, headers });
}

function showCreatorAccessGate({ title, message }) {
  document.body.classList.remove("auth-pending");
  document.body.classList.add("auth-locked");
  let gate = document.querySelector("#creatorAccessGate");
  if (!gate) {
    gate = document.createElement("section");
    gate.id = "creatorAccessGate";
    gate.className = "auth-gate";
    document.body.append(gate);
  }
  gate.innerHTML = `
    <div class="auth-gate-card">
      <img src="./assets/expertly-logo.png" alt="Expertly" />
      <p class="eyebrow">Espace client</p>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      <form id="creatorAccessForm">
        <label>Email<input name="email" type="email" autocomplete="email" required placeholder="toi@email.com" /></label>
        <label>Mot de passe<input name="password" type="password" autocomplete="current-password" minlength="6" required placeholder="6 caracteres minimum" /></label>
        <button type="submit">Se connecter</button>
        <small id="creatorAccessFeedback"></small>
      </form>
      <a href="${escapeHtml(marketingUrl())}">Retour au site Expertly</a>
    </div>
  `;
  gate.querySelector("#creatorAccessForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const feedback = gate.querySelector("#creatorAccessFeedback");
    const button = gate.querySelector("button");
    const data = new FormData(event.currentTarget);
    button.disabled = true;
    feedback.textContent = "";
    try {
      const result = await supabaseClient.auth.signInWithPassword({
        email: data.get("email").trim(),
        password: data.get("password"),
      });
      if (result.error) throw result.error;
      window.location.reload();
    } catch (error) {
      feedback.textContent = error.message || "Connexion impossible.";
    } finally {
      button.disabled = false;
    }
  });
}

async function ensureCreatorAccess() {
  if (DEMO_MODE) {
    document.querySelector("#creatorAccessGate")?.remove();
    document.body.classList.remove("auth-pending", "auth-locked");
    return true;
  }
  if (!supabaseClient) {
    document.body.classList.remove("auth-pending");
    return true;
  }
  const { data } = await supabaseClient.auth.getSession();
  activeSupabaseSession = data.session;
  if (!activeSupabaseSession?.user) {
    showCreatorAccessGate({
      title: "Connecte-toi pour ouvrir le CRM",
      message: "Utilise le compte cree avant le paiement. Une fois l'abonnement actif, le CRM s'ouvrira automatiquement.",
    });
    return false;
  }
  const subscriptionResponse = await authenticatedFetch("/api/subscription-status", { cache: "no-store" });
  const subscription = await subscriptionResponse.json().catch(() => ({}));
  if (!subscriptionResponse.ok || !subscription.active) {
    showCreatorAccessGate({
      title: "Abonnement requis",
      message: "Ce compte n'a pas d'abonnement actif. Termine le paiement sur le site Expertly, puis reconnecte-toi ici.",
    });
    return false;
  }
  document.querySelector("#creatorAccessGate")?.remove();
  document.body.classList.remove("auth-pending", "auth-locked");
  return true;
}

async function fileToDataUrl(file) {
  if (!file?.size) return "";
  if (file.size > 900_000) throw new Error("L'image doit faire moins de 900 Ko.");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Impossible de lire l'image."));
    reader.readAsDataURL(file);
  });
}

function saveState() {
  if (DEMO_MODE) {
    showToast("Mode démo : les modifications sont désactivées.");
    return;
  }
  state = normalizeState(state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  document.querySelector("#productCount").textContent = String(state.products.length);
  updatePublicStoreLinks();
  renderLaunchProgress();
  if (location.protocol.startsWith("http")) {
    authenticatedFetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    }).catch(() => showToast("La synchronisation serveur a échoué."));
  }
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.querySelector("#toastRegion").append(toast);
  setTimeout(() => toast.remove(), 2800);
}

function enableDemoMode() {
  if (!DEMO_MODE) return;
  document.body.classList.add("demo-mode");
  const banner = document.createElement("div");
  banner.className = "demo-banner";
  banner.innerHTML = `
    <strong>Démo interactive</strong>
    <span>Données fictives · modifications désactivées</span>
    <a href="${escapeHtml(marketingUrl())}#pricing">Créer mon espace</a>
  `;
  document.body.prepend(banner);
  document.querySelectorAll("#settingsForm input, #settingsForm textarea, #settingsForm select").forEach((field) => {
    field.disabled = true;
  });
}

const demoBlockedClickSelector = [
  '[data-action="new-product"]',
  '[data-action="new-page"]',
  '[data-action="new-email"]',
  '[data-action="new-contact"]',
  '[data-action="new-order"]',
  "[data-edit-product]",
  "[data-toggle-product]",
  "[data-delete-product]",
  "[data-edit-page]",
  "[data-toggle-page]",
  "[data-delete-page]",
  "[data-preview-page]",
  "[data-resend-access]",
  "[data-toggle-email]",
  "[data-edit-email]",
  "[data-delete-email]",
  "[data-delete-contact]",
  "[data-edit-contact]",
  "#contactModal button[type='submit']",
  "#orderModal button[type='submit']",
  "#emailModal button[type='submit']",
  "#copyStoreLink",
  "#topStoreLink",
  "#settingsForm button[type='submit']",
  ".integration-card button",
  ".plan-card button",
].join(",");

function paidOrders() {
  return state.orders.filter((order) => order.status === "paid");
}

function totalRevenue() {
  return paidOrders().reduce((sum, order) => sum + order.amount, 0);
}

function renderIdentity() {
  const displayName = state.profile.firstName || state.profile.creatorName || "Espace Expertly";
  const shortName = state.profile.firstName || state.profile.creatorName?.split(/\s+/)[0] || "Créateur";
  const nameInitials = initials(displayName) || "EX";
  const greeting = document.querySelector("#greetingName");
  if (greeting) greeting.textContent = shortName;
  document.querySelector("#workspaceName").textContent = displayName;
  document.querySelector("#workspaceInitials").textContent = nameInitials;
  document.querySelector("#accountName").textContent = shortName;
  document.querySelector("#accountInitials").textContent = nameInitials;
  updatePublicStoreLinks();
}

function updatePublicStoreLinks() {
  const url = storePublicUrl();
  const path = storePublicPath();
  const topStoreLink = document.querySelector("#topStoreLink");
  const publicStoreUrl = document.querySelector("#publicStoreUrl");
  const previewOpen = document.querySelector("#pagePreviewOpen");
  if (topStoreLink) topStoreLink.href = path;
  if (publicStoreUrl) publicStoreUrl.textContent = url;
  if (previewOpen && previewOpen.getAttribute("href") === "./store.html") previewOpen.href = path;
  const bioUrlEl = document.querySelector("#instagramBioUrl");
  if (bioUrlEl) bioUrlEl.textContent = goPublicUrl();
  if (typeof renderBioQr === "function") renderBioQr(document.querySelector("#bioQr"), goPublicUrl());
}

/* ---------------- Assistant d'onboarding boutique ---------------- */

const wizardSteps = ["identity", "slug", "color", "logo", "product", "recap"];
let wizardStep = 0;
let wizardDraft = null;
let wizardSlugTouched = false;
let wizardSlugState = "idle"; // idle | checking | ok | taken
let wizardSlugTimer = null;

function storeNeedsSetup() {
  const p = state.profile || {};
  return (
    !DEMO_MODE &&
    !(p.creatorName || "").trim() &&
    (!p.slug || p.slug === "boutique") &&
    !(state.products || []).length
  );
}

function openOnboardingWizard() {
  if (DEMO_MODE || document.querySelector("#onboardingWizard")) return;
  wizardStep = 0;
  const existingSlug = state.profile.slug && state.profile.slug !== "boutique" ? state.profile.slug : "";
  wizardSlugTouched = Boolean(existingSlug);
  wizardSlugState = "idle";
  wizardDraft = {
    creatorName: state.profile.creatorName || "",
    creatorRole: state.profile.creatorRole || "",
    bio: state.profile.bio || "",
    slug: existingSlug || generateStoreCode(),
    accent: state.profile.accent || "#6558f5",
    logo: state.profile.logo || "",
    product: { title: "", price: "", description: "", fileName: "" },
  };
  const overlay = document.createElement("div");
  overlay.id = "onboardingWizard";
  overlay.className = "wizard-overlay";
  overlay.innerHTML = `
    <div class="wizard-card" role="dialog" aria-modal="true" aria-labelledby="wizardTitle">
      <div class="wizard-progress" id="wizardProgress"></div>
      <div class="wizard-body" id="wizardBody"></div>
      <div class="wizard-footer">
        <button type="button" class="secondary-button" id="wizardBack">Retour</button>
        <button type="button" class="primary-button" id="wizardNext">Continuer</button>
      </div>
    </div>`;
  document.body.append(overlay);
  document.body.classList.add("wizard-open");
  overlay.querySelector("#wizardBack").addEventListener("click", wizardBack);
  overlay.querySelector("#wizardNext").addEventListener("click", wizardNext);
  renderWizard();
}

function closeOnboardingWizard() {
  document.querySelector("#onboardingWizard")?.remove();
  document.body.classList.remove("wizard-open");
}

function renderWizard() {
  const overlay = document.querySelector("#onboardingWizard");
  if (!overlay) return;
  const step = wizardSteps[wizardStep];
  overlay.querySelector("#wizardProgress").innerHTML = wizardSteps
    .map((_, i) => `<span class="${i === wizardStep ? "active" : i < wizardStep ? "done" : ""}"></span>`)
    .join("");
  overlay.querySelector("#wizardBody").innerHTML = wizardStepHtml(step);
  bindWizardStep(step);
  const back = overlay.querySelector("#wizardBack");
  const next = overlay.querySelector("#wizardNext");
  back.style.visibility = wizardStep === 0 || step === "recap" ? "hidden" : "visible";
  next.textContent = step === "recap" ? "Aller à mon tableau de bord" : "Continuer";
  updateWizardNextState();
}

function wizardStepHtml(step) {
  const d = wizardDraft;
  if (step === "identity") {
    return `
      <span class="wizard-eyebrow">Étape 1 · Identité</span>
      <h2 id="wizardTitle">Crée ta boutique</h2>
      <p class="wizard-lead">Comment veux-tu apparaître auprès de ton audience ?</p>
      <label class="wizard-label">Nom public<input id="wzName" value="${escapeHtml(d.creatorName)}" placeholder="Ex. Claire Mentor" /></label>
      <label class="wizard-label">Ton activité<input id="wzRole" value="${escapeHtml(d.creatorRole)}" placeholder="Ex. Business coach" /></label>`;
  }
  if (step === "slug") {
    return `
      <span class="wizard-eyebrow">Étape 2 · Lien</span>
      <h2 id="wizardTitle">Ton code de boutique</h2>
      <p class="wizard-lead">Un code court de 6 caractères, pour un lien de bio Instagram minimal.</p>
      <label class="wizard-label">Code
        <div class="slug-field"><span>/</span><input id="wzSlug" maxlength="6" value="${escapeHtml(d.slug)}" placeholder="a7k2x9" /></div>
      </label>
      <button type="button" class="link-button" id="wzRegen">↻ Générer un autre code</button>
      <p class="wizard-slug-status" id="wzSlugStatus"></p>
      <div class="wizard-linkpreview">Ton lien de bio : <strong id="wzLinkPreview"></strong></div>`;
  }
  if (step === "color") {
    return `
      <span class="wizard-eyebrow">Étape 3 · Couleur</span>
      <h2 id="wizardTitle">Ta couleur de marque</h2>
      <p class="wizard-lead">Elle colore ta boutique et tes boutons.</p>
      <div class="wizard-color-row">
        <input id="wzAccent" type="color" value="${escapeHtml(d.accent)}" />
        <div class="wizard-color-preview" id="wzColorPreview">
          <span class="wizard-swatch" style="background:${escapeHtml(d.accent)}"></span>
          <button type="button" class="wizard-fake-btn" style="background:${escapeHtml(d.accent)}">Acheter</button>
        </div>
      </div>`;
  }
  if (step === "logo") {
    return `
      <span class="wizard-eyebrow">Étape 4 · Logo (optionnel)</span>
      <h2 id="wizardTitle">Ajoute ton logo</h2>
      <p class="wizard-lead">Une image carrée fonctionne le mieux. Sinon, tes initiales seront utilisées.</p>
      <div class="wizard-logo-row">
        <div class="wizard-logo-preview" id="wzLogoPreview">${logoPreviewHtml(d)}</div>
        <div class="wizard-logo-fields">
          <label class="wizard-label">URL d'image<input id="wzLogoUrl" type="url" value="${escapeHtml(/^https?:/i.test(d.logo) ? d.logo : "")}" placeholder="https://…/logo.png" /></label>
          <label class="wizard-label media-upload">Ou importer un fichier<input id="wzLogoFile" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" /></label>
        </div>
      </div>`;
  }
  if (step === "product") {
    const p = d.product;
    return `
      <span class="wizard-eyebrow">Étape 5 · Premier produit (optionnel)</span>
      <h2 id="wizardTitle">Ajoute une première offre</h2>
      <p class="wizard-lead">Tu pourras en ajouter d'autres plus tard. Laisse vide pour passer.</p>
      <label class="wizard-label">Nom de l'offre<input id="wzPTitle" value="${escapeHtml(p.title)}" placeholder="Ex. Masterclass Offre Signature" /></label>
      <label class="wizard-label">Prix en euros (0 = gratuit)<input id="wzPPrice" type="number" min="0" step="1" value="${escapeHtml(String(p.price))}" placeholder="49" /></label>
      <label class="wizard-label">Description courte<textarea id="wzPDesc" rows="2" placeholder="Le résultat obtenu par ton client.">${escapeHtml(p.description)}</textarea></label>
      <label class="wizard-label">Lien d'accès à livrer<input id="wzPFile" type="url" value="${escapeHtml(p.fileName)}" placeholder="https://…/acces" /></label>`;
  }
  // recap
  const bio = goPublicUrl();
  const store = storePublicUrl();
  return `
    <span class="wizard-eyebrow">C'est prêt 🎉</span>
    <h2 id="wizardTitle">Ta boutique est en ligne</h2>
    <p class="wizard-lead">Copie ce lien dans ta bio Instagram. Il ouvre ta boutique dans le vrai navigateur du téléphone (et non dans Instagram).</p>
    <div class="wizard-bio-block">
      <span class="wizard-bio-label">Lien de bio Instagram</span>
      <div class="url-row">
        <input id="wzBioUrl" readonly value="${escapeHtml(bio)}" />
        <button type="button" class="primary-button" id="wzCopyBio">Copier</button>
      </div>
      <canvas id="wizardQr" width="150" height="150" class="wizard-qr"></canvas>
      <a class="wizard-secondary-link" href="${escapeHtml(storePublicPath())}" target="_blank" rel="noopener">Voir ma boutique : ${escapeHtml(store)}</a>
    </div>`;
}

function logoPreviewHtml(d) {
  const valid = /^https?:\/\//i.test(d.logo) || /^data:image\//i.test(d.logo);
  if (valid) return `<img src="${escapeHtml(d.logo)}" alt="logo" />`;
  return `<span>${escapeHtml(initials(d.creatorName) || "EX")}</span>`;
}

function bindWizardStep(step) {
  const overlay = document.querySelector("#onboardingWizard");
  if (!overlay) return;
  if (step === "identity") {
    const name = overlay.querySelector("#wzName");
    name.addEventListener("input", () => {
      wizardDraft.creatorName = name.value;
      updateWizardNextState();
    });
    overlay.querySelector("#wzRole").addEventListener("input", (e) => {
      wizardDraft.creatorRole = e.target.value;
    });
    name.focus();
  } else if (step === "slug") {
    const slug = overlay.querySelector("#wzSlug");
    const refresh = () => {
      const preview = overlay.querySelector("#wzLinkPreview");
      if (preview) preview.textContent = `${shortLinkHost()}${goPathFor(wizardDraft.slug || "")}`;
    };
    const sanitizeCode = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6);
    refresh();
    runSlugCheck(wizardDraft.slug);
    slug.addEventListener("input", () => {
      wizardSlugTouched = true;
      wizardDraft.slug = sanitizeCode(slug.value);
      if (slug.value !== wizardDraft.slug) slug.value = wizardDraft.slug;
      refresh();
      wizardSlugState = "checking";
      updateWizardNextState();
      clearTimeout(wizardSlugTimer);
      wizardSlugTimer = setTimeout(() => runSlugCheck(wizardDraft.slug), 350);
    });
    overlay.querySelector("#wzRegen")?.addEventListener("click", () => {
      wizardSlugTouched = true;
      wizardDraft.slug = generateStoreCode();
      slug.value = wizardDraft.slug;
      refresh();
      runSlugCheck(wizardDraft.slug);
    });
  } else if (step === "color") {
    overlay.querySelector("#wzAccent").addEventListener("input", (e) => {
      wizardDraft.accent = e.target.value;
      const swatch = overlay.querySelector(".wizard-swatch");
      const btn = overlay.querySelector(".wizard-fake-btn");
      if (swatch) swatch.style.background = e.target.value;
      if (btn) btn.style.background = e.target.value;
    });
  } else if (step === "logo") {
    overlay.querySelector("#wzLogoUrl").addEventListener("input", (e) => {
      wizardDraft.logo = e.target.value.trim();
      overlay.querySelector("#wzLogoPreview").innerHTML = logoPreviewHtml(wizardDraft);
    });
    overlay.querySelector("#wzLogoFile").addEventListener("change", async (e) => {
      try {
        const dataUrl = await fileToDataUrl(e.target.files[0]);
        if (dataUrl) {
          wizardDraft.logo = dataUrl;
          overlay.querySelector("#wzLogoPreview").innerHTML = logoPreviewHtml(wizardDraft);
        }
      } catch (error) {
        showToast(error.message || "Image trop lourde.");
      }
    });
  } else if (step === "product") {
    const p = wizardDraft.product;
    overlay.querySelector("#wzPTitle").addEventListener("input", (e) => { p.title = e.target.value; });
    overlay.querySelector("#wzPPrice").addEventListener("input", (e) => { p.price = e.target.value; });
    overlay.querySelector("#wzPDesc").addEventListener("input", (e) => { p.description = e.target.value; });
    overlay.querySelector("#wzPFile").addEventListener("input", (e) => { p.fileName = e.target.value; });
  } else if (step === "recap") {
    if (typeof renderBioQr === "function") renderBioQr(overlay.querySelector("#wizardQr"), goPublicUrl());
    overlay.querySelector("#wzCopyBio")?.addEventListener("click", () => {
      const url = goPublicUrl();
      navigator.clipboard?.writeText(url)
        .then(() => showToast("Lien de bio copié ✓"))
        .catch(() => showToast(url));
    });
  }
}

function shortLinkHost() {
  const base = (publicConfig.shortLinkBase || "").replace(/\/+$/, "");
  if (base) return base.replace(/^https?:\/\//, "");
  return location.protocol.startsWith("http") ? location.host : "127.0.0.1:4310";
}

function updateWizardNextState() {
  const overlay = document.querySelector("#onboardingWizard");
  if (!overlay) return;
  const step = wizardSteps[wizardStep];
  const next = overlay.querySelector("#wizardNext");
  let disabled = false;
  if (step === "identity") disabled = !wizardDraft.creatorName.trim();
  if (step === "slug") disabled = !wizardDraft.slug || wizardSlugState === "checking" || wizardSlugState === "taken";
  next.disabled = disabled;
  next.classList.toggle("is-disabled", disabled);
}

async function runSlugCheck(slug) {
  const overlay = document.querySelector("#onboardingWizard");
  const statusEl = overlay?.querySelector("#wzSlugStatus");
  slug = slugify(slug || "");
  if (!slug) {
    wizardSlugState = "idle";
    if (statusEl) { statusEl.textContent = "Choisis un identifiant."; statusEl.className = "wizard-slug-status"; }
    updateWizardNextState();
    return;
  }
  wizardSlugState = "checking";
  if (statusEl) { statusEl.textContent = "Vérification…"; statusEl.className = "wizard-slug-status checking"; }
  updateWizardNextState();
  let available = true;
  if (location.protocol.startsWith("http")) {
    try {
      const response = await authenticatedFetch(`/api/slug-available?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({ available: true }));
      available = response.ok ? data.available !== false : true;
    } catch {
      available = true; // hors-ligne : on s'appuie sur la garde 409 au moment de la sauvegarde
    }
  }
  if (slug !== wizardDraft.slug) return; // une frappe plus récente a eu lieu
  wizardSlugState = available ? "ok" : "taken";
  if (statusEl) {
    statusEl.textContent = available ? "✓ Disponible" : "Déjà pris, essaie un autre identifiant.";
    statusEl.className = `wizard-slug-status ${available ? "ok" : "taken"}`;
  }
  updateWizardNextState();
}

function validateWizardStep(step) {
  if (step === "identity" && !wizardDraft.creatorName.trim()) {
    showToast("Renseigne ton nom public.");
    return false;
  }
  if (step === "slug" && (!wizardDraft.slug || wizardSlugState === "taken")) {
    showToast("Choisis un identifiant disponible.");
    return false;
  }
  return true;
}

async function wizardNext() {
  const step = wizardSteps[wizardStep];
  if (step === "recap") { finishWizard(); return; }
  if (!validateWizardStep(step)) return;
  if (step === "product") {
    const next = document.querySelector("#wizardNext");
    if (next) { next.disabled = true; next.textContent = "Création…"; }
    const ok = await commitWizard();
    if (next) next.textContent = "Continuer";
    if (!ok) { updateWizardNextState(); return; }
  }
  wizardStep = Math.min(wizardStep + 1, wizardSteps.length - 1);
  renderWizard();
}

function wizardBack() {
  wizardStep = Math.max(wizardStep - 1, 0);
  renderWizard();
}

async function commitWizard() {
  state.profile = {
    ...state.profile,
    firstName: state.profile.firstName || wizardDraft.creatorName.trim().split(/\s+/)[0],
    creatorName: wizardDraft.creatorName.trim(),
    creatorRole: (wizardDraft.creatorRole || "").trim() || "Infopreneur",
    bio: (wizardDraft.bio || "").trim() || state.profile.bio,
    slug: slugify(wizardDraft.slug || wizardDraft.creatorName),
    accent: wizardDraft.accent || "#6558f5",
    logo: wizardDraft.logo || "",
  };
  const p = wizardDraft.product;
  if (p && p.title.trim()) {
    state.products.push({
      id: `prod_${Date.now().toString(36)}`,
      title: p.title.trim(),
      type: "Produit digital",
      price: Math.max(0, Number(p.price) || 0),
      description: (p.description || "").trim(),
      status: "published",
      color: wizardDraft.accent || "#6558f5",
      fileName: (p.fileName || "").trim(),
    });
  }
  state = normalizeState(state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (location.protocol.startsWith("http")) {
    try {
      const response = await authenticatedFetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      if (response.status === 409) {
        wizardSlugState = "taken";
        showToast("Cet identifiant est déjà pris. Choisis-en un autre.");
        wizardStep = wizardSteps.indexOf("slug");
        renderWizard();
        return false;
      }
      if (response.ok) {
        const saved = await response.json().catch(() => null);
        if (saved?.state) state = normalizeState(saved.state);
      }
    } catch {
      showToast("Synchronisation serveur impossible (sauvegarde locale conservée).");
    }
  }
  document.querySelector("#productCount").textContent = String(state.products.length);
  renderIdentity();
  renderLaunchProgress();
  return true;
}

function finishWizard() {
  localStorage.setItem("expertly_onboarding_done", "1");
  closeOnboardingWizard();
  setView("overview");
  showToast("Bienvenue dans ton espace Expertly 🎉");
}

function launchSteps() {
  const publishedProducts = state.products.filter((product) => product.status === "published");
  const readyProducts = publishedProducts.filter((product) => product.fileName);
  return [
    {
      done: true,
      title: "Compte Expertly activé",
      detail: "Ton espace créateur est prêt.",
      action: "overview",
    },
    {
      done: Boolean(state.profile.creatorName && state.profile.bio && state.profile.slug),
      title: "Identité boutique renseignée",
      detail: "Nom public, promesse et lien boutique.",
      action: "settings",
    },
    {
      done: state.products.length > 0,
      title: "Premier produit créé",
      detail: state.products.length ? `${state.products.length} produit${state.products.length > 1 ? "s" : ""} dans le catalogue.` : "Ajoute ton offre principale.",
      action: "products",
    },
    {
      done: state.pages.some((page) => page.status === "published"),
      title: "Page de vente publiée",
      detail: "Un lien public peut recevoir du trafic.",
      action: "pages",
    },
    {
      done: Boolean(state.products.some((product) => product.offerRole === "lead") && state.products.some((product) => product.offerRole === "core")),
      title: "Tunnel structuré",
      detail: "Lead magnet et offre principale sont identifiés.",
      action: "tunnel",
    },
    {
      done: Boolean(integrationConfig.stripe && integrationConfig.email && readyProducts.length),
      title: "Paiement et livraison prêts",
      detail: integrationConfig.stripe && integrationConfig.email ? "Stripe, email et accès produit sont configurés." : "Connecte Stripe, Resend et un lien d'accès produit.",
      action: "settings",
    },
    {
      done: state.analytics.checkouts > 0 || state.orders.length > 0,
      title: "Checkout testé",
      detail: "Ouvre une page publique puis lance un paiement test.",
      action: "pages",
    },
  ];
}

function renderLaunchProgress() {
  const steps = launchSteps();
  const done = steps.filter((step) => step.done).length;
  const label = document.querySelector("#launchProgressLabel");
  const bar = document.querySelector("#launchProgressBar");
  const checklist = document.querySelector("#launchChecklist");
  if (label) label.textContent = `${done} étape${done > 1 ? "s" : ""} sur ${steps.length}`;
  if (bar) bar.style.width = `${Math.round((done / steps.length) * 100)}%`;
  if (checklist) {
    checklist.innerHTML = steps
      .map((step) => `
        <label class="${step.done ? "done" : ""}">
          <input type="checkbox" ${step.done ? "checked" : ""} disabled />
          <span><strong>${escapeHtml(step.title)}</strong><small>${escapeHtml(step.detail)}</small></span>
          <button type="button" data-view-target="${step.action}">${step.done ? "Voir" : "Faire"}</button>
        </label>
      `)
      .join("");
  }
}

function metricCard(label, value, icon, trend, detail, down = false) {
  return `
    <article class="metric-card">
      <div class="metric-card-head">
        <span>${escapeHtml(label)}</span>
        <span class="metric-icon">${icon}</span>
      </div>
      <strong>${escapeHtml(value)}</strong>
      <small><span class="trend ${down ? "down" : ""}">${escapeHtml(trend)}</span>${escapeHtml(detail)}</small>
    </article>
  `;
}

function setView(view) {
  if (!viewNames[view]) return;
  activeView = view;
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("active", section.id === `${view}View`);
  });
  document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  document.querySelector("#viewTitle").textContent = viewNames[view];
  document.querySelector("#sidebar").classList.remove("open");
  history.replaceState(null, "", `#${view}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
  renderView(view);
  trackEvent("creator_dashboard_section_viewed", {
    section: view,
    product_count: state.products.length,
    page_count: state.pages.length,
  });
}

function renderOverview() {
  const revenue = totalRevenue();
  const conversion = state.analytics.visits
    ? ((state.analytics.purchases / state.analytics.visits) * 100).toFixed(1).replace(".", ",")
    : "0,0";
  const average = paidOrders().length ? Math.round(revenue / paidOrders().length) : 0;

  document.querySelector("#overviewMetrics").innerHTML = [
    metricCard("Chiffre d'affaires", euro.format(revenue), "€", "Réel", " paiements enregistrés"),
    metricCard("Commandes", String(paidOrders().length), "↗", "Réel", " commandes confirmées"),
    metricCard("Taux de conversion", `${conversion} %`, "⌁", "Réel", ` sur ${state.analytics.visits} visite${state.analytics.visits > 1 ? "s" : ""}`),
    metricCard("Panier moyen", euro.format(average), "◇", "Réel", " moyenne des commandes"),
  ].join("");

  document.querySelector("#revenueHeading").textContent = euro.format(
    state.analytics.revenueSeries.reduce((sum, value) => sum + value, 0),
  );
  renderRevenueChart();

  document.querySelector("#performanceList").innerHTML = state.products
    .filter((product) => product.status === "published")
    .slice(0, 4)
    .map((product) => {
      const rate = product.views ? ((product.sales / product.views) * 100).toFixed(1) : "0";
      return `
        <div class="performance-row">
          <div class="performance-product">
            <span class="product-symbol" style="background:${product.color}">${initials(product.title)}</span>
            <span><strong>${escapeHtml(product.title)}</strong><small>${product.sales} ventes · ${euro.format(product.price)}</small></span>
          </div>
          <div class="progress-track"><span style="width:${Math.min(Number(rate) * 10, 100)}%"></span></div>
          <strong class="performance-rate">${rate} %</strong>
        </div>
      `;
    })
    .join("") || '<div class="empty-state">Publie un produit pour suivre ses performances.</div>';

  document.querySelector("#recentOrderList").innerHTML = state.orders
    .slice(0, 4)
    .map((order) => {
      const contact = state.contacts.find((item) => item.id === order.contactId);
      const product = state.products.find((item) => item.id === order.productId);
      return `
        <div class="recent-order-row">
          <div class="order-client">
            <span class="person-avatar">${initials(contact?.name || "Client")}</span>
            <span><strong>${escapeHtml(contact?.name || "Client")}</strong><small>${escapeHtml(product?.title || "Produit")} · ${escapeHtml(order.date)}</small></span>
          </div>
          <strong class="order-value">${order.status === "paid" ? "+" : "−"}${euro.format(order.amount)}</strong>
        </div>
      `;
    })
    .join("") || '<div class="empty-state">Les prochaines commandes apparaîtront ici en temps réel.</div>';
}

function renderRevenueChart() {
  const svg = document.querySelector("#revenueChart");
  const values = state.analytics.revenueSeries;
  const max = Math.max(...values, 1) * 1.12;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 760;
    const y = 225 - (value / max) * 200;
    return [x, y];
  });
  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  const grid = [40, 100, 160, 220]
    .map((y) => `<line x1="0" y1="${y}" x2="760" y2="${y}" stroke="#eeeeF4" stroke-width="1"/>`)
    .join("");
  svg.innerHTML = `
    <defs>
      <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#6558f5" stop-opacity=".18"/>
        <stop offset="100%" stop-color="#6558f5" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${grid}
    <polygon points="0,235 ${line} 760,235" fill="url(#revenueFill)"></polygon>
    <polyline points="${line}" fill="none" stroke="#6558f5" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"></polyline>
    ${points.map(([x, y], index) => index % 2 === 0 ? `<circle cx="${x}" cy="${y}" r="3.5" fill="#fff" stroke="#6558f5" stroke-width="2.5"></circle>` : "").join("")}
  `;
}

function renderProducts() {
  const query = document.querySelector("#productSearch")?.value.toLowerCase().trim() || "";
  const filter = document.querySelector("#productFilter")?.value || "all";
  const products = state.products.filter((product) => {
    const text = `${product.title} ${product.type} ${product.description}`.toLowerCase();
    return text.includes(query) && (filter === "all" || product.status === filter);
  });

  document.querySelector("#productGrid").innerHTML =
    products
      .map((product) => {
        const rate = product.views ? ((product.sales / product.views) * 100).toFixed(1).replace(".", ",") : "0";
        const issues = productReadiness(product);
        return `
          <article class="product-card" style="--product-color:${product.color}">
            <div class="product-card-visual"${product.coverUrl ? ` style="background-image:linear-gradient(140deg, color-mix(in srgb, ${product.color} 80%, #111827), rgba(12,18,45,.24)), url('${escapeHtml(product.coverUrl)}')"` : ""}>
              <span class="product-symbol">${initials(product.title)}</span>
              <span class="status-badge ${product.status === "draft" ? "draft" : ""}">
                ${product.status === "published" ? "Publié" : "Brouillon"}
              </span>
            </div>
            <div class="product-card-body">
              <span>${escapeHtml(product.type)} · ${escapeHtml(offerRoleLabels[product.offerRole] || "Offre principale")}</span>
              <h3>${escapeHtml(product.title)}</h3>
              <p>${escapeHtml(product.description)}</p>
              <div class="product-stats">
                <div><span>Prix</span><strong>${product.price ? euro.format(product.price) : "Gratuit"}${product.compareAtPrice ? `<small class="strike-price">${euro.format(product.compareAtPrice)}</small>` : ""}</strong></div>
                <div><span>Ventes</span><strong>${product.sales}</strong></div>
                <div><span>Conversion</span><strong>${rate} %</strong></div>
              </div>
              <div class="offer-links">
                <span>Bump: ${escapeHtml(state.products.find((item) => item.id === product.bumpProductId)?.title || "Aucun")}</span>
                <span>Upsell: ${escapeHtml(state.products.find((item) => item.id === product.upsellProductId)?.title || "Aucun")}</span>
              </div>
              <div class="readiness-row ${issues.length ? "warning" : "ready"}">
                <strong>${issues.length ? "À compléter" : "Prêt à vendre"}</strong>
                <span>${issues.length ? escapeHtml(issues.join(" · ")) : escapeHtml(accessTypeLabels[product.accessType] || "Lien privé")}</span>
              </div>
              <div class="product-actions">
                <button data-edit-product="${product.id}">Modifier</button>
                <button data-toggle-product="${product.id}" title="${product.status === "published" ? "Dépublier" : "Publier"}">${product.status === "published" ? "◉" : "○"}</button>
                <button data-delete-product="${product.id}" title="Supprimer">×</button>
              </div>
            </div>
          </article>
        `;
      })
      .join("") || `<div class="empty-state">Aucun produit. Clique sur « Nouveau produit » pour ajouter ta première offre digitale.</div>`;
}

function renderPages() {
  document.querySelector("#salesPageList").innerHTML =
    state.pages
      .map((page) => {
        const product = state.products.find((item) => item.id === page.productId);
        const completion = pageCompletion(page);
        return `
          <article class="sales-page-card">
            <div class="sales-page-card-head">
              <div>
                <span class="panel-label">${escapeHtml(product?.type || "Page")}</span>
                <h3>${escapeHtml(page.name)}</h3>
                <p>${escapeHtml(page.headline)}</p>
              </div>
              <span class="status-badge ${page.status === "draft" ? "draft" : ""}">${page.status === "published" ? "Publiée" : "Brouillon"}</span>
            </div>
            <div class="page-metrics">
              <div><span>Visites</span><strong>${page.visits.toLocaleString("fr-FR")}</strong></div>
              <div><span>Conversion</span><strong>${String(page.conversion).replace(".", ",")} %</strong></div>
              <div><span>Complétion</span><strong>${completion} %</strong></div>
            </div>
            <div class="block-pills">
              ${Object.entries(page.blocks || {}).filter(([, enabled]) => enabled).slice(0, 5).map(([key]) => `<span>${escapeHtml({
                benefits: "Bénéfices",
                program: "Programme",
                testimonials: "Témoignage",
                faq: "FAQ",
                guarantee: "Garantie",
                leadMagnet: "Lead magnet",
              }[key] || key)}</span>`).join("")}
            </div>
            <div class="page-card-actions">
              <button data-toggle-page="${page.id}">${page.status === "published" ? "Dépublier" : "Publier"}</button>
              <button data-edit-page="${page.id}">Personnaliser</button>
              <button data-copy-page="${page.id}">Copier le lien</button>
              <button data-preview-page="${page.id}">Aperçu ↗</button>
              <button data-delete-page="${page.id}" style="color:#e85a6a">Supprimer</button>
            </div>
            <div class="page-public-link">${escapeHtml(pagePublicUrl(page))}</div>
          </article>
        `;
      })
      .join("") || `<div class="empty-state">Crée ta première page de vente pour commencer.</div>`;

  const selectedPage = state.pages.find((page) => page.status === "published") || state.pages[0];
  const frame = document.querySelector("#storePreview");
  const previewUrl = document.querySelector("#pagePreviewUrl");
  const previewOpen = document.querySelector("#pagePreviewOpen");
  if (selectedPage) {
    const publicUrl = pagePublicUrl(selectedPage);
    if (frame) frame.src = `${pagePublicPath(selectedPage)}?embed=1&t=${Date.now()}`;
    if (previewUrl) previewUrl.textContent = publicUrl;
    if (previewOpen) previewOpen.href = pagePublicPath(selectedPage);
  } else {
    if (frame) frame.src = storePreviewPath();
    if (previewUrl) previewUrl.textContent = storePublicUrl();
    if (previewOpen) previewOpen.href = storePublicPath();
  }
}

function pageCompletion(page) {
  const blocks = page.blocks || {};
  const required = [
    Boolean(page.headline),
    Boolean(page.subheadline),
    Boolean(page.proof),
    Boolean(page.disclosure),
    Boolean(blocks.program ? page.program : true),
    Boolean(blocks.faq ? page.faq : true),
  ];
  return Math.round((required.filter(Boolean).length / required.length) * 100);
}

function renderTunnel() {
  const lead = state.products.find((product) => product.offerRole === "lead");
  const tripwire = state.products.find((product) => product.offerRole === "tripwire");
  const core = state.products.find((product) => product.offerRole === "core");
  const upsell = state.products.find((product) => product.offerRole === "upsell");
  const publishedPage = state.pages.find((page) => page.status === "published");
  const stages = [
    { title: "Bio / trafic", detail: `${state.analytics.visits} visite${state.analytics.visits > 1 ? "s" : ""}`, done: state.analytics.visits > 0, action: "analytics" },
    { title: "Lead magnet", detail: lead ? lead.title : "À créer", done: Boolean(lead), action: "products" },
    { title: "Page de vente", detail: publishedPage ? publishedPage.name : "Aucune page publiée", done: Boolean(publishedPage), action: "pages" },
    { title: "Checkout", detail: integrationConfig.stripe ? "Stripe prêt" : "Stripe à connecter", done: Boolean(integrationConfig.stripe), action: "settings" },
    { title: "Order bump", detail: state.products.some((product) => product.bumpProductId) ? "Configuré" : "À associer", done: state.products.some((product) => product.bumpProductId), action: "products" },
    { title: "Upsell", detail: upsell || state.products.some((product) => product.upsellProductId) ? "Offre suivante prête" : "À créer", done: Boolean(upsell || state.products.some((product) => product.upsellProductId)), action: "products" },
    { title: "Livraison", detail: integrationConfig.email ? "Email automatique" : "Email à connecter", done: Boolean(integrationConfig.email), action: "emails" },
  ];
  document.querySelector("#tunnelBoard").innerHTML = stages
    .map((stage, index) => `
      <button class="tunnel-step ${stage.done ? "done" : ""}" data-view-target="${stage.action}">
        <span>${index + 1}</span>
        <strong>${escapeHtml(stage.title)}</strong>
        <small>${escapeHtml(stage.detail)}</small>
      </button>
    `)
    .join("");

  const roles = [
    ["Lead magnet", lead],
    ["Produit d'appel", tripwire],
    ["Offre principale", core],
    ["Upsell", upsell],
  ];
  document.querySelector("#offerMap").innerHTML = roles
    .map(([label, product]) => `
      <div class="offer-map-row">
        <span>${escapeHtml(label)}</span>
        <strong>${product ? escapeHtml(product.title) : "À définir"}</strong>
        <small>${product ? `${product.price ? euro.format(product.price) : "Gratuit"} · ${escapeHtml(accessTypeLabels[product.accessType] || "Lien privé")}` : "Crée ou assigne un produit"}</small>
      </div>
    `)
    .join("");

  const upsellInsights = [];
  if (!core) upsellInsights.push(["Créer une offre principale", "Le tunnel a besoin d'une offre cœur pour convertir l'audience.", "products"]);
  if (!lead) upsellInsights.push(["Ajouter un lead magnet", "La vitrine vend la capture email : ajoute une ressource gratuite.", "products"]);
  if (!state.products.some((product) => product.bumpProductId)) upsellInsights.push(["Associer un order bump", "Ajoute une petite offre complémentaire au checkout.", "products"]);
  if (!upsell && !state.products.some((product) => product.upsellProductId)) upsellInsights.push(["Créer un upsell", "Propose l'étape suivante après achat pour augmenter le panier moyen.", "products"]);
  if (!upsellInsights.length) upsellInsights.push(["Tunnel prêt", "Tu peux maintenant concentrer l'effort sur le trafic et les relances email.", "analytics"]);
  document.querySelector("#upsellInsights").innerHTML = upsellInsights
    .map(([title, detail, target]) => `
      <button class="insight-item" data-view-target="${target}">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(detail)}</span>
      </button>
    `)
    .join("");
}

function renderOrders() {
  const query = document.querySelector("#orderSearch")?.value.toLowerCase().trim() || "";
  const filter = document.querySelector("#orderFilter")?.value || "all";
  const visibleOrders = state.orders.filter((order) => {
    const contact = state.contacts.find((item) => item.id === order.contactId);
    const product = state.products.find((item) => item.id === order.productId);
    const text = `${order.id} ${contact?.name || ""} ${contact?.email || ""} ${product?.title || ""}`.toLowerCase();
    return text.includes(query) && (filter === "all" || order.status === filter);
  });
  const refunded = state.orders.filter((order) => order.status === "refunded");

  document.querySelector("#orderMetrics").innerHTML = [
    metricCard("Revenus encaissés", euro.format(totalRevenue()), "€", "Réel", " paiements confirmés"),
    metricCard("Paiements réussis", String(paidOrders().length), "✓", "Réel", " commandes enregistrées"),
    metricCard("Remboursements", euro.format(refunded.reduce((sum, order) => sum + order.amount, 0)), "↩", "Réel", ` · ${refunded.length} remboursement${refunded.length > 1 ? "s" : ""}`),
  ].join("");

  document.querySelector("#orderTable").innerHTML = visibleOrders
    .map((order) => {
      const contact = state.contacts.find((item) => item.id === order.contactId);
      const product = state.products.find((item) => item.id === order.productId);
      return `
        <tr>
          <td><strong>${escapeHtml(order.id)}</strong></td>
          <td><div class="contact-cell"><span class="person-avatar">${initials(contact?.name || "Client")}</span><span><strong>${escapeHtml(contact?.name || "Client")}</strong><small>${escapeHtml(contact?.email || "")}</small></span></div></td>
          <td>${escapeHtml(product?.title || "Produit supprimé")}</td>
          <td>${escapeHtml(order.date)}</td>
          <td><strong>${euro.format(order.amount)}</strong></td>
          <td><span class="segment-badge ${emailStatusClass(order.emailStatus)}">${escapeHtml(emailStatusLabel(order.emailStatus))}</span></td>
          <td><span class="status-badge ${order.status === "refunded" ? "draft" : ""}">${order.status === "paid" ? "Payé" : "Remboursé"}</span></td>
          <td><button class="table-action" data-view-order="${order.id}">Ouvrir</button></td>
        </tr>
      `;
    })
    .join("");
}

function renderContacts() {
  const query = document.querySelector("#contactSearch")?.value.toLowerCase().trim() || "";
  const filter = document.querySelector("#contactFilter")?.value || "all";
  const visibleContacts = state.contacts.filter((contact) => {
    const text = `${contact.name} ${contact.email}`.toLowerCase();
    return text.includes(query) && (filter === "all" || contact.segment === filter);
  });
  const clients = state.contacts.filter((contact) => contact.segment === "Client");
  const hot = state.contacts.filter((contact) => contact.segment === "Prospect chaud");

  document.querySelector("#contactMetrics").innerHTML = [
    metricCard("Contacts", state.contacts.length.toLocaleString("fr-FR"), "◎", "Réel", " profils enregistrés"),
    metricCard("Clients", String(clients.length), "✓", "Réel", " acheteurs uniques"),
    metricCard("Prospects chauds", String(hot.length), "↗", "Réel", " contacts à relancer"),
  ].join("");

  document.querySelector("#contactTable").innerHTML = visibleContacts
    .map((contact) => {
      const badgeClass = contact.segment === "Client" ? "client" : contact.segment === "Prospect chaud" ? "hot" : "";
      return `
        <tr>
          <td><div class="contact-cell"><span class="person-avatar">${initials(contact.name)}</span><span><strong>${escapeHtml(contact.name)}</strong><small>${escapeHtml(contact.email)}</small></span></div></td>
          <td><span class="segment-badge ${badgeClass}">${escapeHtml(contact.segment)}</span></td>
          <td>${escapeHtml(contact.activity)}</td>
          <td>${escapeHtml(contact.nextAction || "À qualifier")}</td>
          <td><strong>${euro.format(contact.value)}</strong></td>
          <td>${escapeHtml(contact.joined)}</td>
          <td><button class="table-action" data-view-contact="${contact.id}">Ouvrir</button></td>
        </tr>
      `;
    })
    .join("");
}

function openEmailModal(email = null) {
  const modal = document.querySelector("#emailModal");
  const form = document.querySelector("#emailForm");
  form.reset();
  form.elements.id.value = email?.id || "";
  form.elements.name.value = email?.name || "";
  form.elements.description.value = email?.description || "";
  form.elements.trigger.value = email?.trigger || "Achat confirmé";
  form.elements.active.checked = email ? email.active : true;
  document.querySelector("#emailModalTitle").textContent = email ? "Modifier l'automation" : "Nouvelle automation";
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  setTimeout(() => form.elements.name.focus(), 50);
}

function closeEmailModal() {
  const modal = document.querySelector("#emailModal");
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function submitEmail(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const id = data.get("id");
  const existing = state.emails.find((e) => e.id === id);
  const email = {
    id: id || `em_${Date.now()}`,
    name: data.get("name").trim(),
    description: data.get("description").trim(),
    trigger: data.get("trigger"),
    active: data.has("active"),
    sent: existing?.sent || 0,
    openRate: existing?.openRate || 0,
  };
  if (existing) {
    Object.assign(existing, email);
  } else {
    state.emails.push(email);
  }
  saveState();
  closeEmailModal();
  renderEmails();
  showToast(existing ? "Automation mise à jour." : "Automation créée.");
}

function openOrderModal() {
  const modal = document.querySelector("#orderModal");
  const form = document.querySelector("#orderForm");
  form.reset();
  const published = state.products.filter((p) => p.status === "published");
  document.querySelector("#orderProductSelect").innerHTML = published.length
    ? published.map((p) => `<option value="${p.id}" data-price="${p.price}">${escapeHtml(p.title)} — ${euro.format(p.price)}</option>`).join("")
    : state.products.map((p) => `<option value="${p.id}" data-price="${p.price}">${escapeHtml(p.title)} — ${euro.format(p.price)}</option>`).join("");
  const firstProduct = published[0] || state.products[0];
  if (firstProduct) form.elements.amount.value = firstProduct.price;
  form.elements.date.value = new Date().toISOString().split("T")[0];
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  setTimeout(() => form.elements.clientName.focus(), 50);
}

function closeOrderModal() {
  const modal = document.querySelector("#orderModal");
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function submitOrder(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const clientName = data.get("clientName").trim();
  const clientEmail = data.get("clientEmail").trim().toLowerCase();
  const productId = data.get("productId");
  const amount = Number(data.get("amount"));
  const dateRaw = data.get("date");
  const status = data.get("status");
  const dateFormatted = new Date(dateRaw).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  let contact = state.contacts.find((c) => c.email.toLowerCase() === clientEmail);
  if (!contact) {
    contact = {
      id: `c_${Date.now()}`,
      name: clientName,
      email: clientEmail,
      segment: status === "paid" ? "Client" : "Lead",
      activity: status === "paid" ? "Achat enregistré manuellement" : "Commande remboursée",
      value: status === "paid" ? amount : 0,
      joined: dateFormatted,
      tags: [],
      buyingScore: status === "paid" ? 80 : 0,
    };
    state.contacts.unshift(contact);
  } else if (status === "paid") {
    contact.segment = "Client";
    contact.value = (contact.value || 0) + amount;
    contact.activity = "Achat enregistré manuellement";
  }

  const order = {
    id: `ORD-${Date.now()}`,
    contactId: contact.id,
    productId,
    amount,
    date: dateFormatted,
    status,
    emailStatus: "not_configured",
    source: "manual",
  };
  state.orders.unshift(order);

  if (status === "paid") {
    state.analytics.purchases = (state.analytics.purchases || 0) + 1;
    if (Array.isArray(state.analytics.revenueSeries) && state.analytics.revenueSeries.length > 0) {
      state.analytics.revenueSeries[state.analytics.revenueSeries.length - 1] += amount;
    }
    const product = state.products.find((p) => p.id === productId);
    if (product) product.sales = (product.sales || 0) + 1;
  }

  saveState();
  closeOrderModal();
  renderOrders();
  showToast(status === "paid" ? "Vente enregistrée." : "Commande enregistrée.");
}

function openContactModal(contact = null) {
  const modal = document.querySelector("#contactModal");
  const form = document.querySelector("#contactForm");
  form.reset();
  form.elements.id.value = contact?.id || "";
  form.elements.name.value = contact?.name || "";
  form.elements.email.value = contact?.email || "";
  form.elements.segment.value = contact?.segment || "Lead";
  form.elements.source.value = contact?.source || "";
  form.elements.nextAction.value = contact?.nextAction || "";
  form.elements.notes.value = contact?.notes || "";
  document.querySelector("#contactModalTitle").textContent = contact ? "Modifier le contact" : "Ajouter un contact";
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  setTimeout(() => form.elements.name.focus(), 50);
}

function closeContactModal() {
  const modal = document.querySelector("#contactModal");
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function submitContact(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const id = data.get("id");
  const existing = state.contacts.find((c) => c.id === id);
  const emailVal = data.get("email").trim().toLowerCase();
  if (!existing) {
    const duplicate = state.contacts.find((c) => c.email.toLowerCase() === emailVal);
    if (duplicate) { showToast("Un contact avec cet email existe déjà."); return; }
  }
  const contact = {
    id: id || `c_${Date.now()}`,
    name: data.get("name").trim(),
    email: emailVal,
    segment: data.get("segment"),
    source: data.get("source").trim(),
    nextAction: data.get("nextAction").trim(),
    notes: data.get("notes").trim(),
    activity: existing?.activity || "Contact créé manuellement",
    value: existing?.value || 0,
    joined: existing?.joined || new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
    tags: existing?.tags || [],
    buyingScore: existing?.buyingScore || 0,
  };
  if (existing) {
    Object.assign(existing, contact);
  } else {
    state.contacts.unshift(contact);
  }
  saveState();
  closeContactModal();
  renderContacts();
  showToast(existing ? "Contact mis à jour." : "Contact ajouté.");
}

function openDetailPanel(type, title, content) {
  document.querySelector("#detailEyebrow").textContent = type;
  document.querySelector("#detailTitle").textContent = title;
  document.querySelector("#detailContent").innerHTML = content;
  document.querySelector("#detailPanel").classList.add("open");
  document.querySelector("#detailPanel").setAttribute("aria-hidden", "false");
}

function closeDetailPanel() {
  document.querySelector("#detailPanel").classList.remove("open");
  document.querySelector("#detailPanel").setAttribute("aria-hidden", "true");
}

function contactTimeline(contact) {
  const orders = state.orders.filter((order) => order.contactId === contact.id);
  const items = [
    { label: contact.activity || "Contact créé", detail: contact.joined || "Date inconnue" },
    ...orders.map((order) => {
      const product = state.products.find((item) => item.id === order.productId);
      return {
        label: order.status === "paid" ? "Achat confirmé" : "Commande remboursée",
        detail: `${product?.title || "Produit"} · ${euro.format(order.amount)} · ${order.date}`,
      };
    }),
  ];
  return items
    .map((item) => `<li><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.detail)}</span></li>`)
    .join("");
}

function openContactDetail(contactId) {
  const contact = state.contacts.find((item) => item.id === contactId);
  if (!contact) return;
  const orders = state.orders.filter((order) => order.contactId === contact.id);
  openDetailPanel(
    "Contact CRM",
    contact.name,
    `
      <div class="detail-summary">
        <span class="person-avatar large">${initials(contact.name)}</span>
        <div><strong>${escapeHtml(contact.email)}</strong><small>${orders.length} commande${orders.length > 1 ? "s" : ""} · ${euro.format(contact.value)} · score ${contact.buyingScore || 0}/100</small></div>
      </div>
      <form class="detail-form" id="contactDetailForm" data-contact-id="${contact.id}">
        <label>Segment
          <select name="segment">
            ${["Lead", "Prospect chaud", "Client"].map((segment) => `<option ${contact.segment === segment ? "selected" : ""}>${segment}</option>`).join("")}
          </select>
        </label>
        <label>Source d'acquisition<input name="source" value="${escapeHtml(contact.source || "")}" placeholder="Instagram, YouTube, Email..." /></label>
        <label>Score d'achat<input name="buyingScore" type="number" min="0" max="100" value="${Number(contact.buyingScore || 0)}" /></label>
        <label>Tags d'intérêt<input name="tags" value="${escapeHtml(Array.isArray(contact.tags) ? contact.tags.join(", ") : contact.tags || "")}" placeholder="coaching, formation, masterclass" /></label>
        <label>Dernier produit consulté
          <select name="lastProductId">
            <option value="">Non renseigné</option>
            ${state.products.map((product) => `<option value="${product.id}" ${contact.lastProductId === product.id ? "selected" : ""}>${escapeHtml(product.title)}</option>`).join("")}
          </select>
        </label>
        <label>Prochaine action<input name="nextAction" value="${escapeHtml(contact.nextAction || "")}" placeholder="Ex. Relancer mardi avec l'offre Scale" /></label>
        <label>Notes internes<textarea name="notes" rows="4" placeholder="Contexte, objections, besoin principal...">${escapeHtml(contact.notes || "")}</textarea></label>
        <div style="display:flex;gap:.5rem;">
          <button class="primary-button" type="submit" style="flex:1">Enregistrer la fiche</button>
          <button class="secondary-button" type="button" data-edit-contact="${contact.id}">Modifier</button>
          <button class="secondary-button" type="button" data-delete-contact="${contact.id}" style="color:#e85a6a">Supprimer</button>
        </div>
      </form>
      <div class="detail-section">
        <span class="panel-label">Timeline</span>
        <ul class="timeline-list">${contactTimeline(contact)}</ul>
      </div>
    `,
  );
}

function openOrderDetail(orderId) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return;
  const contact = state.contacts.find((item) => item.id === order.contactId);
  const product = state.products.find((item) => item.id === order.productId);
  const accessUrl = orderAccessUrl(order);
  openDetailPanel(
    "Commande",
    order.id,
    `
      <div class="detail-summary">
        <span class="product-symbol small">${initials(product?.title || "Produit")}</span>
        <div><strong>${escapeHtml(product?.title || "Produit supprimé")}</strong><small>${escapeHtml(order.date)} · ${euro.format(order.amount)}</small></div>
      </div>
      <div class="detail-metrics">
        <div><span>Client</span><strong>${escapeHtml(contact?.name || "Client")}</strong></div>
        <div><span>Paiement</span><strong>${order.status === "paid" ? "Payé" : "Remboursé"}</strong></div>
        <div><span>Livraison</span><strong>${escapeHtml(emailStatusLabel(order.emailStatus))}</strong></div>
      </div>
      <div class="detail-section">
        <span class="panel-label">Accès client</span>
        <p>${accessUrl ? escapeHtml(accessUrl) : "Aucun lien d'accès généré pour cette commande."}</p>
        <div class="detail-actions">
          <button class="secondary-button" type="button" data-copy-access="${order.id}" ${accessUrl ? "" : "disabled"}>Copier le lien</button>
          <button class="primary-button" type="button" data-resend-access="${order.id}" ${order.status === "paid" ? "" : "disabled"}>Renvoyer l'accès</button>
        </div>
        ${order.emailError ? `<p class="detail-error">${escapeHtml(order.emailError)}</p>` : ""}
      </div>
    `,
  );
}

async function resendOrderAccess(orderId) {
  const button = document.querySelector(`[data-resend-access="${CSS.escape(orderId)}"]`);
  if (button) button.textContent = "Envoi...";
  try {
    const response = await authenticatedFetch("/api/orders/resend-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Impossible de renvoyer l'accès.");
    const order = state.orders.find((item) => item.id === orderId);
    if (order && result.order) Object.assign(order, result.order);
    saveState();
    renderOrders();
    openOrderDetail(orderId);
    showToast(result.order?.emailStatus === "sent" ? "Accès renvoyé au client." : "Accès prêt, mais Resend n'est pas configuré.");
  } catch (error) {
    showToast(error.message);
  } finally {
    if (button) button.textContent = "Renvoyer l'accès";
  }
}

function renderAnalytics() {
  const globalConversion = state.analytics.visits
    ? ((state.analytics.purchases / state.analytics.visits) * 100).toFixed(1).replace(".", ",")
    : "0,0";
  const leadRate = state.analytics.visits
    ? ((state.analytics.leads / state.analytics.visits) * 100).toFixed(1).replace(".", ",")
    : "0,0";

  document.querySelector("#analyticsMetrics").innerHTML = [
    metricCard("Visites", state.analytics.visits.toLocaleString("fr-FR"), "⌁", "Réel", " sessions enregistrées"),
    metricCard("Leads capturés", String(state.analytics.leads), "◎", "Réel", ` soit ${leadRate} % des visites`),
    metricCard("Achats", String(state.analytics.purchases), "↗", "Réel", " paiements finalisés"),
    metricCard("Conversion globale", `${globalConversion} %`, "◇", "Réel", " visite vers achat"),
  ].join("");

  const maxStep = Math.max(state.analytics.visits, 1);
  const steps = [
    ["Visites", state.analytics.visits],
    ["Leads", state.analytics.leads],
    ["Checkouts", state.analytics.checkouts],
    ["Achats", state.analytics.purchases],
  ].map(([name, value]) => [name, value, value ? Math.max((value / maxStep) * 100, 4) : 0]);
  document.querySelector("#funnel").innerHTML = steps
    .map(([name, value, width]) => `
      <div class="funnel-row"><span>${name}</span><div class="funnel-bar"><i style="width:${width}%"></i></div><strong>${value.toLocaleString("fr-FR")}</strong></div>
    `)
    .join("");

  document.querySelector("#sourceList").innerHTML = state.analytics.sources
    .map((source) => `
      <div class="source-row"><strong>${escapeHtml(source.name)}</strong><div class="progress-track"><span style="width:${source.value}%"></span></div><span>${source.value} %</span></div>
    `)
    .join("");

  const insights = [];
  if (!state.products.length) insights.push(["Créer l'offre principale", "Le CRM ne peut pas générer de ventes tant que le catalogue est vide.", "products"]);
  if (state.products.length && !state.pages.some((page) => page.status === "published")) insights.push(["Publier une page", "Tes produits existent, mais aucun lien public ne convertit encore.", "pages"]);
  if (state.analytics.checkouts > state.analytics.purchases * 2 && state.analytics.checkouts > 3) insights.push(["Relancer les checkouts", "Beaucoup de visiteurs ouvrent le paiement sans acheter.", "emails"]);
  if (!integrationConfig.email) insights.push(["Connecter les emails", "La livraison post-achat doit être automatisée avant le trafic payant.", "settings"]);
  if (!insights.length) insights.push(["Optimiser l'offre la plus vendue", "Ajoute preuve sociale, FAQ et upsell sur ta meilleure page.", "pages"]);
  document.querySelector("#analyticsInsights").innerHTML = insights
    .map(([title, detail, target]) => `
      <button class="insight-item" data-view-target="${target}">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(detail)}</span>
      </button>
    `)
    .join("");

  const revenueByProduct = state.products.map((product) => {
    const revenue = state.orders
      .filter((order) => order.productId === product.id && order.status === "paid")
      .reduce((sum, order) => sum + order.amount, 0);
    return { product, revenue };
  }).sort((a, b) => b.revenue - a.revenue);
  const maxRevenue = Math.max(...revenueByProduct.map((item) => item.revenue), 1);
  document.querySelector("#productRevenueList").innerHTML = revenueByProduct.length
    ? revenueByProduct.map(({ product, revenue }) => `
        <div class="source-row"><strong>${escapeHtml(product.title)}</strong><div class="progress-track"><span style="width:${Math.max((revenue / maxRevenue) * 100, revenue ? 8 : 0)}%"></span></div><span>${euro.format(revenue)}</span></div>
      `).join("")
    : '<div class="empty-state">Les revenus par produit apparaîtront après les premières commandes.</div>';
}

function renderEmails() {
  const sentOrders = state.orders.filter((order) => order.emailStatus === "sent").length;
  const failedOrders = state.orders.filter((order) => order.emailStatus === "failed").length;
  const statusPanel = document.querySelector("#emailStatusPanel");
  if (statusPanel) {
    statusPanel.innerHTML = `
      <article class="panel email-config-card ${integrationConfig.email ? "ready" : "warning"}">
        <div>
          <span class="panel-label">Configuration</span>
          <h2>${integrationConfig.email ? "Resend est connecté" : "Resend n'est pas encore connecté"}</h2>
          <p>${integrationConfig.email ? "Les accès client peuvent être envoyés automatiquement après achat." : "Ajoute RESEND_API_KEY dans .env pour automatiser la livraison post-achat."}</p>
        </div>
        <div class="email-config-metrics">
          <span><strong>${sentOrders}</strong> envoyés</span>
          <span><strong>${failedOrders}</strong> erreurs</span>
        </div>
      </article>
    `;
  }
  document.querySelector("#emailGrid").innerHTML = state.emails
    .map((email) => `
      <article class="email-card">
        <div class="email-card-head">
          <span class="email-trigger">✉</span>
          <button class="toggle ${email.active ? "active" : ""}" data-toggle-email="${email.id}" aria-label="${email.active ? "Désactiver" : "Activer"} l'automatisation"></button>
        </div>
        <h3>${escapeHtml(email.name)}</h3>
        <p>${escapeHtml(email.description)}</p>
        <div class="email-stats">
          <span>Déclencheur<br /><strong>${escapeHtml(email.trigger)}</strong></span>
          <span>Envoyés<br /><strong>${email.sent}</strong></span>
          <span>Ouverture<br /><strong>${email.openRate} %</strong></span>
        </div>
        <div class="detail-actions" style="margin-top:.75rem">
          <button class="secondary-button" style="font-size:.8rem;padding:.3rem .75rem" data-edit-email="${email.id}">Modifier</button>
          <button class="secondary-button" style="font-size:.8rem;padding:.3rem .75rem;color:#e85a6a" data-delete-email="${email.id}">Supprimer</button>
        </div>
      </article>
    `)
    .join("");
}

function renderFinance() {
  const paid = paidOrders();
  const refunded = state.orders.filter((order) => order.status === "refunded");
  const gross = paid.reduce((sum, order) => sum + order.amount, 0);
  const refundAmount = refunded.reduce((sum, order) => sum + order.amount, 0);
  const estimatedVat = Math.round(gross * 0.2);
  document.querySelector("#financeMetrics").innerHTML = [
    metricCard("Revenus bruts", euro.format(gross), "€", "Stripe", " avant frais et TVA"),
    metricCard("TVA estimée", euro.format(estimatedVat), "TVA", "20 %", " estimation indicative"),
    metricCard("Remboursements", euro.format(refundAmount), "↩", "Réel", ` · ${refunded.length} dossier${refunded.length > 1 ? "s" : ""}`),
  ].join("");

  document.querySelector("#invoiceList").innerHTML = state.orders.length
    ? state.orders.slice(0, 8).map((order) => {
        const contact = state.contacts.find((item) => item.id === order.contactId);
        const product = state.products.find((item) => item.id === order.productId);
        return `
          <div class="invoice-row">
            <span><strong>${escapeHtml(order.id)}</strong><small>${escapeHtml(contact?.name || "Client")} · ${escapeHtml(product?.title || "Produit")}</small></span>
            <b>${euro.format(order.amount)}</b>
            <em>${order.status === "paid" ? "Facturable" : "Remboursé"}</em>
          </div>
        `;
      }).join("")
    : '<div class="empty-state compact-empty">Les factures apparaîtront après les premières commandes.</div>';

  const taxSteps = [
    ["Paiements Stripe", Boolean(integrationConfig.stripe), "Connecte Stripe pour encaisser et suivre les paiements."],
    ["Emails de livraison", Boolean(integrationConfig.email), "Resend évite les accès envoyés manuellement."],
    ["Devise EUR", true, "Les produits sont vendus en euros."],
    ["Export comptable", state.orders.length > 0, "Utilise l'export dès les premières ventes."],
    ["TVA / factures", false, "À brancher avec ton outil comptable ou une génération PDF."],
  ];
  document.querySelector("#taxChecklist").innerHTML = taxSteps
    .map(([title, done, detail]) => `
      <div class="tax-row ${done ? "done" : ""}">
        <span>${done ? "✓" : "•"}</span>
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(detail)}</small>
      </div>
    `)
    .join("");
}

function renderSettings() {
  const form = document.querySelector("#settingsForm");
  Object.entries(state.profile).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (field) field.value = value;
  });
  updatePublicStoreLinks();
}

async function renderPaymentConfiguration() {
  if (DEMO_MODE) {
    integrationConfig = {
      stripe: true,
      stripeWebhook: true,
      email: true,
      umami: { enabled: true },
    };
    const stripeStatus = document.querySelector("#stripeStatus");
    const emailStatus = document.querySelector("#emailStatus");
    if (stripeStatus) {
      stripeStatus.textContent = "Connecté (démo)";
      stripeStatus.classList.add("connected");
    }
    if (emailStatus) {
      emailStatus.textContent = "Connecté (démo)";
      emailStatus.classList.add("connected");
    }
    renderLaunchProgress();
    return;
  }
  if (!location.protocol.startsWith("http")) {
    renderLaunchProgress();
    return;
  }
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    const config = await response.json();
    integrationConfig = { ...integrationConfig, ...config };
    const stripeStatus = document.querySelector("#stripeStatus");
    const emailStatus = document.querySelector("#emailStatus");
    if (stripeStatus) {
      stripeStatus.textContent = config.stripe && config.stripeWebhook ? "Connecté" : "À configurer";
      stripeStatus.classList.toggle("connected", config.stripe && config.stripeWebhook);
    }
    if (emailStatus) {
      emailStatus.textContent = config.email ? "Connecté" : "À configurer";
      emailStatus.classList.toggle("connected", config.email);
    }
    renderLaunchProgress();
  } catch {
    // L'état local reste utilisable sans configuration distante.
    renderLaunchProgress();
  }
}

function renderView(view) {
  if (view === "overview") renderOverview();
  if (view === "products") renderProducts();
  if (view === "pages") renderPages();
  if (view === "tunnel") renderTunnel();
  if (view === "orders") renderOrders();
  if (view === "contacts") renderContacts();
  if (view === "analytics") renderAnalytics();
  if (view === "finance") renderFinance();
  if (view === "emails") renderEmails();
  if (view === "settings") {
    renderSettings();
    renderPaymentConfiguration();
  }
}

function openProductModal(product = null) {
  const modal = document.querySelector("#productModal");
  const form = document.querySelector("#productForm");
  const productOptions = ['<option value="">Aucun</option>']
    .concat(state.products
      .filter((item) => item.id !== product?.id)
      .map((item) => `<option value="${item.id}">${escapeHtml(item.title)}</option>`))
    .join("");
  document.querySelector("#bumpProductSelect").innerHTML = productOptions;
  document.querySelector("#upsellProductSelect").innerHTML = productOptions;
  form.reset();
  form.elements.id.value = product?.id || "";
  form.elements.title.value = product?.title || "";
  form.elements.type.value = product?.type || "Formation";
  form.elements.price.value = product?.price ?? 0;
  form.elements.description.value = product?.description || "";
  form.elements.status.value = product?.status || "draft";
  form.elements.color.value = product?.color || "#6558f5";
  form.elements.offerRole.value = product?.offerRole || "core";
  form.elements.accessType.value = product?.accessType || "link";
  form.elements.compareAtPrice.value = product?.compareAtPrice || "";
  form.elements.funnelPriority.value = product?.funnelPriority || "standard";
  form.elements.bumpProductId.value = product?.bumpProductId || "";
  form.elements.upsellProductId.value = product?.upsellProductId || "";
  form.elements.coverUrl.value = product?.coverUrl || "";
  form.elements.cardSize.value = product?.cardSize || "m";
  form.elements.fileName.value = product?.fileName || "";
  document.querySelector("#productModalTitle").textContent = product ? "Modifier le produit" : "Créer un produit";
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  setTimeout(() => form.elements.title.focus(), 50);
}

function closeProductModal() {
  const modal = document.querySelector("#productModal");
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function submitProduct(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const id = data.get("id");
  const existing = state.products.find((product) => product.id === id);
  const product = {
    id: id || `prod_${Date.now()}`,
    title: data.get("title").trim(),
    type: data.get("type"),
    price: Number(data.get("price")),
    description: data.get("description").trim(),
    status: data.get("status"),
    color: data.get("color"),
    offerRole: data.get("offerRole") || "core",
    accessType: data.get("accessType") || "link",
    compareAtPrice: Number(data.get("compareAtPrice") || 0),
    funnelPriority: data.get("funnelPriority") || "standard",
    bumpProductId: data.get("bumpProductId") || "",
    upsellProductId: data.get("upsellProductId") || "",
    coverUrl: data.get("coverUrl").trim(),
    cardSize: data.get("cardSize") || "m",
    fileName: data.get("fileName").trim(),
    featured: existing?.featured || false,
    sales: existing?.sales || 0,
    views: existing?.views || 0,
  };
  if (existing) Object.assign(existing, product);
  else state.products.unshift(product);
  saveState();
  closeProductModal();
  renderProducts();
  trackEvent(existing ? "product_updated" : "product_created", {
    product_id: product.id,
    product_type: product.type,
    price: product.price,
    status: product.status,
  });
  showToast(existing ? "Produit mis à jour." : "Produit créé et ajouté au catalogue.");
}

function updatePageEditorPreview() {
  const form = document.querySelector("#pageForm");
  const preview = document.querySelector("#pageEditorPreview");
  if (!form || !preview) return;
  preview.style.setProperty("--editor-accent", form.elements.accent.value || "#6558f5");
  preview.style.setProperty("--editor-bg", form.elements.backgroundColor.value || "#f5f3ff");
  preview.style.setProperty("--editor-text", form.elements.textColor.value || "#17172a");
  preview.style.setProperty(
    "--editor-bg-image",
    form.dataset.backgroundImage ? `url("${form.dataset.backgroundImage}")` : "none",
  );
  preview.className = `mini-sales-page layout-${form.elements.layout.value}`;
  document.querySelector("#editorHeadlinePreview").textContent = form.elements.headline.value || "Ton titre de vente";
  document.querySelector("#editorSubheadlinePreview").textContent = form.elements.subheadline.value || "Ta promesse apparaîtra ici.";
  document.querySelector("#editorButtonPreview").textContent = form.elements.buttonText.value || "Je découvre l'offre";
  document.querySelector("#editorBadgePreview").textContent = form.elements.badge.value || "Nouveau";
  const logo = document.querySelector("#editorLogoPreview");
  const productImage = document.querySelector("#editorProductPreview");
  const logoSource = form.dataset.logo || form.elements.logoUrl.value;
  const productSource = form.dataset.productImage || form.elements.productImageUrl.value;
  logo.src = logoSource || "";
  logo.hidden = !logoSource;
  productImage.src = productSource || "";
  productImage.hidden = !productSource;
}

function openPageModal(page = null) {
  const select = document.querySelector("#pageProductSelect");
  select.innerHTML = state.products
    .map((product) => `<option value="${product.id}">${escapeHtml(product.title)}</option>`)
    .join("");
  if (!state.products.length) {
    showToast("Ajoute d'abord un produit avant de créer sa page de vente.");
    setView("products");
    return;
  }
  const form = document.querySelector("#pageForm");
  form.reset();
  form.elements.id.value = page?.id || "";
  form.elements.name.value = page?.name || "";
  form.elements.productId.value = page?.productId || state.products[0].id;
  // Auto-génère un slug unique pour les nouvelles pages
  if (!page) {
    const base = slugify(form.elements.name.value || "") || `page-${Date.now().toString(36)}`;
    let candidate = base;
    let n = 2;
    while (state.pages.some((p) => p.slug === candidate)) { candidate = `${base}-${n}`; n++; }
    form.elements.slug.value = candidate;
    delete form.elements.slug.dataset.touched;
  } else {
    form.elements.slug.value = page.slug;
  }
  form.elements.headline.value = page?.headline || "";
  form.elements.subheadline.value = page?.subheadline || "";
  form.elements.buttonText.value = page?.buttonText || "Je découvre l'offre";
  form.elements.badge.value = page?.badge || "Accès immédiat";
  form.elements.accent.value = page?.accent || "#6558f5";
  form.elements.backgroundColor.value = page?.backgroundColor || "#f5f3ff";
  form.elements.textColor.value = page?.textColor || "#17172a";
  form.elements.layout.value = page?.layout || "split";
  form.elements.logoUrl.value = page?.logoUrl?.startsWith("data:") ? "" : page?.logoUrl || "";
  form.elements.productImageUrl.value = page?.productImageUrl?.startsWith("data:") ? "" : page?.productImageUrl || "";
  form.elements.backgroundImageUrl.value = page?.backgroundImageUrl?.startsWith("data:") ? "" : page?.backgroundImageUrl || "";
  form.elements.proof.value = page?.proof || "";
  form.elements.blockBenefits.checked = page?.blocks?.benefits ?? true;
  form.elements.blockProgram.checked = page?.blocks?.program ?? true;
  form.elements.blockTestimonials.checked = page?.blocks?.testimonials ?? false;
  form.elements.blockFaq.checked = page?.blocks?.faq ?? true;
  form.elements.blockGuarantee.checked = page?.blocks?.guarantee ?? true;
  form.elements.blockLeadMagnet.checked = page?.blocks?.leadMagnet ?? false;
  form.elements.program.value = page?.program || "";
  form.elements.faq.value = page?.faq || "";
  form.elements.testimonial.value = page?.testimonial || "";
  form.elements.disclosure.value = page?.disclosure || "";
  form.dataset.logo = page?.logoUrl?.startsWith("data:") ? page.logoUrl : "";
  form.dataset.productImage = page?.productImageUrl?.startsWith("data:") ? page.productImageUrl : "";
  form.dataset.backgroundImage = page?.backgroundImageUrl?.startsWith("data:") ? page.backgroundImageUrl : "";
  document.querySelector("#pageModalTitle").textContent = page ? "Personnaliser la page" : "Créer une page";
  const modal = document.querySelector("#pageModal");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  updatePageEditorPreview();
}

function closePageModal() {
  const modal = document.querySelector("#pageModal");
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

async function submitPage(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const id = data.get("id");
  const existing = state.pages.find((page) => page.id === id);
  const baseSlug = slugify(data.get("slug") || data.get("name"));
  if (!baseSlug) { showToast("Le lien public est invalide."); return; }
  // Garantit l'unicité automatiquement (infini)
  let requestedSlug = baseSlug;
  let n = 2;
  while (state.pages.some((page) => page.id !== id && page.slug === requestedSlug)) {
    requestedSlug = `${baseSlug}-${n}`;
    n++;
  }
  let logoUrl = event.currentTarget.dataset.logo || data.get("logoUrl").trim();
  let productImageUrl = event.currentTarget.dataset.productImage || data.get("productImageUrl").trim();
  let backgroundImageUrl = event.currentTarget.dataset.backgroundImage || data.get("backgroundImageUrl").trim();
  try {
    logoUrl = (await fileToDataUrl(data.get("logoFile"))) || logoUrl;
    productImageUrl = (await fileToDataUrl(data.get("productImageFile"))) || productImageUrl;
    backgroundImageUrl = (await fileToDataUrl(data.get("backgroundImageFile"))) || backgroundImageUrl;
  } catch (error) {
    showToast(error.message);
    return;
  }
  const nextPage = {
    id: id || `page_${Date.now()}`,
    name: data.get("name").trim(),
    productId: data.get("productId"),
    headline: data.get("headline").trim(),
    subheadline: data.get("subheadline").trim(),
    buttonText: data.get("buttonText").trim(),
    badge: data.get("badge").trim(),
    slug: requestedSlug,
    accent: data.get("accent"),
    backgroundColor: data.get("backgroundColor"),
    textColor: data.get("textColor"),
    layout: data.get("layout"),
    blocks: {
      benefits: data.has("blockBenefits"),
      program: data.has("blockProgram"),
      testimonials: data.has("blockTestimonials"),
      faq: data.has("blockFaq"),
      guarantee: data.has("blockGuarantee"),
      leadMagnet: data.has("blockLeadMagnet"),
    },
    logoUrl,
    productImageUrl,
    backgroundImageUrl,
    proof: data.get("proof").trim(),
    program: data.get("program").trim(),
    faq: data.get("faq").trim(),
    testimonial: data.get("testimonial").trim(),
    disclosure: data.get("disclosure").trim(),
    status: existing?.status || "draft",
    visits: existing?.visits || 0,
    conversion: existing?.conversion || 0,
  };
  if (existing) Object.assign(existing, nextPage);
  else state.pages.unshift(nextPage);
  saveState();
  event.currentTarget.reset();
  closePageModal();
  renderPages();
  trackEvent(existing ? "sales_page_updated" : "sales_page_created", {
    sales_page_id: nextPage.id,
    sales_page_slug: nextPage.slug,
    product_id: nextPage.productId,
    layout: nextPage.layout,
    status: nextPage.status,
  });
  showToast(existing ? "Page mise à jour." : "Page créée en brouillon.");
}

function openChecklist() {
  document.querySelector("#checklistDrawer").classList.add("open");
  document.querySelector("#checklistDrawer").setAttribute("aria-hidden", "false");
  document.querySelector("#drawerBackdrop").classList.add("open");
}

function closeChecklist() {
  document.querySelector("#checklistDrawer").classList.remove("open");
  document.querySelector("#checklistDrawer").setAttribute("aria-hidden", "true");
  document.querySelector("#drawerBackdrop").classList.remove("open");
}

function exportCsv(filename, rows) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

document.addEventListener(
  "click",
  (event) => {
    if (!DEMO_MODE || !event.target.closest(demoBlockedClickSelector)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showToast("Mode démo : cette action est disponible après inscription.");
  },
  true,
);

document.addEventListener(
  "submit",
  (event) => {
    if (!DEMO_MODE) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showToast("Mode démo : les modifications sont désactivées.");
  },
  true,
);

document.addEventListener("click", (event) => {
  const navButton = event.target.closest("[data-view]");
  const viewTarget = event.target.closest("[data-view-target]");
  if (navButton) setView(navButton.dataset.view);
  if (viewTarget) setView(viewTarget.dataset.viewTarget);

  if (event.target.closest('[data-action="new-product"]')) openProductModal();
  if (event.target.closest('[data-action="new-page"]')) openPageModal();
  if (event.target.closest('[data-action="open-checklist"]')) openChecklist();
  if (event.target.closest('[data-action="new-email"]')) openEmailModal();
  if (event.target.closest('[data-action="new-contact"]')) openContactModal();
  if (event.target.closest('[data-action="new-order"]')) openOrderModal();

  if (event.target.closest("[data-close-modal]") || event.target === document.querySelector("#productModal")) closeProductModal();
  if (event.target.closest("[data-close-page-modal]") || event.target === document.querySelector("#pageModal")) closePageModal();
  if (event.target.closest("[data-close-contact-modal]") || event.target === document.querySelector("#contactModal")) closeContactModal();
  if (event.target.closest("[data-close-order-modal]") || event.target === document.querySelector("#orderModal")) closeOrderModal();
  if (event.target.closest("[data-close-email-modal]") || event.target === document.querySelector("#emailModal")) closeEmailModal();
  if (event.target.closest("[data-close-drawer]") || event.target === document.querySelector("#drawerBackdrop")) closeChecklist();
  if (event.target.closest("[data-close-detail]") || event.target === document.querySelector("#detailPanel")) closeDetailPanel();

  const editProduct = event.target.closest("[data-edit-product]");
  if (editProduct) {
    openProductModal(state.products.find((product) => product.id === editProduct.dataset.editProduct));
  }

  const toggleProduct = event.target.closest("[data-toggle-product]");
  if (toggleProduct) {
    const product = state.products.find((item) => item.id === toggleProduct.dataset.toggleProduct);
    if (product) {
      product.status = product.status === "published" ? "draft" : "published";
      saveState();
      renderProducts();
      trackEvent(product.status === "published" ? "product_published" : "product_unpublished", {
        product_id: product.id,
        product_type: product.type,
        price: product.price,
      });
      showToast(product.status === "published" ? "Produit publié dans la boutique." : "Produit passé en brouillon.");
    }
  }

  const deleteProduct = event.target.closest("[data-delete-product]");
  if (deleteProduct) {
    const product = state.products.find((item) => item.id === deleteProduct.dataset.deleteProduct);
    if (product && window.confirm(`Supprimer « ${product.title} » ?`)) {
      state.products = state.products.filter((item) => item.id !== product.id);
      state.pages = state.pages.filter((page) => page.productId !== product.id);
      saveState();
      renderProducts();
      showToast("Produit supprimé.");
    }
  }

  const togglePage = event.target.closest("[data-toggle-page]");
  if (togglePage) {
    const page = state.pages.find((item) => item.id === togglePage.dataset.togglePage);
    if (page) {
      page.status = page.status === "published" ? "draft" : "published";
      saveState();
      renderPages();
      trackEvent(page.status === "published" ? "sales_page_published" : "sales_page_unpublished", {
        sales_page_id: page.id,
        sales_page_slug: page.slug,
        product_id: page.productId,
      });
      showToast(page.status === "published" ? "Page publiée." : "Page repassée en brouillon.");
    }
  }

  const editPage = event.target.closest("[data-edit-page]");
  if (editPage) openPageModal(state.pages.find((page) => page.id === editPage.dataset.editPage));

  const copyPage = event.target.closest("[data-copy-page]");
  if (copyPage) {
    const page = state.pages.find((item) => item.id === copyPage.dataset.copyPage);
    if (page) {
      navigator.clipboard
        .writeText(pagePublicUrl(page))
        .then(() => showToast("Lien public copié."))
        .catch(() => showToast(pagePublicUrl(page)));
    }
  }

  const previewPage = event.target.closest("[data-preview-page]");
  if (previewPage) {
    const page = state.pages.find((item) => item.id === previewPage.dataset.previewPage);
    if (page) window.open(pagePublicPath(page), "_blank", "noopener");
  }

  const viewContact = event.target.closest("[data-view-contact]");
  if (viewContact) openContactDetail(viewContact.dataset.viewContact);

  const viewOrder = event.target.closest("[data-view-order]");
  if (viewOrder) openOrderDetail(viewOrder.dataset.viewOrder);

  const copyAccess = event.target.closest("[data-copy-access]");
  if (copyAccess) {
    const order = state.orders.find((item) => item.id === copyAccess.dataset.copyAccess);
    const accessUrl = orderAccessUrl(order);
    if (accessUrl) {
      navigator.clipboard
        .writeText(accessUrl)
        .then(() => showToast("Lien d'accès copié."))
        .catch(() => showToast(accessUrl));
    }
  }

  const resendAccess = event.target.closest("[data-resend-access]");
  if (resendAccess) resendOrderAccess(resendAccess.dataset.resendAccess);

  const emailToggle = event.target.closest("[data-toggle-email]");
  if (emailToggle) {
    const email = state.emails.find((item) => item.id === emailToggle.dataset.toggleEmail);
    if (email) {
      email.active = !email.active;
      saveState();
      renderEmails();
      showToast(email.active ? "Automatisation activée." : "Automatisation désactivée.");
    }
  }

  const deletePage = event.target.closest("[data-delete-page]");
  if (deletePage) {
    const page = state.pages.find((item) => item.id === deletePage.dataset.deletePage);
    if (page && window.confirm(`Supprimer la page « ${page.name} » ?`)) {
      state.pages = state.pages.filter((item) => item.id !== page.id);
      saveState();
      renderPages();
      showToast("Page supprimée.");
    }
  }

  const deleteContact = event.target.closest("[data-delete-contact]");
  if (deleteContact) {
    const contact = state.contacts.find((item) => item.id === deleteContact.dataset.deleteContact);
    if (contact && window.confirm(`Supprimer le contact « ${contact.name} » ?`)) {
      state.contacts = state.contacts.filter((item) => item.id !== contact.id);
      saveState();
      closeDetailPanel();
      renderContacts();
      showToast("Contact supprimé.");
    }
  }

  const editContact = event.target.closest("[data-edit-contact]");
  if (editContact) {
    const contact = state.contacts.find((item) => item.id === editContact.dataset.editContact);
    if (contact) { closeDetailPanel(); openContactModal(contact); }
  }

  const editEmail = event.target.closest("[data-edit-email]");
  if (editEmail) {
    const email = state.emails.find((item) => item.id === editEmail.dataset.editEmail);
    if (email) openEmailModal(email);
  }

  const deleteEmail = event.target.closest("[data-delete-email]");
  if (deleteEmail) {
    const email = state.emails.find((item) => item.id === deleteEmail.dataset.deleteEmail);
    if (email && window.confirm(`Supprimer l'automation « ${email.name} » ?`)) {
      state.emails = state.emails.filter((item) => item.id !== email.id);
      saveState();
      renderEmails();
      showToast("Automation supprimée.");
    }
  }
});

document.addEventListener("submit", (event) => {
  if (event.target.id !== "contactDetailForm") return;
  event.preventDefault();
  const form = event.target;
  const contact = state.contacts.find((item) => item.id === form.dataset.contactId);
  if (!contact) return;
  const data = new FormData(form);
  contact.segment = data.get("segment");
  contact.source = data.get("source").trim();
  contact.buyingScore = Math.max(0, Math.min(100, Number(data.get("buyingScore") || 0)));
  contact.tags = data.get("tags").split(",").map((tag) => tag.trim()).filter(Boolean);
  contact.lastProductId = data.get("lastProductId") || "";
  contact.nextAction = data.get("nextAction").trim();
  contact.notes = data.get("notes").trim();
  contact.activity = contact.nextAction ? `Prochaine action : ${contact.nextAction}` : contact.activity;
  saveState();
  renderContacts();
  openContactDetail(contact.id);
  showToast("Fiche contact enregistrée.");
});

document.querySelector("#menuButton").addEventListener("click", () => document.querySelector("#sidebar").classList.add("open"));
document.querySelector("#sidebarClose").addEventListener("click", () => document.querySelector("#sidebar").classList.remove("open"));
document.querySelector("#productForm").addEventListener("submit", submitProduct);
document.querySelector("#pageForm").addEventListener("submit", submitPage);
document.querySelector("#contactForm").addEventListener("submit", submitContact);
document.querySelector("#orderForm").addEventListener("submit", submitOrder);
document.querySelector("#emailForm").addEventListener("submit", submitEmail);
document.querySelector("#orderProductSelect")?.addEventListener("change", (e) => {
  const selected = e.target.selectedOptions[0];
  const form = document.querySelector("#orderForm");
  if (selected && form) form.elements.amount.value = selected.dataset.price || 0;
});
document.querySelector("#pageForm").addEventListener("input", (event) => {
  const form = event.currentTarget;
  if (event.target.name === "name" && !form.elements.id.value && !form.elements.slug.dataset.touched) {
    const base = slugify(event.target.value) || `page-${Date.now().toString(36)}`;
    let candidate = base;
    let n = 2;
    while (state.pages.some((p) => p.id !== form.elements.id.value && p.slug === candidate)) { candidate = `${base}-${n}`; n++; }
    form.elements.slug.value = candidate;
  }
  if (event.target.name === "slug") {
    form.elements.slug.dataset.touched = "true";
    form.elements.slug.value = slugify(form.elements.slug.value);
  }
  updatePageEditorPreview();
});
document.querySelector("#pageForm").addEventListener("change", async (event) => {
  const form = event.currentTarget;
  if (event.target.name === "logoFile") form.dataset.logo = await fileToDataUrl(event.target.files[0]).catch(() => "");
  if (event.target.name === "productImageFile") form.dataset.productImage = await fileToDataUrl(event.target.files[0]).catch(() => "");
  if (event.target.name === "backgroundImageFile") form.dataset.backgroundImage = await fileToDataUrl(event.target.files[0]).catch(() => "");
  updatePageEditorPreview();
});
document.querySelector("#productSearch").addEventListener("input", renderProducts);
document.querySelector("#productFilter").addEventListener("change", renderProducts);
document.querySelector("#orderSearch").addEventListener("input", renderOrders);
document.querySelector("#orderFilter").addEventListener("change", renderOrders);
document.querySelector("#contactSearch").addEventListener("input", renderContacts);
document.querySelector("#contactFilter").addEventListener("change", renderContacts);
document.querySelector("#notificationButton").addEventListener("click", () => showToast("Tu n'as aucune nouvelle notification."));

document.querySelector("#helpButton")?.addEventListener("click", () => {
  window.open(marketingUrl(), "_blank", "noopener");
});

document.querySelector("#configureDomain")?.addEventListener("click", () => {
  showToast("Domaine personnalisé : disponible sur demande. Écris-nous pour le brancher à ta boutique.");
});

document.querySelector("#manageSubscription")?.addEventListener("click", async (event) => {
  if (DEMO_MODE) return;
  const button = event.currentTarget;
  const previous = button.textContent;
  button.disabled = true;
  button.textContent = "Ouverture…";
  try {
    const response = await authenticatedFetch("/api/billing-portal", { method: "POST" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.url) throw new Error(data.error || "Gestion d'abonnement indisponible.");
    location.assign(data.url);
  } catch (error) {
    showToast(error.message || "Impossible d'ouvrir la gestion d'abonnement.");
    button.disabled = false;
    button.textContent = previous;
  }
});

(function setupAccountMenu() {
  const button = document.querySelector("#accountButton");
  if (!button) return;
  const menu = document.createElement("div");
  menu.className = "account-menu";
  menu.hidden = true;
  menu.innerHTML = `
    <p class="account-menu-email" id="accountMenuEmail">Connecté</p>
    <button type="button" id="logoutButton">Se déconnecter</button>`;
  (button.parentElement || document.body).appendChild(menu);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const email = activeSupabaseSession?.user?.email || state.profile.creatorName || "Connecté";
    menu.querySelector("#accountMenuEmail").textContent = email;
    menu.hidden = !menu.hidden;
  });
  menu.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", () => {
    menu.hidden = true;
  });
  menu.querySelector("#logoutButton").addEventListener("click", async () => {
    try {
      await supabaseClient?.auth?.signOut();
    } catch {
      // on déconnecte quand même côté client
    }
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });
})();

document.querySelector("#copyStoreLink")?.addEventListener("click", () => {
  navigator.clipboard
    ?.writeText(storePublicUrl())
    .then(() => showToast("Lien bio copié."))
    .catch(() => showToast(storePublicUrl()));
});

document.querySelector("#exportContacts").addEventListener("click", () => {
  exportCsv("expertly-contacts.csv", [
    ["Nom", "Email", "Segment", "Valeur client", "Date d'inscription"],
    ...state.contacts.map((contact) => [contact.name, contact.email, contact.segment, contact.value, contact.joined]),
  ]);
});

document.querySelector("#exportOrders").addEventListener("click", () => {
  exportCsv("expertly-commandes.csv", [
    ["Commande", "Client", "Produit", "Date", "Montant", "Statut"],
    ...state.orders.map((order) => {
      const contact = state.contacts.find((item) => item.id === order.contactId);
      const product = state.products.find((item) => item.id === order.productId);
      return [order.id, contact?.name || "", product?.title || "", order.date, order.amount, order.status];
    }),
  ]);
});

document.querySelector("#exportFinance").addEventListener("click", () => {
  exportCsv("expertly-finance.csv", [
    ["Facture", "Client", "Produit", "Date", "Montant TTC", "TVA estimée", "Statut"],
    ...state.orders.map((order) => {
      const contact = state.contacts.find((item) => item.id === order.contactId);
      const product = state.products.find((item) => item.id === order.productId);
      return [order.id, contact?.name || "", product?.title || "", order.date, order.amount, Math.round(order.amount * 0.2), order.status];
    }),
  ]);
});

document.querySelector("#settingsForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  state.profile = {
    firstName: state.profile.firstName || data.get("creatorName").trim().split(/\s+/)[0],
    creatorName: data.get("creatorName").trim(),
    creatorRole: data.get("creatorRole").trim(),
    bio: data.get("bio").trim(),
    slug: slugify(data.get("slug")),
    accent: data.get("accent"),
    logo: (event.currentTarget.dataset.logo || data.get("logo") || "").trim(),
  };
  saveState();
  renderIdentity();
  showToast("Identité de la boutique enregistrée.");
});

document.querySelector("#settingsForm").addEventListener("change", async (event) => {
  if (event.target.name !== "logoFile") return;
  try {
    const dataUrl = await fileToDataUrl(event.target.files[0]);
    if (dataUrl) {
      event.currentTarget.dataset.logo = dataUrl;
      const urlField = event.currentTarget.elements.namedItem("logo");
      if (urlField) urlField.value = "";
      showToast("Logo importé. Enregistre pour l'appliquer.");
    }
  } catch (error) {
    showToast(error.message || "Image trop lourde.");
  }
});

document.querySelector("#copyInstagramLink")?.addEventListener("click", () => {
  const url = goPublicUrl();
  navigator.clipboard
    ?.writeText(url)
    .then(() => showToast("Lien de bio Instagram copié ✓"))
    .catch(() => showToast(url));
});

document.querySelector("#settingsForm").addEventListener("input", (event) => {
  const form = event.currentTarget;
  if (event.target.name === "slug") {
    event.target.value = slugify(event.target.value);
  }
  if (event.target.name === "logo" && event.target.value.trim()) {
    delete form.dataset.logo;
  }
  const previewProfile = {
    ...state.profile,
    creatorName: form.elements.creatorName.value,
    creatorRole: form.elements.creatorRole.value,
    bio: form.elements.bio.value,
    slug: slugify(form.elements.slug.value || form.elements.creatorName.value),
    accent: form.elements.accent.value,
  };
  const previousProfile = state.profile;
  state.profile = previewProfile;
  updatePublicStoreLinks();
  state.profile = previousProfile;
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeProductModal();
    closePageModal();
    closeContactModal();
    closeOrderModal();
    closeEmailModal();
    closeChecklist();
    closeDetailPanel();
  }
});

async function hydrateServerState() {
  if (DEMO_MODE) return;
  if (!location.protocol.startsWith("http")) return;
  try {
    const response = await authenticatedFetch("/api/state", { cache: "no-store" });
    if (!response.ok) throw new Error("State unavailable");
    state = normalizeState(await response.json());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    showToast("Mode hors ligne : les données locales sont utilisées.");
  }
}

async function startApp() {
  await loadPublicConfig();
  if (!(await ensureCreatorAccess())) return;
  enableDemoMode();
  await hydrateServerState();
  await renderPaymentConfiguration();
  document.querySelector("#productCount").textContent = String(state.products.length);
  renderIdentity();
  renderLaunchProgress();
  window.ExpertlyTracking?.identify({
    profileId: `creator_${state.profile.slug || "default"}`,
    firstName: state.profile.firstName,
    properties: {
      role: "creator",
      plan: "scale",
      product_count: state.products.length,
      page_count: state.pages.length,
    },
  });
  trackEvent("creator_dashboard_opened", {
    product_count: state.products.length,
    page_count: state.pages.length,
    order_count: state.orders.length,
  });
  if (new URLSearchParams(location.search).get("checkout") === "success") {
    showToast("Paiement confirmé : ton espace Expertly est actif.");
    history.replaceState({}, "", `${location.pathname}${location.hash}`);
  }
  const initialView = location.hash.replace("#", "");
  setView(viewNames[initialView] ? initialView : "overview");
  const forceSetup = new URLSearchParams(location.search).get("setup") === "1";
  if (!DEMO_MODE && (forceSetup || (storeNeedsSetup() && !localStorage.getItem("expertly_onboarding_done")))) {
    openOnboardingWizard();
  } else {
    await ensureStoreCode();
  }
}

startApp();

const tabButtons = document.querySelectorAll("[data-tab]");
const tabPanels = document.querySelectorAll("[data-panel]");

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
        card.style.setProperty("--card-rotate-x", `${((0.5 - y / bounds.height) * 7).toFixed(2)}deg`);
        card.style.setProperty("--card-rotate-y", `${((x / bounds.width - 0.5) * 7).toFixed(2)}deg`);
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

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const tab = button.dataset.tab;

    tabButtons.forEach((item) => item.classList.toggle("active", item === button));
    tabPanels.forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.panel === tab);
    });
  });
});

enablePointerTilt(document.querySelectorAll(".pricing-grid article"));

const checkoutButtons = document.querySelectorAll("[data-checkout-plan]");
const checkoutFeedback = document.querySelector("#checkoutFeedback");
const REF_COOKIE = "expertly_ref";
const VISITOR_COOKIE = "expertly_visitor";

function setCookie(name, value, maxAgeDays) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax; Max-Age=${maxAgeDays * 24 * 60 * 60}`;
}

function getCookie(name) {
  return Object.fromEntries(
    document.cookie
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)]),
  )[name];
}

function cleanRef(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 48);
}

function getReferralFromUrl() {
  const params = new URLSearchParams(location.search);
  const hashQuery = location.hash.includes("?") ? new URLSearchParams(location.hash.split("?")[1]) : null;
  return cleanRef(params.get("ref") || params.get("affiliate") || hashQuery?.get("ref") || hashQuery?.get("affiliate"));
}

function getVisitorId() {
  const existing = getCookie(VISITOR_COOKIE);
  if (existing) return existing;
  const id = `vis_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  setCookie(VISITOR_COOKIE, id, 180);
  return id;
}

function currentAffiliateRef() {
  const refFromUrl = getReferralFromUrl();
  if (refFromUrl) {
    setCookie(REF_COOKIE, refFromUrl, 60);
    return refFromUrl;
  }
  return cleanRef(getCookie(REF_COOKIE));
}

async function trackAffiliateClick() {
  const affiliateRef = currentAffiliateRef();
  if (!affiliateRef || sessionStorage.getItem(`tracked_ref_${affiliateRef}`)) return;
  sessionStorage.setItem(`tracked_ref_${affiliateRef}`, "1");
  const endpoint =
    location.protocol === "file:"
      ? "http://localhost:4242/api/affiliate-click"
      : "/api/affiliate-click";
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        affiliateRef,
        visitorId: getVisitorId(),
        landingPage: `${location.pathname}${location.search}${location.hash}`,
        referrer: document.referrer || "",
      }),
    });
  } catch {
    // Le paiement reste prioritaire si le tracking n'est pas joignable.
  }
}

trackAffiliateClick();

async function redirectToStripe(button) {
  const originalLabel = button.textContent;
  checkoutButtons.forEach((item) => {
    item.disabled = true;
  });
  button.textContent = "Redirection...";
  checkoutFeedback.textContent = "";
  checkoutFeedback.classList.remove("success");

  try {
    const endpoint =
      location.protocol === "file:"
        ? "http://localhost:4242/api/create-checkout-session"
        : "/api/create-checkout-session";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan: button.dataset.checkoutPlan,
        affiliateRef: currentAffiliateRef(),
        visitorId: getVisitorId(),
      }),
    });
    const payload = await response.json();

    if (!response.ok || !payload.url) {
      throw new Error(payload.error || "Impossible de démarrer le paiement.");
    }

    window.location.assign(payload.url);
  } catch (error) {
    checkoutFeedback.textContent =
      error instanceof TypeError
        ? "Le serveur de paiement n’est pas démarré. Lance « npm start », puis ouvre http://localhost:4242."
        : error.message;
    checkoutButtons.forEach((item) => {
      item.disabled = false;
    });
    button.textContent = originalLabel;
  }
}

checkoutButtons.forEach((button) => {
  button.addEventListener("click", () => redirectToStripe(button));
});

const paymentStatus = new URLSearchParams(location.search).get("payment");
if (paymentStatus === "success") {
  checkoutFeedback.textContent = "Paiement confirmé. Merci pour ton abonnement.";
  checkoutFeedback.classList.add("success");
} else if (paymentStatus === "cancelled") {
  checkoutFeedback.textContent = "Paiement annulé. Aucun prélèvement n’a été effectué.";
}

const loginModal = document.querySelector("#loginModal");
const loginForm = document.querySelector("#loginForm");
const authTitle = document.querySelector("#authTitle");
const authCopy = document.querySelector("#authCopy");
const authSubmit = document.querySelector("#authSubmit");
const authFeedback = document.querySelector("#authFeedback");
const authModeButtons = document.querySelectorAll("[data-auth-mode]");

async function getSupabaseSession() {
  if (!supabaseClient) return null;
  const { data } = await supabaseClient.auth.getSession();
  return data.session;
}

function setAuthMode(mode) {
  authMode = mode === "signup" ? "signup" : "login";
  authModeButtons.forEach((button) => button.classList.toggle("active", button.dataset.authMode === authMode));
  authTitle.textContent = authMode === "signup" ? "Crée ton compte Expertly" : "Connecte-toi à Expertly";
  authCopy.textContent =
    authMode === "signup"
      ? "Crée ton compte avant le paiement. Il servira ensuite à ouvrir le CRM."
      : "Connecte-toi avec le compte utilisé pour ton abonnement.";
  authSubmit.textContent = authMode === "signup" ? "Créer mon compte" : "Se connecter";
  authFeedback.textContent = supabaseClient ? "" : "Supabase n'est pas encore configuré dans les variables d'environnement.";
  authFeedback.classList.remove("success");
}

function openLogin(mode = "login") {
  if (!loginModal || !loginForm) return;
  setAuthMode(mode);
  loginModal.classList.add("open");
  loginModal.setAttribute("aria-hidden", "false");
  setTimeout(() => loginForm.elements.email.focus(), 50);
}

function closeLogin() {
  if (!loginModal) return;
  loginModal.classList.remove("open");
  loginModal.setAttribute("aria-hidden", "true");
}

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-open-login]")) openLogin("login");
  if (event.target.closest("[data-open-signup]")) openLogin("signup");
  if (event.target.closest("[data-close-login]") || event.target === loginModal) closeLogin();
});

authModeButtons.forEach((button) => {
  button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
});

if (loginForm) loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabaseClient) {
    authFeedback.textContent = "Supabase n'est pas configuré. Ajoute SUPABASE_URL et SUPABASE_ANON_KEY.";
    return;
  }
  const data = new FormData(loginForm);
  const email = data.get("email").trim();
  const password = data.get("password");
  authSubmit.disabled = true;
  authSubmit.textContent = authMode === "signup" ? "Création..." : "Connexion...";
  authFeedback.textContent = "";
  authFeedback.classList.remove("success");
  try {
    const result =
      authMode === "signup"
        ? await supabaseClient.auth.signUp({ email, password })
        : await supabaseClient.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    authFeedback.textContent =
      authMode === "signup" && !result.data.session
        ? "Compte créé. Vérifie ton email puis reconnecte-toi."
        : "Connexion réussie.";
    authFeedback.classList.add("success");
    if (result.data.session) {
      closeLogin();
      if (pendingCheckoutButton) {
        const button = pendingCheckoutButton;
        pendingCheckoutButton = null;
        redirectToStripe(button);
      } else {
        const crmUrl = publicConfig.crmUrl?.startsWith("http") ? publicConfig.crmUrl : "http://localhost:4310";
        window.location.assign(crmUrl);
      }
    }
  } catch (error) {
    authFeedback.textContent = error.message || "Authentification impossible.";
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent = authMode === "signup" ? "Créer mon compte" : "Se connecter";
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeLogin();
});

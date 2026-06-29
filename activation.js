let config = window.EXPERTLY_CONFIG || {};
let supabaseClient = null;

const params = new URLSearchParams(window.location.search);
const sessionId = params.get("session_id");
const form = document.querySelector("#activationForm");
const submitButton = document.querySelector("#activationSubmit");
const feedback = document.querySelector("#activationFeedback");
const modeButtons = document.querySelectorAll("[data-auth-mode]");
let authMode = "signup";

async function loadPublicConfig() {
  try {
    const response = await fetch("/api/public-config", { cache: "no-store" });
    if (!response.ok) throw new Error("Config unavailable");
    config = { ...config, ...(await response.json()) };
  } catch {
    // En local, le serveur peut injecter la config directement dans la page.
  }
  supabaseClient =
    config.supabaseUrl?.startsWith("http") &&
    config.supabaseAnonKey &&
    !config.supabaseAnonKey.startsWith("%") &&
    window.supabase
      ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
      : null;
}

function setFeedback(message, type = "error") {
  feedback.textContent = message;
  feedback.classList.toggle("success", type === "success");
}

function setAuthMode(mode) {
  authMode = mode === "login" ? "login" : "signup";
  modeButtons.forEach((button) => button.classList.toggle("active", button.dataset.authMode === authMode));
  submitButton.textContent = authMode === "login" ? "Se connecter et activer" : "Creer mon compte et activer";
  setFeedback("");
}

async function activateAccount(session) {
  const endpoint = location.protocol === "file:" ? "http://localhost:4242/api/activate-account" : "/api/activate-account";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ sessionId }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Activation impossible.");
  setFeedback("Acces active. Redirection vers le CRM...", "success");
  window.location.assign(result.crmUrl || config.crmUrl || "http://localhost:4310");
}

modeButtons.forEach((button) => {
  button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!sessionId?.startsWith("cs_")) {
    setFeedback("Lien d'activation invalide. Reviens depuis la confirmation Stripe.");
    return;
  }
  if (!supabaseClient) {
    setFeedback("Supabase n'est pas configure sur ce deploiement.");
    return;
  }

  const data = new FormData(form);
  const email = data.get("email").trim();
  const password = data.get("password");
  submitButton.disabled = true;
  submitButton.textContent = authMode === "login" ? "Connexion..." : "Creation...";
  setFeedback("");

  try {
    const result =
      authMode === "login"
        ? await supabaseClient.auth.signInWithPassword({ email, password })
        : await supabaseClient.auth.signUp({ email, password });
    if (result.error) throw result.error;
    if (!result.data.session) {
      setFeedback("Compte cree. Verifie ton email, puis reviens ici et connecte-toi.");
      setAuthMode("login");
      return;
    }
    await activateAccount(result.data.session);
  } catch (error) {
    setFeedback(error.message || "Impossible d'activer ton compte.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = authMode === "login" ? "Se connecter et activer" : "Creer mon compte et activer";
  }
});

async function initActivation() {
  await loadPublicConfig();
  setAuthMode("signup");

  if (!sessionId?.startsWith("cs_")) {
    setFeedback("Lien d'activation invalide. Reviens depuis la confirmation Stripe.");
  } else if (!supabaseClient) {
    setFeedback("Supabase n'est pas configure sur ce deploiement.");
  }
}

initActivation();

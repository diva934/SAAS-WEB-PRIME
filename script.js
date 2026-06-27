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

function enableScrollMediaReveal() {
  const media = document.querySelectorAll(
    ".dashboard-preview, .product-showcase, .feature-visual",
  );
  const isMobile = window.matchMedia("(max-width: 760px)").matches;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  media.forEach((item) => item.classList.add("scroll-reveal-media"));

  if (!isMobile || reducedMotion || !("IntersectionObserver" in window)) {
    media.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      rootMargin: "0px 0px -12% 0px",
      threshold: 0.18,
    },
  );

  media.forEach((item) => observer.observe(item));
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
enableScrollMediaReveal();

if (["localhost", "127.0.0.1"].includes(window.location.hostname)) {
  document.querySelectorAll('a[href="https://expertly-client-app.vercel.app/?demo=1"]').forEach((link) => {
    link.href = "http://127.0.0.1:4310/?demo=1";
  });
}

const checkoutButtons = document.querySelectorAll("[data-checkout-plan]");
const checkoutFeedback = document.querySelector("#checkoutFeedback");
const checkoutDialog = document.querySelector("#checkoutDialog");
const checkoutForm = document.querySelector("#checkoutAccountForm");
const checkoutDialogError = document.querySelector("#checkoutDialogError");
const checkoutPlanSummary = document.querySelector("#checkoutPlanSummary");
const planLabels = {
  launch: "Launch · 19 € / mois",
  scale: "Scale · 49 € / mois",
  studio: "Studio · 149 € / mois",
};

function openCheckoutDialog(plan) {
  checkoutForm.elements.plan.value = plan;
  checkoutPlanSummary.textContent = planLabels[plan] || "Formule Expertly";
  checkoutDialogError.textContent = "";
  checkoutFeedback.textContent = "";
  checkoutFeedback.classList.remove("success");
  checkoutDialog.classList.add("open");
  checkoutDialog.setAttribute("aria-hidden", "false");
  document.body.classList.add("dialog-open");
  window.setTimeout(() => checkoutForm.elements.firstName.focus(), 50);
}

function closeCheckoutDialog() {
  checkoutDialog.classList.remove("open");
  checkoutDialog.setAttribute("aria-hidden", "true");
  document.body.classList.remove("dialog-open");
}

async function redirectToStripe(event) {
  event.preventDefault();
  const submitButton = checkoutForm.querySelector("button[type='submit']");
  const originalLabel = submitButton.textContent;
  const formData = new FormData(checkoutForm);
  submitButton.disabled = true;
  submitButton.textContent = "Ouverture du paiement…";
  checkoutDialogError.textContent = "";

  try {
    const endpoint =
      location.protocol === "file:"
        ? "http://localhost:4242/api/create-checkout-session"
        : "/api/create-checkout-session";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan: formData.get("plan"),
        firstName: formData.get("firstName"),
        email: formData.get("email"),
        password: formData.get("password"),
      }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.url) {
      throw new Error(payload.error || "Impossible de démarrer le paiement.");
    }

    window.location.assign(payload.url);
  } catch (error) {
    checkoutDialogError.textContent = error.message || "Le paiement ne peut pas être ouvert pour le moment.";
    submitButton.disabled = false;
    submitButton.textContent = originalLabel;
  }
}

checkoutButtons.forEach((button) => {
  button.addEventListener("click", () => openCheckoutDialog(button.dataset.checkoutPlan));
});

checkoutForm.addEventListener("submit", redirectToStripe);
checkoutDialog.addEventListener("click", (event) => {
  if (event.target === checkoutDialog || event.target.closest("[data-close-checkout]")) closeCheckoutDialog();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && checkoutDialog.classList.contains("open")) closeCheckoutDialog();
});

const paymentStatus = new URLSearchParams(location.search).get("payment");
if (paymentStatus === "success") {
  checkoutFeedback.textContent = "Paiement confirmé. Ton accès Expertly est actif.";
  checkoutFeedback.classList.add("success");
} else if (paymentStatus === "cancelled") {
  checkoutFeedback.textContent = "Paiement annulé. Aucun prélèvement n’a été effectué.";
} else if (paymentStatus === "provisioning_error") {
  checkoutFeedback.textContent = "Le paiement n’a pas pu activer ton accès. Contacte le support avant de réessayer.";
}

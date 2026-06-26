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

const checkoutButtons = document.querySelectorAll("[data-checkout-plan]");
const checkoutFeedback = document.querySelector("#checkoutFeedback");

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
      body: JSON.stringify({ plan: button.dataset.checkoutPlan }),
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

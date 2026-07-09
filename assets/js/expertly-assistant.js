(() => {
  if (window.ExpertlyAssistantLoaded) return;
  window.ExpertlyAssistantLoaded = true;

  const pageName = location.pathname.split("/").pop() || "index.html";
  const pageContexts = {
    "store.html": "boutique",
    "sales.html": "page de vente",
    "access.html": "accès client",
    "success.html": "paiement",
    "open.html": "partage de boutique",
  };

  const advice = {
    overview: {
      intro: "Je peux t’aider à choisir la prochaine action utile pour développer ta boutique.",
      chips: ["Que faire en premier ?", "Améliorer mes ventes", "Lire mes chiffres"],
    },
    products: {
      intro: "Je peux t’aider à structurer une offre, fixer son prix ou vérifier qu’elle est prête à être publiée.",
      chips: ["Créer une bonne offre", "Choisir mon prix", "Publier mon produit"],
    },
    pages: {
      intro: "Je peux t’aider à construire une page de vente plus claire et plus convaincante.",
      chips: ["Écrire mon titre", "Améliorer ma page", "Ajouter de la preuve"],
    },
    tunnel: {
      intro: "Je peux t’aider à organiser ton tunnel et à repérer l’étape qui freine les ventes.",
      chips: ["Optimiser mon tunnel", "Vérifier Stripe", "Réduire l’abandon"],
    },
    orders: {
      intro: "Je peux t’aider à suivre une commande, renvoyer un accès ou comprendre un paiement.",
      chips: ["Renvoyer un accès", "Paiement manquant", "Suivre une commande"],
    },
    contacts: {
      intro: "Je peux t’aider à segmenter tes contacts et à décider qui relancer en priorité.",
      chips: ["Qui relancer ?", "Segmenter mes contacts", "Écrire une relance"],
    },
    analytics: {
      intro: "Je peux t’aider à interpréter tes chiffres et à transformer les données en actions concrètes.",
      chips: ["Lire ma conversion", "Trouver mon point faible", "Analyser mon trafic"],
    },
    emails: {
      intro: "Je peux t’aider à vérifier la livraison automatique des accès après une commande.",
      chips: ["Email non reçu", "Renvoyer un accès", "Email après achat"],
    },
    finance: {
      intro: "Je peux t’aider à organiser le suivi du chiffre d’affaires, des remboursements et des exports.",
      chips: ["Suivre mon CA", "Préparer mes exports", "Gérer un remboursement"],
    },
    settings: {
      intro: "Je peux t’aider à configurer ton identité, tes paiements et les informations de ta boutique.",
      chips: ["Configurer Stripe", "Personnaliser ma boutique", "Vérifier ma configuration"],
    },
    boutique: {
      intro: "Je peux t’aider à choisir un produit ou à comprendre comment fonctionne cette boutique.",
      chips: ["Quel produit choisir ?", "Comment acheter ?", "Problème de paiement"],
    },
    "page de vente": {
      intro: "Je peux répondre à tes questions sur cette offre et t’aider avant de passer commande.",
      chips: ["Cette offre est pour moi ?", "Comment acheter ?", "Quand vais-je recevoir l’accès ?"],
    },
    "accès client": {
      intro: "Je peux t’aider à retrouver ou ouvrir l’accès à ton produit.",
      chips: ["Mon lien ne marche pas", "Je n’ai pas reçu l’email", "Ouvrir mon produit"],
    },
    paiement: {
      intro: "Ton paiement est confirmé. Je peux t’indiquer les prochaines étapes.",
      chips: ["Où est mon accès ?", "Je n’ai pas reçu l’email", "Retourner à la boutique"],
    },
    "partage de boutique": {
      intro: "Je peux t’aider à ouvrir ou partager correctement le lien de la boutique.",
      chips: ["Copier le lien", "Ouvrir dans Safari", "Le lien ne marche pas"],
    },
  };

  function context() {
    if (document.querySelector(".app-shell")) {
      return document.querySelector(".nav-item.active")?.dataset.view || "overview";
    }
    if (document.querySelector("#storeProducts")) return "boutique";
    if (document.querySelector("#salesHeadline")) return "page de vente";
    if (document.querySelector("#accessButton")) return "accès client";
    if (document.querySelector("#returnLink")) return "paiement";
    if (document.querySelector("#storeUrl")) return "partage de boutique";
    return pageContexts[pageName] || "overview";
  }

  function answerFor(rawQuestion) {
    const question = rawQuestion.toLocaleLowerCase("fr");
    if (/prix|tarif|combien/.test(question)) {
      return "Pars de la valeur du résultat, pas seulement du volume de contenu. Compare ensuite avec les alternatives de ton client et teste un prix simple. Dans Produits, tu peux aussi ajouter un prix barré si la comparaison est réelle et justifiable.";
    }
    if (/titre|headline|accroche/.test(question)) {
      return "Utilise cette structure : résultat concret + public concerné + objection levée. Exemple : « Transforme ton audience en clients, même avec une petite communauté ». Garde une seule promesse principale.";
    }
    if (/preuve|témoignage|confiance/.test(question)) {
      return "Ajoute une preuve proche de la promesse : résultat mesurable, témoignage précis ou aperçu du contenu. Une preuve détaillée et vérifiable vaut mieux que plusieurs avis vagues.";
    }
    if (/stripe|paiement|carte|checkout/.test(question)) {
      return "Vérifie d’abord la configuration Stripe dans Réglages, puis réalise un paiement test. Si une vente payée n’apparaît pas, contrôle le webhook Stripe et la présence des métadonnées produit et boutique.";
    }
    if (/accès|lien|reçu|email|livraison/.test(question)) {
      return "Pour une commande existante, ouvre Commandes puis le détail de la vente et utilise « Renvoyer l’accès ». Vérifie aussi l’adresse du client et la configuration Resend si l’email reste en échec.";
    }
    if (/contact|segment|relance|prospect/.test(question)) {
      return "Commence par les contacts qui ont montré une intention récente : checkout commencé, clic sur une offre ou réponse à un email. Segmente-les par besoin et propose une prochaine action unique, sans message générique.";
    }
    if (/conversion|chiffre|analytics|trafic|visite/.test(question)) {
      return "Lis le tunnel dans l’ordre : visites → clics → checkouts → achats. Beaucoup de visites mais peu de clics indique une promesse faible ; des checkouts sans achat indique plutôt un problème de confiance, de prix ou de paiement.";
    }
    if (/upsell|order bump|tunnel/.test(question)) {
      return "Vérifie d’abord les étapes disponibles : lien public, page de vente, Stripe Connect, paiement puis livraison de l’accès. Les upsells et order bumps ne sont pas encore exécutés par le checkout.";
    }
    if (/offre|produit|créer|premier/.test(question)) {
      return "Construis l’offre autour d’un seul résultat observable. Définis : le problème précis, le résultat promis, le format de livraison, le délai et le prix. Crée ensuite le produit, son lien d’accès, puis une page de vente.";
    }
    if (/rembours|facture|tva|export|ca|chiffre d.affaires/.test(question)) {
      return "Utilise Finance pour suivre les ventes payées et préparer l’export comptable. Pour un remboursement, traite d’abord l’opération dans Stripe puis conserve la référence de commande pour réconcilier le suivi.";
    }
    if (/acheter|commande|comment/.test(question) && context() !== "overview") {
      return "Choisis l’offre, renseigne ton nom et ton email, puis termine le paiement sécurisé. Pour un produit gratuit, l’accès est créé immédiatement. Pour un produit payant, il est envoyé après confirmation du paiement.";
    }

    const current = advice[context()] || advice.overview;
    return `${current.intro}\n\nDécris-moi ton objectif ou le blocage rencontré en une phrase, par exemple : « j’ai des visites mais aucune vente ».`;
  }

  const root = document.createElement("aside");
  root.className = "expertly-assistant";
  root.setAttribute("aria-label", "Assistant Expertly");
  root.innerHTML = `
    <section class="ea-panel" id="eaPanel" aria-label="Conversation avec l’assistant Expertly" hidden>
      <header class="ea-header">
        <div class="ea-avatar" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M12 3.2V5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="2.6" r="1.05" fill="currentColor"/><rect x="4.6" y="6.8" width="14.8" height="12" rx="3.6" stroke="currentColor" stroke-width="1.8"/><path d="M2.6 11.4v3.2M21.4 11.4v3.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="9.1" cy="12.4" r="1.45" fill="currentColor"/><circle cx="14.9" cy="12.4" r="1.45" fill="currentColor"/><path d="M9.4 15.9h5.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></div>
        <div class="ea-heading"><strong>Assistant Expertly</strong><span><i class="ea-status"></i>Conseils instantanés</span></div>
        <button class="ea-icon-button" type="button" data-ea-close aria-label="Fermer l’assistant">×</button>
      </header>
      <div class="ea-conversation" id="eaConversation" role="log" aria-live="polite"></div>
      <footer class="ea-composer">
        <form class="ea-form" id="eaForm">
          <textarea class="ea-input" id="eaInput" rows="1" maxlength="400" placeholder="Explique-moi ton besoin…" aria-label="Ton besoin"></textarea>
          <button class="ea-send" type="submit" aria-label="Envoyer">↑</button>
        </form>
        <p class="ea-note">Conseils indicatifs · aucune donnée n’est envoyée à un service externe</p>
      </footer>
    </section>
    <span class="ea-launcher-label">Besoin d’un conseil ?</span>
    <button class="ea-launcher" type="button" aria-controls="eaPanel" aria-expanded="false" aria-label="Ouvrir l’assistant Expertly">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.2V5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="2.6" r="1.05" fill="currentColor"/><rect x="4.6" y="6.8" width="14.8" height="12" rx="3.6" stroke="currentColor" stroke-width="1.8"/><path d="M2.6 11.4v3.2M21.4 11.4v3.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="9.1" cy="12.4" r="1.45" fill="currentColor"/><circle cx="14.9" cy="12.4" r="1.45" fill="currentColor"/><path d="M9.4 15.9h5.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
    </button>`;

  const panel = root.querySelector(".ea-panel");
  const launcher = root.querySelector(".ea-launcher");
  const conversation = root.querySelector(".ea-conversation");
  const input = root.querySelector(".ea-input");

  function addMessage(text, kind = "assistant") {
    const row = document.createElement("div");
    row.className = `ea-message ${kind}`;
    const bubble = document.createElement("div");
    bubble.className = "ea-bubble";
    bubble.textContent = text;
    row.appendChild(bubble);
    conversation.appendChild(row);
    conversation.scrollTop = conversation.scrollHeight;
  }

  function addChips(items) {
    const chips = document.createElement("div");
    chips.className = "ea-chips";
    items.forEach((label) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ea-chip";
      button.textContent = label;
      button.addEventListener("click", () => ask(label));
      chips.appendChild(button);
    });
    conversation.appendChild(chips);
  }

  function greet(reset = false) {
    if (reset) conversation.replaceChildren();
    const current = advice[context()] || advice.overview;
    addMessage(`Bonjour, je suis l’assistant Expertly. ${current.intro}`);
    addChips(current.chips);
  }

  function ask(question) {
    const clean = String(question || "").trim();
    if (!clean) return;
    addMessage(clean, "user");
    input.value = "";
    setTimeout(() => addMessage(answerFor(clean)), 180);
  }

  function setOpen(open) {
    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
    root.querySelector(".ea-launcher-label").hidden = open;
    if (open) {
      if (!conversation.children.length) greet();
      setTimeout(() => input.focus(), 0);
    } else {
      launcher.focus();
    }
  }

  launcher.addEventListener("click", () => setOpen(panel.hidden));
  root.querySelector("[data-ea-close]").addEventListener("click", () => setOpen(false));
  root.querySelector(".ea-form").addEventListener("submit", (event) => {
    event.preventDefault();
    ask(input.value);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      ask(input.value);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) setOpen(false);
  });
  document.addEventListener("click", (event) => {
    const nav = event.target.closest?.(".nav-item[data-view]");
    if (nav && !panel.hidden) setTimeout(() => greet(true), 0);
  });

  document.body.appendChild(root);
})();

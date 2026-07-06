(function () {
  const queue = [];
  let ready = false;
  let configured = false;
  let boutiqueSlug = "boutique";

  const internalEvents = {
    sales_page_viewed: "pageview",
    store_product_clicked: "click",
    sales_cta_clicked: "click",
    checkout_form_opened: "checkout",
    lead_captured: "lead",
  };

  function pathBoutiqueSlug() {
    const parts = location.pathname.split("/").filter(Boolean);
    if (["b", "go", "p"].includes(parts[0]) && parts[1]) return parts[1];
    if (parts.length === 1 && /^[a-z0-9]{6}$/.test(parts[0])) return parts[0];
    return boutiqueSlug;
  }

  function internalTrack(name, properties = {}) {
    const type = internalEvents[name];
    if (!type) return;
    const slug = properties.creator_slug || properties.boutique_slug || pathBoutiqueSlug();
    if (!slug || slug === "boutique") return;
    const params = new URLSearchParams(location.search);
    fetch("/api/events/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        type,
        slug,
        productId: properties.product_id || "",
        pageSlug: properties.sales_page_slug || "",
        surface: document.body.dataset.surface || "public",
        source: params.get("utm_source") || params.get("source") || "",
        referrer: document.referrer || "",
        url: location.href,
      }),
    }).catch(() => {});
  }

  function getDistinctId() {
    const key = "expertly_distinct_id";
    let id = localStorage.getItem(key);
    if (!id) {
      id = `visitor_${crypto.randomUUID().replaceAll("-", "").slice(0, 32)}`;
      localStorage.setItem(key, id);
    }
    return id;
  }

  function virtualUrl() {
    const surface = document.body.dataset.surface;
    if (surface === "creator_store") return `/boutique/${boutiqueSlug}`;
    if (surface === "sales_page") {
      const pageSlug = location.pathname.split("/").filter(Boolean).pop() || "page";
      return `/boutique/${boutiqueSlug}/p/${pageSlug}`;
    }
    if (surface === "customer_access") return `/boutique/${boutiqueSlug}/access`;
    if (surface === "payment_success") return `/boutique/${boutiqueSlug}/payment-success`;
    return `/creator/${boutiqueSlug}${location.hash || "/overview"}`;
  }

  function run(method, ...args) {
    if (configured && !window.umami) return;
    if (!ready) queue.push([method, ...args]);
    else window.umami[method](...args);
  }

  window.ExpertlyTracking = {
    track(name, properties = {}) {
      internalTrack(name, properties);
      run("track", name, { boutique_slug: boutiqueSlug, ...properties });
    },
    identify(profile) {
      if (!profile?.profileId) return;
      run("identify", profile.profileId, {
        boutique_slug: boutiqueSlug,
        first_name: profile.firstName,
        ...(profile.properties || {}),
      });
    },
    getDistinctId,
  };

  fetch("/api/config", { cache: "no-store" })
    .then((response) => response.json())
    .then((config) => {
      configured = true;
      boutiqueSlug = config.umami?.boutiqueSlug || boutiqueSlug;
      if (!config.umami?.websiteId) {
        queue.length = 0;
        return;
      }

      const script = document.createElement("script");
      script.src = "/umami/script.js";
      script.defer = true;
      script.dataset.websiteId = config.umami.websiteId;
      script.dataset.hostUrl = `${location.origin}/umami`;
      script.dataset.autoTrack = "false";
      script.dataset.excludeSearch = "true";
      script.dataset.excludeHash = "true";
      script.dataset.doNotTrack = "true";
      script.dataset.performance = "true";
      script.addEventListener("load", () => {
        ready = true;
        window.umami.identify(getDistinctId(), { boutique_slug: boutiqueSlug });
        window.umami.track((properties) => ({
          ...properties,
          url: virtualUrl(),
          title: document.title,
        }));
        queue.splice(0).forEach(([method, ...args]) => window.umami[method](...args));
      });
      document.head.append(script);
    })
    .catch(() => {
      configured = true;
      queue.length = 0;
    });
})();

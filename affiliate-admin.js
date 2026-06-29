const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const metrics = document.querySelector("#affiliateMetrics");
const affiliateRows = document.querySelector("#affiliateRows");
const commissionRows = document.querySelector("#commissionRows");
const refreshButton = document.querySelector("#refreshButton");

function money(cents) {
  return euro.format(Number(cents || 0) / 100);
}

function absoluteLink(path) {
  return `${location.origin}${path}`;
}

function rowEmpty(colspan, label) {
  return `<tr><td colspan="${colspan}" class="empty">${label}</td></tr>`;
}

async function loadAffiliateAdmin() {
  refreshButton.disabled = true;
  refreshButton.textContent = "Chargement...";
  try {
    const response = await fetch(`/api/affiliate-admin${location.search}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Impossible de charger l'affiliation.");
    const totalClicks = data.affiliates.reduce((sum, affiliate) => sum + affiliate.clicks, 0);
    const totalCustomers = data.affiliates.reduce((sum, affiliate) => sum + affiliate.customers, 0);
    const totalPending = data.affiliates.reduce((sum, affiliate) => sum + affiliate.pending, 0);
    const totalRevenue = data.affiliates.reduce((sum, affiliate) => sum + affiliate.revenue, 0);

    metrics.innerHTML = [
      ["Clics", totalClicks.toLocaleString("fr-FR")],
      ["Clients", totalCustomers.toLocaleString("fr-FR")],
      ["Revenu attribué", money(totalRevenue)],
      ["À payer", money(totalPending)],
    ]
      .map(([label, value]) => `<article><span>${label}</span><strong>${value}</strong></article>`)
      .join("");

    affiliateRows.innerHTML = data.affiliates.length
      ? data.affiliates
          .map((affiliate) => `
            <tr>
              <td><strong>${affiliate.name}</strong><small>${affiliate.email}</small></td>
              <td><code>${absoluteLink(affiliate.link)}</code></td>
              <td>${affiliate.clicks}</td>
              <td>${affiliate.customers}</td>
              <td>${money(affiliate.revenue)}</td>
              <td>${money(affiliate.pending)}</td>
              <td>${money(affiliate.paid)}</td>
            </tr>
          `)
          .join("")
      : rowEmpty(7, "Aucun affilié configuré.");

    commissionRows.innerHTML = data.commissions.length
      ? data.commissions
          .map((commission) => `
            <tr>
              <td>${new Date(commission.createdAt).toLocaleDateString("fr-FR")}</td>
              <td>${commission.affiliateSlug}</td>
              <td>${commission.plan}</td>
              <td>${commission.customerEmail || "Client Stripe"}</td>
              <td>${money(commission.amountPaid)}</td>
              <td>${money(commission.commissionAmount)}</td>
              <td><span class="status">${commission.status}</span></td>
            </tr>
          `)
          .join("")
      : rowEmpty(7, "Aucune commission confirmée.");
  } catch (error) {
    metrics.innerHTML = `<article class="error"><span>Erreur</span><strong>${error.message}</strong></article>`;
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "Actualiser";
  }
}

refreshButton.addEventListener("click", loadAffiliateAdmin);
loadAffiliateAdmin();

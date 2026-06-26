# Umami dans Expertly

Umami fonctionne silencieusement en arrière-plan. Aucun composant Umami n’est
affiché dans l’interface Expertly.

## Configuration

Créer un site dans Umami, puis renseigner `.env` :

```env
UMAMI_WEBSITE_ID=identifiant-du-site
UMAMI_HOST_URL=https://cloud.umami.is
```

Pour une instance auto-hébergée :

```env
UMAMI_HOST_URL=https://analytics.expertly.fr
```

Redémarrer ensuite Expertly.

## Séparation des boutiques

Chaque événement contient la propriété `boutique_slug`. Les pages vues utilisent
des URL virtuelles stables :

```text
/boutique/{boutique_slug}
/boutique/{boutique_slug}/p/{page_slug}
/boutique/{boutique_slug}/access
```

Dans Umami, filtre les rapports par URL ou par propriété `boutique_slug` pour
obtenir les statistiques d’une boutique précise.

## Événements

- `store_viewed`
- `store_product_clicked`
- `sales_page_viewed`
- `sales_cta_clicked`
- `checkout_form_opened`
- `checkout_started`
- `checkout_redirected_to_stripe`
- `payment_completed`
- `access_email_sent`
- `product_accessed`

`payment_completed` contient `revenue` et `currency`, ce qui alimente les
rapports de revenus Umami.

## Funnels

Funnel conseillé :

1. `sales_page_viewed`
2. `sales_cta_clicked`
3. `checkout_started`
4. `payment_completed`
5. `product_accessed`

Le même identifiant distinct est conservé avant et après le paiement pour les
journeys et la rétention.

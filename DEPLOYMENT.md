# Déploiement Expertly CRM

1. Appliquer `supabase/migrations/20260706_0001_expertly_core.sql` dans le projet Supabase.
2. Configurer les variables décrites dans `.env.example` sur Vercel.
3. Dans Stripe Connect, activer les comptes Express.
4. Créer un webhook Stripe vers `https://<domaine-crm>/api/stripe-webhook` en activant les événements des comptes connectés et `checkout.session.completed`.
5. Placer le secret de signature dans `STRIPE_WEBHOOK_SECRET`.
6. Vérifier le parcours : abonnement avec essai → connexion CRM → onboarding Connect → vente test → email d’accès.

La migration CAS est indispensable en production : elle empêche deux webhooks ou modifications simultanées d’écraser l’état d’une boutique.

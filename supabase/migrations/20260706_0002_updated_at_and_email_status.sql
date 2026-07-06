begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger générique : met automatiquement à jour updated_at avant chaque UPDATE
-- Utilise DROP ... IF EXISTS + CREATE pour compatibilité PostgreSQL < 14
-- (CREATE OR REPLACE TRIGGER n'existe qu'à partir de PG 14).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists subscriptions_set_updated_at   on public.subscriptions;
drop trigger if exists creator_states_set_updated_at  on public.creator_states;
drop trigger if exists creator_payments_set_updated_at on public.creator_payments;

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create trigger creator_states_set_updated_at
  before update on public.creator_states
  for each row execute function public.set_updated_at();

create trigger creator_payments_set_updated_at
  before update on public.creator_payments
  for each row execute function public.set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- Index GIN jsonb_path_ops sur creator_states.state
-- jsonb_path_ops : optimisé pour les opérateurs de containment (@>, <@, @@).
-- Plus compact et plus rapide que l'opclass par défaut pour les requêtes
-- /api/page (state=cs.{"pages":[{"slug":"..."}]}).
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists creator_states_state_gin
  on public.creator_states using gin (state jsonb_path_ops);


-- ─────────────────────────────────────────────────────────────────────────────
-- Mise à jour atomique du statut email d'une commande.
--
-- Contraintes :
--  • Acquiert le même advisory lock que save_creator_state_cas pour exclure
--    toute écriture concurrente sur la ligne du même créateur.
--  • Verrouille la ligne avec FOR UPDATE.
--  • Préserve l'ordre du tableau orders avec WITH ORDINALITY + ORDER BY.
--  • Incrémente state.revision → save_creator_state_cas détectera la
--    divergence si le client tente de sauvegarder avec l'ancienne révision.
--  • Valide les valeurs autorisées de p_email_status.
--  • Lève une exception si la commande ou la boutique est introuvable.
--
-- Retourne : jsonb { revision: <new>, emailStatus: <value> }
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.update_order_email_status(
  p_user_id      uuid,
  p_order_id     text,
  p_email_status text,
  p_email_id     text    default null,
  p_email_error  text    default null,
  p_delivered_at text    default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state      jsonb;
  v_revision   bigint;
  v_new_orders jsonb;
  v_order_found boolean := false;
begin
  -- Validation des valeurs autorisées pour emailStatus
  if p_email_status not in ('pending', 'sent', 'not_configured', 'failed') then
    raise exception 'invalid_email_status: valeur "%" non reconnue', p_email_status
      using errcode = 'invalid_parameter_value';
  end if;

  -- Advisory lock identique à save_creator_state_cas : exclut toute écriture
  -- concurrente sur la même boutique pendant toute la transaction.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  -- Lecture et verrouillage exclusif de la ligne
  select state
  into   v_state
  from   public.creator_states
  where  user_id = p_user_id
  for    update;

  if v_state is null then
    raise exception 'order_not_found: boutique introuvable pour user_id %', p_user_id
      using errcode = 'no_data_found';
  end if;

  -- Vérification que la commande existe dans le tableau
  select exists (
    select 1
    from jsonb_array_elements(v_state -> 'orders') as o
    where (o ->> 'id') = p_order_id
  ) into v_order_found;

  if not v_order_found then
    raise exception 'order_not_found: commande "%" introuvable', p_order_id
      using errcode = 'no_data_found';
  end if;

  -- Reconstruction de orders[] en préservant l'ordre (WITH ORDINALITY)
  select jsonb_agg(
    case
      when (t.o ->> 'id') = p_order_id
        then t.o
             || jsonb_build_object('emailStatus', p_email_status)
             || case when p_email_id     is not null
                     then jsonb_build_object('emailId',     p_email_id)
                     else '{}'::jsonb end
             || case when p_email_error  is not null
                     then jsonb_build_object('emailError',  p_email_error)
                     else '{}'::jsonb end
             || case when p_delivered_at is not null
                     then jsonb_build_object('deliveredAt', p_delivered_at)
                     else '{}'::jsonb end
      else t.o
    end
    order by t.ord
  )
  into v_new_orders
  from jsonb_array_elements(v_state -> 'orders') with ordinality as t(o, ord);

  v_revision := coalesce((v_state ->> 'revision')::bigint, 0);

  -- Mise à jour atomique : orders patchés + révision incrémentée
  -- Le trigger creator_states_set_updated_at mettra à jour updated_at.
  update public.creator_states
  set state = v_state
              || jsonb_build_object(
                   'orders',   coalesce(v_new_orders, '[]'::jsonb),
                   'revision', v_revision + 1
                 )
  where user_id = p_user_id;

  return jsonb_build_object('revision', v_revision + 1, 'emailStatus', p_email_status);
end;
$$;

revoke all on function public.update_order_email_status(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.update_order_email_status(uuid, text, text, text, text, text) to service_role;

commit;

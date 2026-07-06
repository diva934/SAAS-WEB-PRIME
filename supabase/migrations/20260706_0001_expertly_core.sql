begin;

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'inactive' check (status in ('active', 'inactive')),
  plan text not null default 'launch' check (plan in ('launch', 'scale', 'studio')),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  slug text not null unique,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_payments (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_account_id text not null unique,
  charges_enabled boolean not null default false,
  details_submitted boolean not null default false,
  updated_at timestamptz not null default now()
);

create unique index if not exists creator_states_slug_key on public.creator_states (slug);

alter table public.subscriptions enable row level security;
alter table public.creator_states enable row level security;
alter table public.creator_payments enable row level security;

create or replace function public.save_creator_state_cas(
  p_user_id uuid,
  p_slug text,
  p_state jsonb,
  p_expected_revision bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_state jsonb;
  current_revision bigint;
  next_state jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select state into current_state
  from public.creator_states
  where user_id = p_user_id
  for update;

  current_revision := coalesce((current_state ->> 'revision')::bigint, 0);
  if current_state is not null and current_revision <> coalesce(p_expected_revision, 0) then
    raise exception 'state_conflict';
  end if;

  if exists (
    select 1 from public.creator_states
    where slug = p_slug and user_id <> p_user_id
  ) then
    raise exception 'slug_conflict';
  end if;

  next_state := jsonb_set(coalesce(p_state, '{}'::jsonb), '{revision}', to_jsonb(current_revision + 1), true);

  insert into public.creator_states (user_id, slug, state, updated_at)
  values (p_user_id, p_slug, next_state, now())
  on conflict (user_id) do update
  set slug = excluded.slug,
      state = excluded.state,
      updated_at = excluded.updated_at;

  return next_state;
end;
$$;

revoke all on function public.save_creator_state_cas(uuid, text, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.save_creator_state_cas(uuid, text, jsonb, bigint) to service_role;

commit;

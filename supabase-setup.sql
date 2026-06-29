create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  plan text,
  status text not null default 'inactive',
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.creator_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  slug text not null unique,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.creator_states enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own
  on public.subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists creator_states_select_public on public.creator_states;
create policy creator_states_select_public
  on public.creator_states
  for select
  to anon, authenticated
  using (true);

drop policy if exists creator_states_insert_own on public.creator_states;
create policy creator_states_insert_own
  on public.creator_states
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists creator_states_update_own on public.creator_states;
create policy creator_states_update_own
  on public.creator_states
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

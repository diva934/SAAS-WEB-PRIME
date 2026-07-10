create table if not exists public.social_connections (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  handle text,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.social_connections enable row level security;

drop policy if exists "social_connections_no_client_access" on public.social_connections;
create policy "social_connections_no_client_access"
on public.social_connections
for all
using (false)
with check (false);

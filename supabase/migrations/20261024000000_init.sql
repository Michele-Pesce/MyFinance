-- MyFinance: initial schema.
-- Every user table carries user_id and is locked by RLS (user_id = auth.uid()).
-- instruments/prices are shared market data: readable by any signed-in user, written only by the server (service role).
-- Money is numeric, never float.

-- ---------------------------------------------------------------------------
-- Shared market data
-- ---------------------------------------------------------------------------
create table public.instruments (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('etf', 'stock', 'crypto', 'fx')),
  isin text,
  symbol text,
  exchange text,
  currency text not null default 'EUR',
  provider text not null,            -- e.g. 'coingecko'; the price provider that serves it
  provider_id text not null,         -- id in the provider's namespace
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (provider, provider_id)
);

create table public.prices (
  instrument_id uuid not null references public.instruments (id) on delete cascade,
  date date not null,
  close numeric(18, 8) not null check (close > 0),   -- in the app currency (EUR), already converted
  close_native numeric(18, 8),                        -- original quote
  currency_native text,
  fetched_at timestamptz not null default now(),
  primary key (instrument_id, date)                   -- upsert target: re-running the job is idempotent
);

-- ---------------------------------------------------------------------------
-- Per-user data
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  locale text not null default 'it',
  currency text not null default 'EUR',
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  class text not null check (class in ('liquidity', 'etf', 'stock', 'bond', 'crypto', 'other', 'receivable')),
  platform text,
  color text,
  group_label text,
  instrument_id uuid references public.instruments (id) on delete set null,
  monthly_contribution numeric(14, 4) not null default 0 check (monthly_contribution >= 0),
  initial_invested numeric(14, 4) not null default 0,
  initial_units numeric(18, 8) not null default 0,
  manual_price numeric(18, 8),
  manual_value numeric(14, 4) not null default 0,
  manual_value_at date,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)                -- target of the composite FK below
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  type text not null check (type in ('income', 'expense', 'pac', 'lump_sum')),
  category text,
  description text,
  amount numeric(14, 4) not null check (amount > 0),
  asset_id uuid,
  units numeric(18, 8) check (units is null or units > 0),
  units_estimated boolean not null default false,
  created_at timestamptz not null default now(),
  -- The asset must belong to the same user: RLS alone would let a user point at someone else's asset id.
  foreign key (asset_id, user_id) references public.assets (id, user_id) on delete set null (asset_id),
  -- Only PAC / lump sum are tied to an asset.
  check (asset_id is null or type in ('pac', 'lump_sum'))
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('expense', 'income')),
  name text not null check (length(trim(name)) > 0),
  sort int not null default 0,
  unique (user_id, kind, name)
);

create table public.snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  net_worth numeric(14, 4) not null,
  liquidity numeric(14, 4) not null default 0,
  invested numeric(14, 4) not null default 0,
  crypto numeric(14, 4) not null default 0,
  receivables numeric(14, 4) not null default 0,
  source text not null default 'manual' check (source in ('manual', 'auto')),
  unique (user_id, date)
);

create index assets_user_idx on public.assets (user_id);
create index transactions_user_date_idx on public.transactions (user_id, date desc);
create index transactions_asset_idx on public.transactions (asset_id);
create index snapshots_user_date_idx on public.snapshots (user_id, date);

-- ---------------------------------------------------------------------------
-- Server-only: signup gating
-- ---------------------------------------------------------------------------
create table public.app_config (key text primary key, value text not null);
insert into public.app_config values ('signup_mode', 'invite');   -- 'invite' | 'open'

create table public.invite_codes (
  code text primary key,
  max_uses int not null default 1 check (max_uses > 0),
  used_count int not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.assets enable row level security;
alter table public.transactions enable row level security;
alter table public.categories enable row level security;
alter table public.snapshots enable row level security;
alter table public.instruments enable row level security;
alter table public.prices enable row level security;
alter table public.app_config enable row level security;     -- no policies: service role only
alter table public.invite_codes enable row level security;   -- no policies: service role only

create policy "own profile" on public.profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own assets" on public.assets for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own transactions" on public.transactions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own categories" on public.categories for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own snapshots" on public.snapshots for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "read instruments" on public.instruments for select to authenticated using (true);
create policy "read prices" on public.prices for select to authenticated using (true);

-- Anonymous visitors get nothing, not even through the default Supabase grants.
revoke all on all tables in schema public from anon;
revoke insert, update, delete on public.instruments, public.prices from authenticated;

-- ---------------------------------------------------------------------------
-- Signup: invite check, then profile + default categories
-- ---------------------------------------------------------------------------
create function public.check_invite() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  mode text;
  v_code text := upper(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
begin
  select value into mode from public.app_config where key = 'signup_mode';
  if mode = 'open' then return new; end if;

  update public.invite_codes
     set used_count = used_count + 1
   where code = v_code
     and used_count < max_uses
     and (expires_at is null or expires_at > now());
  if not found then
    raise exception 'invalid_invite_code' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger before_signup_check_invite before insert on auth.users
  for each row execute function public.check_invite();

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'display_name', ''));

  -- Default categories (Italian, the default locale). The user can edit them freely.
  insert into public.categories (user_id, kind, name, sort)
  select new.id, c.kind, c.name, c.sort
  from (values
    ('expense', 'Carburante', 1), ('expense', 'Cibo fuori', 2), ('expense', 'Spesa casa', 3),
    ('expense', 'Abbonamenti', 4), ('expense', 'Svago', 5), ('expense', 'Shopping', 6),
    ('expense', 'Viaggi', 7), ('expense', 'Regali', 8), ('expense', 'Hobby', 9),
    ('expense', 'Commissioni', 10), ('expense', 'Altro', 11),
    ('income', 'Lavoro', 1), ('income', 'Regali', 2), ('income', 'Extra', 3)
  ) as c (kind, name, sort);
  return new;
end $$;

create trigger after_signup_create_profile after insert on auth.users
  for each row execute function public.handle_new_user();

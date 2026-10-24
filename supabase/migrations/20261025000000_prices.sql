-- M2: automatic prices. Server-only bookkeeping for the daily provider budgets + a fallback provider per instrument.

alter table public.instruments
  add column alt_provider text,        -- fallback provider/symbol used when the primary fails or is out of budget
  add column alt_provider_id text;

create index assets_instrument_idx on public.assets (instrument_id);

-- How many calls each provider has served per (UTC) day. Free plans are counted in calls/day.
create table public.provider_calls (
  provider text not null,
  date date not null,
  count int not null default 0,
  primary key (provider, date)
);
alter table public.provider_calls enable row level security;   -- no policies: service role only
revoke all on public.provider_calls from anon, authenticated;

-- Atomic increment, returns the new total.
create function public.bump_provider_calls(p_provider text, p_date date, p_n int) returns int
language sql security definer set search_path = '' as $$
  insert into public.provider_calls as pc (provider, date, count) values (p_provider, p_date, p_n)
  on conflict (provider, date) do update set count = pc.count + excluded.count
  returning count;
$$;
revoke execute on function public.bump_provider_calls from public, anon, authenticated;

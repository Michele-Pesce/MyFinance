-- Security hardening after the pre-release audit.

-- 1) The signup trigger functions are SECURITY DEFINER in the public schema: nobody but the triggers may execute them.
revoke execute on function public.check_invite() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 2) Shared rate limiter (works across serverless instances, no extra service). Service role only:
--    keys are hashed by the caller, so no email or IP is stored in clear.
create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count int not null default 0
);
alter table public.rate_limits enable row level security;   -- no policies: service role only
revoke all on public.rate_limits from anon, authenticated;

-- Fixed window counter. Returns true when the call is allowed.
create function public.hit_rate_limit(p_key text, p_max int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  c int;
begin
  insert into public.rate_limits as r (key, window_start, count) values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end,
    count = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.count + 1 end
  returning count into c;
  return c <= p_max;
end $$;
revoke execute on function public.hit_rate_limit from public, anon, authenticated;

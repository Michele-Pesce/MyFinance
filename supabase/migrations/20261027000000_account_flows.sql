-- Expenses and income can be tied to a liquidity account (cash, card...) so its balance follows them.
-- Until now only PAC / lump sum could carry an asset_id.
alter table public.transactions drop constraint transactions_check;

-- An income/expense may only point to a liquidity asset (the composite FK already guarantees the same owner).
create function public.check_flow_account() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.asset_id is not null and new.type in ('income', 'expense')
     and not exists (select 1 from public.assets a where a.id = new.asset_id and a.class = 'liquidity') then
    raise exception 'flow_account_must_be_liquidity' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger transactions_flow_account before insert or update on public.transactions
  for each row execute function public.check_flow_account();
revoke execute on function public.check_flow_account() from public, anon, authenticated;

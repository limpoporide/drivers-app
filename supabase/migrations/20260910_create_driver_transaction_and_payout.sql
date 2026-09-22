-- Driver payout destination + transaction ledger, mirroring rider_transaction,
-- plus atomic wallet-balance and transfer-PIN helpers used by the BudPay
-- payout edge functions (create-driver-payout, driver-budpay-webhook, etc).

alter table public.driver_profile
add column if not exists payout_bank_code text,
add column if not exists payout_bank_name text,
add column if not exists payout_account_number text,
add column if not exists payout_account_name text;

create table if not exists public.driver_transaction (
  id uuid primary key default gen_random_uuid(),
  driver_uuid uuid not null references public.driver_profile(uuid) on delete cascade,
  reference text not null unique,
  type text not null check (type in ('wallet_topup', 'payout')),
  status text not null default 'pending',
  channel text,
  gateway text,
  currency text not null default 'NGN',
  amount numeric(12, 2) not null,
  fee numeric(12, 2) not null default 0,
  requested_amount numeric(12, 2),
  sender_name text,
  sender_account text,
  bank_code text,
  bank_name text,
  account_number text,
  account_name text,
  narration text,
  paid_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists driver_transaction_driver_uuid_idx on public.driver_transaction (driver_uuid);

alter table public.driver_transaction enable row level security;

drop policy if exists "Drivers can view their own transactions" on public.driver_transaction;
create policy "Drivers can view their own transactions"
on public.driver_transaction
for select
using (auth.uid() = driver_uuid);

-- Atomic balance increment used by the wallet top-up webhook (service role only).
create or replace function public.increment_driver_wallet_balance(p_driver_uuid uuid, p_amount numeric)
returns void
language sql
security definer
set search_path = public
as $$
  update public.driver_profile
  set wallet_balance = wallet_balance + p_amount
  where uuid = p_driver_uuid;
$$;

revoke all on function public.increment_driver_wallet_balance(uuid, numeric) from public;
grant execute on function public.increment_driver_wallet_balance(uuid, numeric) to service_role;

-- Atomically holds funds for a payout; returns false (no-op) if the balance is insufficient.
create or replace function public.decrement_driver_wallet_balance_if_sufficient(p_driver_uuid uuid, p_amount numeric)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  did_update boolean;
begin
  update public.driver_profile
  set wallet_balance = wallet_balance - p_amount
  where uuid = p_driver_uuid and wallet_balance >= p_amount
  returning true into did_update;

  return coalesce(did_update, false);
end;
$$;

revoke all on function public.decrement_driver_wallet_balance_if_sufficient(uuid, numeric) from public;
grant execute on function public.decrement_driver_wallet_balance_if_sufficient(uuid, numeric) to service_role;

-- Stores only a bcrypt hash of the PIN (service role only, called from set-driver-transfer-pin).
create or replace function public.set_driver_transfer_pin(p_driver_uuid uuid, p_pin text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  update public.driver_profile
  set transfer_pin = crypt(p_pin, gen_salt('bf'))
  where uuid = p_driver_uuid;
$$;

revoke all on function public.set_driver_transfer_pin(uuid, text) from public;
grant execute on function public.set_driver_transfer_pin(uuid, text) to service_role;

-- Verifies a candidate PIN against the stored hash (service role only).
create or replace function public.verify_driver_transfer_pin(p_driver_uuid uuid, p_pin text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select transfer_pin is not null and transfer_pin = crypt(p_pin, transfer_pin)
  from public.driver_profile
  where uuid = p_driver_uuid;
$$;

revoke all on function public.verify_driver_transfer_pin(uuid, text) from public;
grant execute on function public.verify_driver_transfer_pin(uuid, text) to service_role;

-- Lets the client check PIN status without ever reading the hash itself.
create or replace function public.driver_has_transfer_pin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select transfer_pin is not null
  from public.driver_profile
  where uuid = auth.uid();
$$;

grant execute on function public.driver_has_transfer_pin() to authenticated;

-- Adds BudPay payout wallet fields to driver_profile, mirroring rider_profile.
alter table public.driver_profile
add column if not exists wallet_account text,
add column if not exists wallet_balance numeric(12, 2) not null default 0,
add column if not exists bank_name text,
add column if not exists account_name text,
add column if not exists budpay_customer_code text,
-- Store only a hashed PIN here (e.g. via pgcrypto crypt()); never plaintext.
add column if not exists transfer_pin text;

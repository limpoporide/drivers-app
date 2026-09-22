alter table public.driver_profile
add column if not exists phone_verified boolean not null default false;
alter table public.driver_profile
add column if not exists check1 boolean not null default false,
add column if not exists check2 boolean not null default false,
add column if not exists license_upload text;
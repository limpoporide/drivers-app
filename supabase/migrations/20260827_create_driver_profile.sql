create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.driver_profile (
  uuid uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null unique,
  phone_num text not null unique,
  phone_verified boolean not null default false,
  nin text not null unique,
  admin_verify boolean not null default false,
  profile_img text,
  license_upload text,
  is_online boolean not null default false,
  location_lat double precision,
  location_lng double precision,
  experience text,
  health_status text not null default 'no' check (health_status in ('yes', 'no')),
  health_yes text,
  address text,
  city text,
  state text,
  push_notification boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_driver_profile_updated_at on public.driver_profile;

create trigger set_driver_profile_updated_at
before update on public.driver_profile
for each row
execute function public.set_updated_at();

alter table public.driver_profile enable row level security;

drop policy if exists "Drivers can view their own profile" on public.driver_profile;
create policy "Drivers can view their own profile"
on public.driver_profile
for select
using (auth.uid() = uuid);

drop policy if exists "Drivers can insert their own profile" on public.driver_profile;
create policy "Drivers can insert their own profile"
on public.driver_profile
for insert
with check (auth.uid() = uuid);

drop policy if exists "Drivers can update their own profile" on public.driver_profile;
create policy "Drivers can update their own profile"
on public.driver_profile
for update
using (auth.uid() = uuid)
with check (auth.uid() = uuid);
do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'admin_role'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.admin_role as enum ('super-admin', 'finance', 'marketing', 'manager', 'support');
  end if;
end
$$;

create table if not exists public.admin_profile (
  uuid uuid primary key references auth.users(id) on delete cascade,
  first_name text not null check (char_length(trim(first_name)) >= 2),
  last_name text not null check (char_length(trim(last_name)) >= 2),
  email text not null,
  phone_num text,
  wallet_account text,
  profile_img text,
  role public.admin_role not null default 'support',
  is_active boolean not null default true,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists admin_profile_email_key on public.admin_profile (lower(email));
create unique index if not exists admin_profile_phone_num_key on public.admin_profile (phone_num) where phone_num is not null;
create unique index if not exists admin_profile_wallet_account_key on public.admin_profile (wallet_account) where wallet_account is not null;
create index if not exists admin_profile_role_idx on public.admin_profile (role);
create index if not exists admin_profile_is_active_idx on public.admin_profile (is_active);

create or replace function public.set_admin_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_admin_profile_updated_at on public.admin_profile;
create trigger set_admin_profile_updated_at
before update on public.admin_profile
for each row
execute function public.set_admin_profile_updated_at();

create or replace function public.current_admin_role()
returns public.admin_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.admin_profile
  where uuid = auth.uid()
    and is_active = true;
$$;

create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.admin_profile
    where uuid = auth.uid()
      and is_active = true
  );
$$;

create or replace function public.touch_admin_last_sign_in()
returns void
language sql
security definer
set search_path = public
as $$
  update public.admin_profile
  set last_sign_in_at = timezone('utc', now())
  where uuid = auth.uid()
    and is_active = true;
$$;

grant execute on function public.current_admin_role() to authenticated;
grant execute on function public.is_active_admin() to authenticated;
grant execute on function public.touch_admin_last_sign_in() to authenticated;

alter table public.admin_profile enable row level security;

drop policy if exists "Admins can view permitted admin profiles" on public.admin_profile;
create policy "Admins can view permitted admin profiles"
on public.admin_profile
for select
using (
  public.is_active_admin()
  and (
    auth.uid() = uuid
    or public.current_admin_role() = 'super-admin'::public.admin_role
  )
);

drop policy if exists "Super admins can manage admin profiles" on public.admin_profile;
create policy "Super admins can manage admin profiles"
on public.admin_profile
for all
using (public.current_admin_role() = 'super-admin'::public.admin_role)
with check (public.current_admin_role() = 'super-admin'::public.admin_role);
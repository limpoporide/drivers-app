create or replace function public.get_admin_overview_counts()
returns table (
  total_riders bigint,
  total_drivers bigint,
  total_users bigint,
  total_transactions bigint,
  total_bookings bigint,
  total_available_drivers bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.admin_profile
    where uuid = auth.uid()
      and is_active = true
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  with rider_count as (
    select count(*)::bigint as count_value from public.rider_profile
  ),
  driver_count as (
    select count(*)::bigint as count_value from public.driver_profile
  ),
  transaction_count as (
    select (
      (select count(*)::bigint from public.rider_transaction)
      +
      (select count(*)::bigint from public.driver_transaction)
    ) as count_value
  ),
  booking_count as (
    select (
      (select count(*)::bigint from public.rider_booking)
      +
      (select count(*)::bigint from public.schedule_booking)
    ) as count_value
  ),
  available_driver_count as (
    select count(*)::bigint as count_value
    from public.driver_profile
    where is_online = true
      and admin_verify = true
  )
  select
    rider_count.count_value,
    driver_count.count_value,
    rider_count.count_value + driver_count.count_value,
    transaction_count.count_value,
    booking_count.count_value,
    available_driver_count.count_value
  from rider_count, driver_count, transaction_count, booking_count, available_driver_count;
end;
$$;

grant execute on function public.get_admin_overview_counts() to authenticated;

create or replace function public.list_admin_customers(p_profile_type text)
returns table (
  profile_type text,
  uuid uuid,
  first_name text,
  last_name text,
  email text,
  phone_num text,
  profile_img text,
  city text,
  state text,
  wallet_account text,
  wallet_balance numeric,
  is_online boolean,
  is_verified boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.admin_profile
    where uuid = auth.uid()
      and is_active = true
  ) then
    raise exception 'Not authorized';
  end if;

  if p_profile_type = 'rider' then
    return query
    select
      'rider'::text,
      rider_profile.uuid,
      rider_profile.first_name,
      rider_profile.last_name,
      rider_profile.email,
      rider_profile.phone_num,
      rider_profile.profile_img,
      rider_profile.city,
      rider_profile.state,
      rider_profile.wallet_account,
      rider_profile.wallet_balance::numeric,
      null::boolean,
      rider_profile.phone_verified,
      rider_profile.created_at
    from public.rider_profile
    order by rider_profile.created_at desc;
  elsif p_profile_type = 'driver' then
    return query
    select
      'driver'::text,
      driver_profile.uuid,
      driver_profile.first_name,
      driver_profile.last_name,
      driver_profile.email,
      driver_profile.phone_num,
      driver_profile.profile_img,
      driver_profile.city,
      driver_profile.state,
      driver_profile.wallet_account,
      driver_profile.wallet_balance::numeric,
      driver_profile.is_online,
      driver_profile.admin_verify,
      driver_profile.created_at
    from public.driver_profile
    order by driver_profile.created_at desc;
  else
    raise exception 'Unsupported profile type: %', p_profile_type;
  end if;
end;
$$;

grant execute on function public.list_admin_customers(text) to authenticated;
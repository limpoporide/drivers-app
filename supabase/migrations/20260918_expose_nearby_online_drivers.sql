-- Lets riders see online, admin-verified drivers on the map while searching
-- for a driver, without exposing sensitive driver_profile columns via RLS.
create or replace function public.get_nearby_online_drivers()
returns table (
  uuid uuid,
  first_name text,
  last_name text,
  profile_img text,
  location_lat double precision,
  location_lng double precision
)
language sql
security definer
set search_path = public
stable
as $$
  select
    dp.uuid,
    dp.first_name,
    dp.last_name,
    dp.profile_img,
    dp.location_lat,
    dp.location_lng
  from public.driver_profile dp
  where dp.is_online = true
    and dp.admin_verify = true
    and dp.location_lat is not null
    and dp.location_lng is not null;
$$;

revoke all on function public.get_nearby_online_drivers() from public;
grant execute on function public.get_nearby_online_drivers() to authenticated;

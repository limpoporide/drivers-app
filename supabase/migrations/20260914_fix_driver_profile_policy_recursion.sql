create or replace function public.can_rider_view_assigned_driver_profile(p_driver_uuid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rider_booking rb
    where rb.assigned_driver = p_driver_uuid
      and rb.rider_id = auth.uid()
      and rb.ride_status in ('accepted', 'arrived', 'in_progress', 'completed')
  );
$$;

revoke all on function public.can_rider_view_assigned_driver_profile(uuid) from public;
grant execute on function public.can_rider_view_assigned_driver_profile(uuid) to authenticated;

drop policy if exists "Riders can view assigned driver profiles" on public.driver_profile;
create policy "Riders can view assigned driver profiles"
on public.driver_profile
for select
using (public.can_rider_view_assigned_driver_profile(uuid));
drop policy if exists "Riders can view assigned driver profiles" on public.driver_profile;
create policy "Riders can view assigned driver profiles"
on public.driver_profile
for select
using (
  exists (
    select 1
    from public.rider_booking rb
    where rb.assigned_driver = driver_profile.uuid
      and rb.rider_id = auth.uid()
      and rb.ride_status in ('accepted', 'arrived', 'in_progress', 'completed')
  )
);
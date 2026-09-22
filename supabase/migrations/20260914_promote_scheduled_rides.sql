create or replace function public.promote_due_scheduled_bookings(
  p_lead_time interval default interval '2 hours'
)
returns table (
  schedule_booking_id uuid,
  rider_booking_id uuid,
  rider_id uuid,
  created_status text,
  assigned_driver uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  due_booking public.schedule_booking%rowtype;
  linked_rider_booking_id uuid;
  next_ride_status public.rider_booking.ride_status%type;
  scheduled_pickup_at timestamptz;
begin
  for due_booking in
    select *
    from public.schedule_booking
    where schedule_type = 'ride'
      and booking_status in ('pending', 'confirmed')
      and converted_rider_booking_id is null
      and pickup_lat is not null
      and pickup_lng is not null
      and vehicle_type is not null
    order by schedule_date asc, pickup_time asc
    for update skip locked
  loop
    scheduled_pickup_at := ((due_booking.schedule_date::text || ' ' || due_booking.pickup_time::text)::timestamp at time zone 'Africa/Lagos');

    if scheduled_pickup_at > now() + p_lead_time or scheduled_pickup_at < now() - interval '12 hours' then
      continue;
    end if;

    next_ride_status := case
      when due_booking.assigned_driver is null then 'open'
      else 'accepted'
    end;

    insert into public.rider_booking (
      rider_id,
      assigned_driver,
      pricing_id,
      pick_up,
      pickup_lat,
      pickup_lng,
      drop_off,
      drop_lat,
      drop_lng,
      add_stop,
      addstop_lat,
      addstop_lng,
      guest_rider,
      guest_rider_name,
      guest_rider_number,
      total_km,
      total_time,
      base_fare,
      distance_fare,
      time_fare,
      delay_fare,
      amount,
      vat_amount,
      state_levy,
      total_fare,
      payment_method,
      payment_status,
      vehicle_type,
      ride_status
    )
    values (
      due_booking.rider_id,
      due_booking.assigned_driver,
      due_booking.pricing_id,
      due_booking.pick_up,
      due_booking.pickup_lat,
      due_booking.pickup_lng,
      coalesce(due_booking.drop_off, due_booking.pick_up),
      coalesce(due_booking.drop_lat, due_booking.pickup_lat),
      coalesce(due_booking.drop_lng, due_booking.pickup_lng),
      due_booking.add_stop,
      due_booking.addstop_lat,
      due_booking.addstop_lng,
      due_booking.guest_rider,
      due_booking.guest_rider_name,
      due_booking.guest_rider_number,
      due_booking.total_km,
      due_booking.total_time,
      due_booking.base_fare,
      due_booking.distance_fare,
      due_booking.time_fare,
      due_booking.delay_fare,
      due_booking.amount,
      due_booking.vat_amount,
      due_booking.state_levy,
      due_booking.total_fare,
      coalesce(due_booking.payment_method, 'wallet'),
      'unpaid',
      due_booking.vehicle_type,
      next_ride_status
    )
    returning id into linked_rider_booking_id;

    update public.schedule_booking
    set converted_rider_booking_id = linked_rider_booking_id,
        assigned_driver = coalesce(due_booking.assigned_driver, assigned_driver),
        booking_status = case
          when due_booking.assigned_driver is null then booking_status
          else 'confirmed'
        end,
        updated_at = timezone('utc', now())
    where id = due_booking.id;

    schedule_booking_id := due_booking.id;
    rider_booking_id := linked_rider_booking_id;
    rider_id := due_booking.rider_id;
    created_status := next_ride_status;
    assigned_driver := due_booking.assigned_driver;

    return next;
  end loop;
end;
$$;

create or replace function public.sync_schedule_booking_from_rider_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_schedule_status public.schedule_booking.booking_status%type;
begin
  next_schedule_status := case
    when new.ride_status in ('accepted', 'arrived', 'in_progress') then 'confirmed'
    when new.ride_status = 'completed' then 'converted'
    when new.ride_status = 'cancelled' then 'cancelled'
    when new.ride_status = 'expired' then 'expired'
    else null
  end;

  if next_schedule_status is null then
    return new;
  end if;

  update public.schedule_booking
  set assigned_driver = coalesce(new.assigned_driver, assigned_driver),
      booking_status = next_schedule_status,
      total_km = coalesce(new.total_km, total_km),
      total_time = coalesce(new.total_time, total_time),
      total_fare = coalesce(new.total_fare, total_fare),
      updated_at = timezone('utc', now())
  where converted_rider_booking_id = new.id;

  return new;
end;
$$;

drop trigger if exists sync_schedule_booking_from_rider_booking_trigger on public.rider_booking;

create trigger sync_schedule_booking_from_rider_booking_trigger
after insert or update of assigned_driver, ride_status, total_km, total_time, total_fare
on public.rider_booking
for each row
execute function public.sync_schedule_booking_from_rider_booking();
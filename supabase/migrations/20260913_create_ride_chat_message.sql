-- Chat between a rider and their assigned driver for a given rider_booking.
-- Reads are protected by RLS (participants only); writes go through the
-- send_ride_chat_message "server action" RPC so we can validate booking
-- state (a driver must be assigned) and derive sender_role server-side.

create table if not exists public.ride_chat_message (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.rider_booking(id) on delete cascade,
  sender_uuid uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('rider', 'driver')),
  message text not null check (char_length(trim(message)) > 0),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists ride_chat_message_booking_id_idx on public.ride_chat_message (booking_id, created_at);

alter table public.ride_chat_message enable row level security;

drop policy if exists "Ride participants can view chat messages" on public.ride_chat_message;
create policy "Ride participants can view chat messages"
on public.ride_chat_message
for select
using (
  exists (
    select 1
    from public.rider_booking rb
    where rb.id = ride_chat_message.booking_id
      and (rb.rider_id = auth.uid() or rb.assigned_driver = auth.uid())
  )
);

-- No client-facing insert policy: messages are written exclusively through
-- the send_ride_chat_message security-definer function below.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ride_chat_message'
  ) then
    alter publication supabase_realtime add table public.ride_chat_message;
  end if;
end
$$;

-- Server action: validates the caller is a participant on an assigned
-- booking, derives their role, and inserts the message.
create or replace function public.send_ride_chat_message(p_booking_id uuid, p_message text)
returns public.ride_chat_message
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.rider_booking;
  v_sender_role text;
  v_trimmed_message text := trim(coalesce(p_message, ''));
  v_row public.ride_chat_message;
begin
  if v_trimmed_message = '' then
    raise exception 'Message cannot be empty';
  end if;

  select * into v_booking
  from public.rider_booking
  where id = p_booking_id;

  if v_booking.id is null then
    raise exception 'Booking not found';
  end if;

  if v_booking.assigned_driver is null then
    raise exception 'Chat is only available once a driver has been assigned';
  end if;

  if auth.uid() = v_booking.rider_id then
    v_sender_role := 'rider';
  elsif auth.uid() = v_booking.assigned_driver then
    v_sender_role := 'driver';
  else
    raise exception 'Not authorized to send messages for this booking';
  end if;

  insert into public.ride_chat_message (booking_id, sender_uuid, sender_role, message)
  values (p_booking_id, auth.uid(), v_sender_role, v_trimmed_message)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.send_ride_chat_message(uuid, text) from public;
grant execute on function public.send_ride_chat_message(uuid, text) to authenticated;

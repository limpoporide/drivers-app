create table if not exists public.trip_share_session (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.rider_booking(id) on delete cascade,
  rider_id uuid not null references public.rider_profile(uuid) on delete cascade,
  share_token_hash text not null unique,
  share_status text not null default 'active' check (share_status in ('active', 'revoked', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  last_viewed_at timestamptz null,
  viewer_label text null,
  created_from text null,
  constraint trip_share_session_booking_rider_match
    check (char_length(share_token_hash) >= 32)
);

create index if not exists trip_share_session_booking_id_idx
  on public.trip_share_session (booking_id);

create index if not exists trip_share_session_rider_id_idx
  on public.trip_share_session (rider_id);

create index if not exists trip_share_session_status_expires_idx
  on public.trip_share_session (share_status, expires_at desc);

create unique index if not exists trip_share_session_one_active_per_booking_idx
  on public.trip_share_session (booking_id)
  where share_status = 'active';

alter table public.trip_share_session enable row level security;

drop policy if exists "Riders can view their own trip share sessions" on public.trip_share_session;
create policy "Riders can view their own trip share sessions"
on public.trip_share_session
for select
using (rider_id = auth.uid());

drop policy if exists "Riders can insert their own trip share sessions" on public.trip_share_session;
create policy "Riders can insert their own trip share sessions"
on public.trip_share_session
for insert
with check (
  rider_id = auth.uid()
  and exists (
    select 1
    from public.rider_booking rb
    where rb.id = booking_id
      and rb.rider_id = auth.uid()
  )
);

drop policy if exists "Riders can update their own trip share sessions" on public.trip_share_session;
create policy "Riders can update their own trip share sessions"
on public.trip_share_session
for update
using (rider_id = auth.uid())
with check (rider_id = auth.uid());

drop policy if exists "Riders can delete their own trip share sessions" on public.trip_share_session;
create policy "Riders can delete their own trip share sessions"
on public.trip_share_session
for delete
using (rider_id = auth.uid());

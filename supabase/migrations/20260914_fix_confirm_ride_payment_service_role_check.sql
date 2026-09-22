-- confirm_ride_payment's auth guard checked current_setting('request.jwt.claim.role', true),
-- which this project's newer API-key JWT issuer never populates (it only sets the
-- aggregate request.jwt.claims JSON). That made every service-role call (i.e. every
-- BudPay-confirmed ride payment routed through budpay-webhook) fail with
-- "Authentication required", regardless of payment method. current_setting('role', true)
-- reliably reflects the actual Postgres role PostgREST switches to (service_role /
-- authenticated / anon), so use that instead.
create or replace function public.confirm_ride_payment(
  p_booking_id uuid,
  p_reference text,
  p_channel text,
  p_gateway text,
  p_currency text default 'NGN',
  p_amount numeric default null,
  p_requested_amount numeric default null,
  p_paid_at timestamptz default timezone('utc', now()),
  p_raw_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_booking public.rider_booking;
  v_request_role text := coalesce(current_setting('role', true), '');
  v_payment_amount numeric(12, 2);
  v_rider_reference text;
  v_driver_reference text;
  v_driver_credited boolean := false;
  v_wallet_just_credited boolean := false;
  v_existing_rider_reference text;
begin
  if auth.uid() is null and v_request_role <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_booking_id::text));

  select * into v_booking
  from public.rider_booking
  where id = p_booking_id;

  if v_booking.id is null then
    raise exception 'Booking not found';
  end if;

  if v_request_role <> 'service_role' and auth.uid() <> v_booking.rider_id then
    raise exception 'Not authorized to confirm this booking payment';
  end if;

  v_payment_amount := round(coalesce(p_requested_amount, p_amount, v_booking.total_fare)::numeric, 2);

  if coalesce(v_payment_amount, 0) <= 0 then
    raise exception 'This booking does not have a valid fare';
  end if;

  v_rider_reference := nullif(trim(coalesce(p_reference, '')), '');

  if v_rider_reference is null then
    v_rider_reference := concat('RIDE_', p_booking_id::text);
  end if;

  select reference
  into v_existing_rider_reference
  from public.rider_transaction
  where sender_account = p_booking_id::text
    and type = 'ride_payment'
    and status = 'success'
  order by created_at desc
  limit 1;

  if v_existing_rider_reference is null then
    insert into public.rider_transaction (
      rider_uuid,
      reference,
      type,
      status,
      channel,
      gateway,
      currency,
      amount,
      fees,
      requested_amount,
      sender_name,
      sender_account,
      narration,
      paid_at,
      raw_payload
    )
    values (
      v_booking.rider_id,
      v_rider_reference,
      'ride_payment',
      'success',
      p_channel,
      p_gateway,
      coalesce(nullif(p_currency, ''), 'NGN'),
      v_payment_amount,
      0,
      v_payment_amount,
      case when p_channel = 'wallet' then 'Limpopo Wallet' else null end,
      p_booking_id::text,
      concat('Ride payment for booking ', p_booking_id::text),
      coalesce(p_paid_at, timezone('utc', now())),
      coalesce(p_raw_payload, '{}'::jsonb) || jsonb_build_object(
        'bookingId', p_booking_id,
        'paymentMethod', v_booking.payment_method
      )
    );
  else
    v_rider_reference := v_existing_rider_reference;
  end if;

  if v_booking.assigned_driver is not null then
    v_driver_reference := concat('RIDE_DRIVER_', p_booking_id::text);

    insert into public.driver_transaction (
      driver_uuid,
      reference,
      type,
      status,
      channel,
      gateway,
      currency,
      amount,
      fee,
      requested_amount,
      sender_name,
      sender_account,
      narration,
      paid_at,
      raw_payload
    )
    values (
      v_booking.assigned_driver,
      v_driver_reference,
      'ride_payment',
      'success',
      p_channel,
      p_gateway,
      coalesce(nullif(p_currency, ''), 'NGN'),
      v_payment_amount,
      0,
      v_payment_amount,
      'Limpopo Ride',
      p_booking_id::text,
      concat('Ride payment credit for booking ', p_booking_id::text),
      coalesce(p_paid_at, timezone('utc', now())),
      coalesce(p_raw_payload, '{}'::jsonb) || jsonb_build_object(
        'bookingId', p_booking_id,
        'paymentMethod', v_booking.payment_method
      )
    )
    on conflict (reference) do nothing;

    if exists (
      select 1
      from public.driver_transaction
      where reference = v_driver_reference
        and status = 'success'
    ) then
      if not exists (
        select 1
        from public.driver_transaction
        where reference = v_driver_reference
          and raw_payload ->> 'walletCredited' = 'true'
      ) then
        update public.driver_profile
        set wallet_balance = coalesce(wallet_balance, 0) + v_payment_amount,
            updated_at = timezone('utc', now())
        where uuid = v_booking.assigned_driver;

        update public.driver_transaction
        set raw_payload = coalesce(raw_payload, '{}'::jsonb) || jsonb_build_object('walletCredited', true)
        where reference = v_driver_reference;

        v_wallet_just_credited := true;
      end if;

      v_driver_credited := true;
    end if;
  end if;

  update public.rider_booking
  set payment_status = 'paid'
  where id = p_booking_id;

  return jsonb_build_object(
    'status', case when v_existing_rider_reference is null then 'paid' else 'already_paid' end,
    'paymentStatus', 'paid',
    'driverCredited', v_driver_credited,
    'walletJustCredited', v_wallet_just_credited,
    'driverUuid', v_booking.assigned_driver,
    'reference', v_rider_reference,
    'amount', v_payment_amount
  );
end;
$function$;

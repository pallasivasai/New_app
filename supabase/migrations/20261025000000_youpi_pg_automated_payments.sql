-- Local Basket YouPI PG payment automation.
-- Orders store the hosted checkout URL; the gateway payment ID is kept in payment_reference.
alter table public.orders add column if not exists payment_checkout_url text;

create unique index if not exists payment_events_youpi_payment_event_uq
  on public.payment_events (provider, provider_payment_id, event_type)
  where provider_payment_id is not null;

create or replace function public.apply_youpi_payment_event(
  p_order_number text,
  p_payment_id text,
  p_event_type text,
  p_amount_paise bigint,
  p_currency text,
  p_utr text,
  p_payload jsonb,
  p_delivery_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_expected_paise bigint;
  v_event_type text := upper(trim(coalesce(p_event_type, '')));
begin
  if v_event_type not in ('SUCCESS','FAILED','EXPIRED','CANCELLED') then
    raise exception 'Unsupported YouPI payment event';
  end if;
  if coalesce(trim(p_order_number),'') = '' or coalesce(trim(p_payment_id),'') = '' then
    raise exception 'Missing order or payment reference';
  end if;
  if upper(coalesce(p_currency,'INR')) <> 'INR' then
    raise exception 'Unexpected currency';
  end if;

  select * into v_order
  from public.orders
  where order_number = trim(p_order_number)
  for update;

  if not found then raise exception 'Order not found'; end if;
  if coalesce(v_order.payment_provider,'') <> 'youpi_pg' then
    raise exception 'Order does not belong to YouPI PG';
  end if;
  if coalesce(v_order.payment_reference,'') <> trim(p_payment_id) then
    raise exception 'Payment ID does not match this order';
  end if;

  v_expected_paise := round(coalesce(v_order.total, v_order.total_amount) * 100)::bigint;
  if p_amount_paise is null or p_amount_paise <> v_expected_paise then
    raise exception 'Payment amount does not match order total';
  end if;

  if exists (
    select 1 from public.payment_events
    where provider = 'youpi_pg'
      and provider_payment_id = trim(p_payment_id)
      and event_type = v_event_type
  ) then
    return jsonb_build_object('received', true, 'duplicate', true, 'payment_status', v_order.payment_status);
  end if;

  insert into public.payment_events (
    order_id, provider, provider_payment_id, event_type, verified,
    reference, notes, payload
  ) values (
    v_order.id, 'youpi_pg', trim(p_payment_id), v_event_type, true,
    nullif(trim(coalesce(p_utr,'')), ''),
    nullif(trim(coalesce(p_delivery_id,'')), ''),
    coalesce(p_payload, '{}'::jsonb)
  );

  if v_event_type = 'SUCCESS' then
    if v_order.payment_status <> 'paid' then
      update public.orders
      set payment_status = 'paid',
          status = case when status = 'pending' then 'confirmed' else status end,
          updated_at = now()
      where id = v_order.id;
    end if;
  elsif v_event_type in ('FAILED','EXPIRED','CANCELLED') then
    if v_order.payment_status not in ('paid','cash_on_delivery','refunded') then
      update public.orders
      set payment_status = 'failed', updated_at = now()
      where id = v_order.id;
    end if;
  end if;

  return jsonb_build_object(
    'received', true,
    'duplicate', false,
    'order_id', v_order.id,
    'payment_status', case
      when v_event_type = 'SUCCESS' then 'paid'
      when v_event_type in ('FAILED','EXPIRED','CANCELLED') and v_order.payment_status <> 'paid' then 'failed'
      else v_order.payment_status
    end
  );
end;
$$;

revoke all on function public.apply_youpi_payment_event(text,text,text,bigint,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.apply_youpi_payment_event(text,text,text,bigint,text,text,jsonb,text) to service_role;

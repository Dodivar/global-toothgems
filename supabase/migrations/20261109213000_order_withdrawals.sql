-- =============================================================================
-- Online withdrawal function for shop orders (decision 131)
-- =============================================================================
-- Directive (EU) 2023/2673 adds article 11a to directive 2011/83/EU, applicable
-- since 19 June 2026, transposed in France in article L221-21 of the Code de la
-- consommation (ordinance n° 2026-2 and decree n° 2026-3 of 5 January 2026):
-- a contract concluded through an online interface must offer, for the whole
-- withdrawal period, a clearly labelled function to withdraw online, a second
-- confirming action, and an acknowledgement of receipt on a durable medium
-- without delay. The 3D Studio has its own (decision 95); this is the shop's.
--
--   products.withdrawal_hygiene_seal   the product is a sealed hygiene product:
--                                      opened after delivery, it leaves the right
--                                      (L221-28 5°). Set for gems and lip glosses.
--   order_withdrawals (+ _items)       one declaration: who, which lines and
--                                      quantities, when; status declared →
--                                      return_received → refunded | refused
--   order_withdrawal_links             guests: a signed link e-mailed to the
--                                      order's address (token stored hashed, 48 h)
--   refunds.withdrawal_id              the card refund that settles a withdrawal
--
--   order_withdrawal_options(order)            owner / staff: what can be withdrawn now
--   order_withdrawal_options_by_token(token)   service role (guest page)
--   request_order_withdrawal_link(no, email)   service role: neutral, throttled
--   order_withdrawal_ip_allowed(ip hash)       service role: 10 requests / hour / address
--   declare_order_withdrawal(...)              service role: the member (by id) or
--                                              the guest (by token); every rule here
--   admin_withdrawal_return_received(id)       manage_orders
--   admin_refuse_withdrawal(id, reason, note)  manage_orders
--   request_withdrawal_refund(id, order, amount, restock)
--                                              manage_orders: request_refund() with the
--                                              withdrawal's lines, linked to it
--   pending_order_withdrawal_emails()          the acknowledgement (L221-21)
--
-- The period (agent's reading, decision 131, to confirm): 14 days from receipt
-- of the last parcel (L221-18), the day of receipt not counted, ending at
-- midnight Paris time, carried to the Monday when it ends on a Saturday or a
-- Sunday (art. 642 CPC through L221-19; public holidays not carried). Receipt =
-- the parcel's delivered_at, else the later of its estimated delivery and its
-- shipping date + the promised maximum delay in working days (7 when none).
-- While some goods have not left (or a parcel is lost), the period has not
-- started and the function stays open (the consumer may withdraw from the
-- conclusion of the contract).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Sealed hygiene products
-- -----------------------------------------------------------------------------
alter table public.products
  add column withdrawal_hygiene_seal boolean not null default false;

comment on column public.products.withdrawal_hygiene_seal is
  'Sealed product for the mouth: once its sealed packaging is opened after delivery it cannot be withdrawn '
  '(L221-28 5°, hygiene). The customer answers for each such line when withdrawing (decision 131).';

-- Gems and lip glosses are sold sealed (decision 126 (b)); the equipment
-- category mixes tools and application products: set those one by one.
update public.products p
   set withdrawal_hygiene_seal = true
  from public.categories c
 where c.id = p.category_id
   and c.slug in ('gems', 'lip-gloss')
   and p.product_type = 'physical'
   and not p.withdrawal_hygiene_seal;

-- -----------------------------------------------------------------------------
-- 2. Tables
-- -----------------------------------------------------------------------------
create table public.order_withdrawals (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders (id) on delete restrict,
  -- The member who declared, or the order's owner; kept (null) after an erasure like the order.
  user_id            uuid references public.profiles (id) on delete set null,
  channel            text not null check (channel in ('account', 'email_link')),
  customer_name      text not null check (char_length(btrim(customer_name)) between 1 and 200),
  -- The order's address at the time: where the acknowledgement goes.
  email              text not null check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  locale             text not null default 'fr' check (locale in ('fr', 'en')),
  declared_at        timestamptz not null default now(),
  -- The end of the period the declaration was judged against (null: not started yet).
  deadline_at        timestamptz,
  status             text not null default 'declared'
                       check (status in ('declared', 'return_received', 'refunded', 'refused')),
  return_received_at timestamptz,
  refunded_at        timestamptz,
  refused_at         timestamptz,
  refusal_reason     text check (refusal_reason in
                       ('deadline_passed', 'unsealed_hygiene', 'professional_buyer', 'goods_not_returned',
                        'goods_damaged', 'other')),
  -- Shown to the customer: written for them.
  refusal_note       text check (char_length(refusal_note) <= 500),
  handled_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint order_withdrawals_refusal check ((status = 'refused') = (refusal_reason is not null)),
  constraint order_withdrawals_dates check (
    (status <> 'return_received' or return_received_at is not null)
    and (status <> 'refunded' or refunded_at is not null)
    and (status <> 'refused' or refused_at is not null))
);

comment on table public.order_withdrawals is
  'Shop withdrawals declared online (L221-21, decision 131). Written only by declare_order_withdrawal() and the '
  'staff functions; the order''s owner and staff read. Kept like the order (never purged).';

create index order_withdrawals_order_idx on public.order_withdrawals (order_id);
create index order_withdrawals_user_idx on public.order_withdrawals (user_id) where user_id is not null;
create index order_withdrawals_open_idx on public.order_withdrawals (declared_at) where status in ('declared', 'return_received');

create table public.order_withdrawal_items (
  withdrawal_id uuid not null references public.order_withdrawals (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id) on delete restrict,
  quantity      integer not null check (quantity between 1 and 10000),
  -- The customer's answer for a sealed hygiene product (null for the others): always false once accepted.
  seal_opened   boolean,
  primary key (withdrawal_id, order_item_id)
);

create index order_withdrawal_items_line_idx on public.order_withdrawal_items (order_item_id);

create table public.order_withdrawal_links (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  token_hash  text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  constraint order_withdrawal_links_expiry check (expires_at > created_at)
);

comment on table public.order_withdrawal_links is
  'Guest access to the withdrawal function: a random token e-mailed to the order''s address, stored as its '
  'SHA-256, valid 48 hours. Service role only; purged 30 days after expiry.';

create index order_withdrawal_links_order_idx on public.order_withdrawal_links (order_id);

alter table public.refunds
  add column withdrawal_id uuid references public.order_withdrawals (id) on delete restrict;
create index refunds_withdrawal_idx on public.refunds (withdrawal_id) where withdrawal_id is not null;
comment on column public.refunds.withdrawal_id is
  'The withdrawal this refund settles (request_withdrawal_refund()); set by the backend only.';

-- RLS: reads only; every write goes through the functions below.
alter table public.order_withdrawals enable row level security;
alter table public.order_withdrawal_items enable row level security;
alter table public.order_withdrawal_links enable row level security;

revoke all on public.order_withdrawals, public.order_withdrawal_items, public.order_withdrawal_links
  from anon, authenticated;
grant select on public.order_withdrawals, public.order_withdrawal_items to authenticated;

create policy "order_withdrawals: owner and staff read"
  on public.order_withdrawals for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_staff()));

create policy "order_withdrawal_items: owner and staff read"
  on public.order_withdrawal_items for select to authenticated
  using (exists (select 1 from public.order_withdrawals w
                  where w.id = withdrawal_id
                    and (w.user_id = (select auth.uid()) or (select private.is_staff()))));

create or replace function private.order_withdrawals_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger order_withdrawals_touch_updated_at
  before update on public.order_withdrawals
  for each row execute function private.order_withdrawals_touch();

create trigger order_withdrawals_audit
  after insert or update or delete on public.order_withdrawals
  for each row execute function private.audit_changes();

-- Only the backend links a refund to a withdrawal (staff can update refunds to cancel them).
create or replace function private.guard_refund_withdrawal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_trusted_backend() then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.withdrawal_id is not null)
     or (tg_op = 'UPDATE' and new.withdrawal_id is distinct from old.withdrawal_id) then
    raise exception 'refunds: the withdrawal link is set by request_withdrawal_refund()' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger refunds_guard_withdrawal
  before insert or update on public.refunds
  for each row execute function private.guard_refund_withdrawal();

-- -----------------------------------------------------------------------------
-- 3. The period
-- -----------------------------------------------------------------------------
create or replace function private.add_working_days(p_from timestamptz, p_days integer)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_at   timestamptz := p_from;
  v_left integer := greatest(coalesce(p_days, 0), 0);
begin
  while v_left > 0 loop
    v_at := v_at + interval '1 day';
    if extract(isodow from (v_at at time zone 'Europe/Paris')) < 6 then
      v_left := v_left - 1;
    end if;
  end loop;
  return v_at;
end;
$$;

revoke all on function private.add_working_days(timestamptz, integer) from public;

-- (received_at, deadline_at) of an order's goods; both null while some goods have
-- not left or a parcel is lost; (null, null) as well when nothing physical was bought.
create or replace function private.order_withdrawal_period(p_order_id uuid)
returns table (received_at timestamptz, deadline_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order    public.orders;
  v_units    integer;
  v_shipped  integer;
  v_received timestamptz;
  v_day      date;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    return;
  end if;

  -- Physical units still due (refunded units are not).
  select coalesce(sum(greatest(i.quantity - coalesce((
           select sum(ri.quantity) from public.refund_items ri
             join public.refunds r on r.id = ri.refund_id and r.status = 'succeeded'
            where ri.order_item_id = i.id), 0), 0)), 0)
    into v_units
    from public.order_items i
    join public.products p on p.id = i.product_id
   where i.order_id = p_order_id and i.course_id is null and p.product_type = 'physical';

  select coalesce(sum(si.quantity), 0) into v_shipped
    from public.shipment_items si
    join public.shipments s on s.id = si.shipment_id
   where s.order_id = p_order_id and s.status in ('shipped', 'delivered', 'returned');

  if v_units = 0 or v_shipped < v_units then
    received_at := null;
    deadline_at := null;
    return next;
    return;
  end if;

  select max(coalesce(
           s.delivered_at,
           greatest(
             ((s.estimated_delivery + 1)::timestamp at time zone 'Europe/Paris') - interval '1 second',
             private.add_working_days(s.shipped_at, coalesce(v_order.shipping_max_days, 7)))))
    into v_received
    from public.shipments s
   where s.order_id = p_order_id and s.status in ('shipped', 'delivered', 'returned');

  if v_received is null then
    received_at := null;
    deadline_at := null;
    return next;
    return;
  end if;

  -- The day of receipt is not counted; the 14th day after it is the last one.
  v_day := (v_received at time zone 'Europe/Paris')::date + 14;
  if extract(isodow from v_day) = 6 then v_day := v_day + 2;
  elsif extract(isodow from v_day) = 7 then v_day := v_day + 1;
  end if;

  received_at := v_received;
  deadline_at := ((v_day + 1)::timestamp at time zone 'Europe/Paris');
  return next;
end;
$$;

revoke all on function private.order_withdrawal_period(uuid) from public;

-- -----------------------------------------------------------------------------
-- 4. What can be withdrawn
-- -----------------------------------------------------------------------------
-- Units of a line that are still the customer's to withdraw: bought, minus
-- refunded or being refunded, minus those in a withdrawal not refused (a
-- refunded withdrawal's units are counted once, by its refund).
create or replace function private.order_item_withdrawable(p_order_item_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(i.quantity
    - coalesce((select sum(ri.quantity) from public.refund_items ri
                  join public.refunds r on r.id = ri.refund_id and r.status in ('pending', 'succeeded')
                 where ri.order_item_id = i.id), 0)
    - coalesce((select sum(wi.quantity) from public.order_withdrawal_items wi
                  join public.order_withdrawals w on w.id = wi.withdrawal_id and w.status in ('declared', 'return_received')
                 where wi.order_item_id = i.id
                   and not exists (select 1 from public.refunds r
                                    where r.withdrawal_id = w.id and r.status in ('pending', 'succeeded'))), 0), 0)::integer
    from public.order_items i
   where i.id = p_order_item_id;
$$;

revoke all on function private.order_item_withdrawable(uuid) from public;

-- Why the function is closed for this order (null: open).
create or replace function private.order_withdrawal_closed_reason(p_order public.orders, p_deadline timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_order.payment_status not in ('paid', 'partially_refunded') or p_order.status = 'cancelled' then 'not_paid'
    when coalesce(nullif(btrim(p_order.billing_address ->> 'vat_number'), ''), '') <> '' then 'professional'
    when p_deadline is not null and now() >= p_deadline then 'deadline_passed'
  end;
$$;

revoke all on function private.order_withdrawal_closed_reason(public.orders, timestamptz) from public;

-- Suggested refund of a withdrawal (staff only): the lines' paid value, plus the
-- order's delivery when the withdrawal takes back every physical unit bought.
create or replace function private.order_withdrawal_suggested_refund(p_withdrawal_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  with w as (select * from public.order_withdrawals where id = p_withdrawal_id),
  lines as (
    select round((i.subtotal_amount - coalesce(i.discount_amount, 0)) * wi.quantity / i.quantity, 2) as value,
           wi.quantity
      from public.order_withdrawal_items wi
      join public.order_items i on i.id = wi.order_item_id
     where wi.withdrawal_id = p_withdrawal_id
  ),
  physical as (
    select coalesce(sum(i.quantity), 0) as units
      from public.order_items i join public.products p on p.id = i.product_id, w
     where i.order_id = w.order_id and i.course_id is null and p.product_type = 'physical'
  )
  select coalesce((select sum(value) from lines), 0)
       + case when (select coalesce(sum(quantity), 0) from lines) >= (select units from physical)
              then (select o.shipping_amount from public.orders o, w where o.id = w.order_id) else 0 end;
$$;

revoke all on function private.order_withdrawal_suggested_refund(uuid) from public;

-- The whole picture for one order: open or not, the period, each line, and the
-- withdrawals already declared (with their state). p_staff adds what only the
-- team sees (suggested refund, refund state).
create or replace function private.order_withdrawal_overview(p_order_id uuid, p_staff boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order    public.orders;
  v_period   record;
  v_reason   text;
  v_lines    jsonb;
  v_open     boolean;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then
    return null;
  end if;
  select * into v_period from private.order_withdrawal_period(p_order_id);
  v_reason := private.order_withdrawal_closed_reason(v_order, v_period.deadline_at);

  select coalesce(jsonb_agg(jsonb_build_object(
           'order_item_id', i.id,
           'product_name', i.product_name,
           'variant_name', i.variant_name,
           'quantity', i.quantity,
           'withdrawable', case when x.excluded is null then private.order_item_withdrawable(i.id) else 0 end,
           'excluded', x.excluded,
           'hygiene_seal', coalesce(p.withdrawal_hygiene_seal, false))
           order by i.created_at, i.id), '[]'::jsonb)
    into v_lines
    from public.order_items i
    left join public.products p on p.id = i.product_id
    cross join lateral (select case
                          when i.course_id is not null then 'course'
                          when p.product_type = 'gift_card' then 'gift_card'
                          when p.product_type is distinct from 'physical' then 'digital'
                        end as excluded) x
   where i.order_id = p_order_id;

  v_open := v_reason is null
            and exists (select 1 from jsonb_array_elements(v_lines) l where (l ->> 'withdrawable')::integer > 0);
  if v_reason is null and not v_open then
    v_reason := 'nothing_left';
  end if;

  return jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'open', v_open,
    'reason', v_reason,
    'received_at', v_period.received_at,
    'deadline_at', v_period.deadline_at,
    'lines', v_lines,
    'withdrawals', (select coalesce(jsonb_agg(jsonb_build_object(
                      'id', w.id,
                      'status', w.status,
                      'customer_name', w.customer_name,
                      'channel', w.channel,
                      'declared_at', w.declared_at,
                      'deadline_at', w.deadline_at,
                      'return_received_at', w.return_received_at,
                      'refunded_at', w.refunded_at,
                      'refused_at', w.refused_at,
                      'refusal_reason', w.refusal_reason,
                      'refusal_note', w.refusal_note,
                      'refund_status', (select r.status from public.refunds r where r.withdrawal_id = w.id
                                         order by r.created_at desc limit 1),
                      'items', (select coalesce(jsonb_agg(jsonb_build_object(
                                  'order_item_id', wi.order_item_id, 'product_name', i.product_name,
                                  'variant_name', i.variant_name, 'quantity', wi.quantity, 'seal_opened', wi.seal_opened)
                                  order by i.created_at, i.id), '[]'::jsonb)
                                  from public.order_withdrawal_items wi
                                  join public.order_items i on i.id = wi.order_item_id
                                 where wi.withdrawal_id = w.id))
                      || case when p_staff then jsonb_build_object(
                           'suggested_refund', private.order_withdrawal_suggested_refund(w.id),
                           'refund_id', (select r.id from public.refunds r where r.withdrawal_id = w.id
                                          order by r.created_at desc limit 1))
                         else '{}'::jsonb end
                      order by w.declared_at), '[]'::jsonb)
                      from public.order_withdrawals w where w.order_id = p_order_id));
end;
$$;

revoke all on function private.order_withdrawal_overview(uuid, boolean) from public;

create or replace function public.order_withdrawal_options(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'order_withdrawal_options: sign in first' using errcode = '42501';
  end if;
  select o.user_id into v_owner from public.orders o where o.id = p_order_id;
  if v_owner is distinct from v_uid and not private.is_staff() then
    raise exception 'order_withdrawal_options: not your order' using errcode = '42501';
  end if;
  return private.order_withdrawal_overview(p_order_id, private.is_staff() and v_owner is distinct from v_uid);
end;
$$;

revoke all on function public.order_withdrawal_options(uuid) from public, anon;
grant execute on function public.order_withdrawal_options(uuid) to authenticated;

comment on function public.order_withdrawal_options(uuid) is
  'What the order''s owner (or staff) can withdraw now: open/reason, period, lines, withdrawals declared (decision 131).';

-- The order a valid guest link opens (null when the token is unknown or expired).
create or replace function private.order_withdrawal_link_order(p_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.order_id
    from public.order_withdrawal_links l
   where p_token ~ '^[0-9a-f]{64}$'
     and l.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and l.expires_at > now()
   limit 1;
$$;

revoke all on function private.order_withdrawal_link_order(text) from public;

create or replace function public.order_withdrawal_options_by_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order uuid := private.order_withdrawal_link_order(p_token);
begin
  if v_order is null then
    return null;
  end if;
  return private.order_withdrawal_overview(v_order, false);
end;
$$;

revoke all on function public.order_withdrawal_options_by_token(text) from public, anon, authenticated;
grant execute on function public.order_withdrawal_options_by_token(text) to service_role;

-- -----------------------------------------------------------------------------
-- 5. Guest link and throttles
-- -----------------------------------------------------------------------------
create or replace function public.order_withdrawal_ip_allowed(p_ip_hash text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.hit_rate_limit('order_withdrawal_ip', p_ip_hash, 10, interval '1 hour');
$$;

revoke all on function public.order_withdrawal_ip_allowed(text) from public, anon, authenticated;
grant execute on function public.order_withdrawal_ip_allowed(text) to service_role;

-- {status: 'ok', link_id, token, order_id, order_number, email, locale, first_name}
-- | {status: 'none'} (no such paid order for that address) | {status: 'throttled'}.
-- The Edge Function answers the visitor the same way in every case.
create or replace function public.request_order_withdrawal_link(p_order_number text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text := upper(btrim(coalesce(p_order_number, '')));
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_order  public.orders;
  v_token  text;
  v_link   uuid;
begin
  if v_number !~ '^[A-Z0-9-]{3,40}$' or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or char_length(v_email) > 254 then
    raise exception 'request_order_withdrawal_link: invalid order number or e-mail' using errcode = '22023';
  end if;
  -- Counted before the lookup, so an attempt on a wrong pair costs the same.
  if not private.hit_rate_limit('order_withdrawal_link', v_email || ':' || v_number, 3, interval '1 hour') then
    return jsonb_build_object('status', 'throttled');
  end if;

  select * into v_order
    from public.orders o
   where upper(o.order_number) = v_number
     and lower(o.customer_email) = v_email
     and o.payment_status in ('paid', 'partially_refunded', 'refunded')
   limit 1;
  if v_order.id is null then
    return jsonb_build_object('status', 'none');
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.order_withdrawal_links (order_id, token_hash, expires_at)
  values (v_order.id, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '48 hours')
  returning id into v_link;

  return jsonb_build_object(
    'status', 'ok',
    'link_id', v_link,
    'token', v_token,
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'email', v_order.customer_email,
    'locale', coalesce(v_order.locale, 'fr'),
    'first_name', coalesce(nullif(btrim(v_order.billing_address ->> 'first_name'), ''), ''));
end;
$$;

revoke all on function public.request_order_withdrawal_link(text, text) from public, anon, authenticated;
grant execute on function public.request_order_withdrawal_link(text, text) to service_role;

-- -----------------------------------------------------------------------------
-- 6. The declaration
-- -----------------------------------------------------------------------------
-- Refusals are SQLSTATE 23514 with the message 'order_withdrawal: <code>':
--   not_paid | professional | deadline_passed | professional_buyer | excluded_line
--   | unsealed_hygiene | quantity
-- Bad input is 22023 ('order_withdrawal: invalid <field>' or 'seal_answer_required');
-- an unknown order / wrong owner / invalid link is 42501.
create or replace function public.declare_order_withdrawal(
  p_order_id      uuid,
  p_customer_name text,
  p_items         jsonb,
  p_as_consumer   boolean,
  p_user_id       uuid default null,
  p_link_token    text default null,
  p_locale        text default null
)
returns public.order_withdrawals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order    public.orders;
  v_channel  text;
  v_period   record;
  v_reason   text;
  v_name     text := btrim(coalesce(p_customer_name, ''));
  v_item     jsonb;
  v_line     record;
  v_qty      integer;
  v_opened   boolean;
  v_seen     uuid[] := '{}';
  v_row      public.order_withdrawals;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'order_withdrawal: unknown order' using errcode = '42501';
  end if;

  if p_user_id is not null and v_order.user_id = p_user_id then
    v_channel := 'account';
  elsif p_link_token is not null and private.order_withdrawal_link_order(p_link_token) = v_order.id then
    v_channel := 'email_link';
  else
    raise exception 'order_withdrawal: not allowed' using errcode = '42501';
  end if;

  if char_length(v_name) not between 1 and 200 then
    raise exception 'order_withdrawal: invalid name' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'order_withdrawal: invalid items' using errcode = '22023';
  end if;

  select * into v_period from private.order_withdrawal_period(v_order.id);
  v_reason := private.order_withdrawal_closed_reason(v_order, v_period.deadline_at);
  if v_reason is not null then
    raise exception 'order_withdrawal: %', v_reason using errcode = '23514';
  end if;
  -- Professionals have no right of withdrawal (L221-3 aside): the customer says so.
  if p_as_consumer is distinct from true then
    raise exception 'order_withdrawal: professional_buyer' using errcode = '23514';
  end if;

  insert into public.order_withdrawals (order_id, user_id, channel, customer_name, email, locale, deadline_at)
  values (v_order.id, coalesce(v_order.user_id, p_user_id), v_channel, v_name, lower(v_order.customer_email),
          case when coalesce(p_locale, v_order.locale) = 'en' then 'en' else 'fr' end, v_period.deadline_at)
  returning * into v_row;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item ->> 'order_item_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(v_item -> 'quantity') <> 'number'
       or (v_item ? 'seal_opened' and jsonb_typeof(v_item -> 'seal_opened') not in ('boolean', 'null')) then
      raise exception 'order_withdrawal: invalid items' using errcode = '22023';
    end if;
    if (v_item ->> 'quantity')::numeric <> trunc((v_item ->> 'quantity')::numeric)
       or (v_item ->> 'quantity')::numeric not between 1 and 10000 then
      raise exception 'order_withdrawal: invalid items' using errcode = '22023';
    end if;
    v_qty := (v_item ->> 'quantity')::integer;
    if (v_item ->> 'order_item_id')::uuid = any (v_seen) then
      raise exception 'order_withdrawal: invalid items' using errcode = '22023';
    end if;
    v_seen := v_seen || (v_item ->> 'order_item_id')::uuid;
    v_opened := case when jsonb_typeof(v_item -> 'seal_opened') = 'boolean' then (v_item ->> 'seal_opened')::boolean end;

    select i.id, i.course_id, p.product_type, coalesce(p.withdrawal_hygiene_seal, false) as hygiene
      into v_line
      from public.order_items i
      left join public.products p on p.id = i.product_id
     where i.id = (v_item ->> 'order_item_id')::uuid and i.order_id = v_order.id
     for update of i;
    if v_line.id is null then
      raise exception 'order_withdrawal: invalid items' using errcode = '22023';
    end if;
    if v_line.course_id is not null or v_line.product_type is distinct from 'physical' then
      raise exception 'order_withdrawal: excluded_line' using errcode = '23514';
    end if;
    if v_line.hygiene then
      if v_opened is null then
        raise exception 'order_withdrawal: seal_answer_required' using errcode = '22023';
      elsif v_opened then
        raise exception 'order_withdrawal: unsealed_hygiene' using errcode = '23514';
      end if;
    else
      v_opened := null;
    end if;
    if v_qty > private.order_item_withdrawable(v_line.id) then
      raise exception 'order_withdrawal: quantity' using errcode = '23514';
    end if;

    insert into public.order_withdrawal_items (withdrawal_id, order_item_id, quantity, seal_opened)
    values (v_row.id, v_line.id, v_qty, v_opened);
  end loop;

  return v_row;
end;
$$;

revoke all on function public.declare_order_withdrawal(uuid, text, jsonb, boolean, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.declare_order_withdrawal(uuid, text, jsonb, boolean, uuid, text, text) to service_role;

comment on function public.declare_order_withdrawal(uuid, text, jsonb, boolean, uuid, text, text) is
  'The withdrawal declaration (L221-21, decision 131): the order''s owner (p_user_id) or a guest holding a valid '
  'link (p_link_token). Checks the period, the lines (goods only), quantities, sealed hygiene products and the '
  'consumer status. Service role only (Edge Function order-withdrawal), which then sends the acknowledgement.';

-- -----------------------------------------------------------------------------
-- 7. The team
-- -----------------------------------------------------------------------------
create or replace function public.admin_withdrawal_return_received(p_withdrawal_id uuid)
returns public.order_withdrawals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.order_withdrawals;
begin
  if not private.has_permission('manage_orders') then
    raise exception 'admin_withdrawal_return_received: not allowed' using errcode = '42501';
  end if;
  update public.order_withdrawals
     set status = 'return_received', return_received_at = now(), handled_by = auth.uid()
   where id = p_withdrawal_id and status = 'declared'
  returning * into v_row;
  if v_row.id is null then
    raise exception 'admin_withdrawal_return_received: not a declared withdrawal' using errcode = '23514';
  end if;
  return v_row;
end;
$$;

revoke all on function public.admin_withdrawal_return_received(uuid) from public, anon;
grant execute on function public.admin_withdrawal_return_received(uuid) to authenticated;

create or replace function public.admin_refuse_withdrawal(p_withdrawal_id uuid, p_reason text, p_note text default null)
returns public.order_withdrawals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.order_withdrawals;
begin
  if not private.has_permission('manage_orders') then
    raise exception 'admin_refuse_withdrawal: not allowed' using errcode = '42501';
  end if;
  if p_reason is null or p_reason not in ('deadline_passed', 'unsealed_hygiene', 'professional_buyer',
                                          'goods_not_returned', 'goods_damaged', 'other') then
    raise exception 'admin_refuse_withdrawal: invalid reason' using errcode = '22023';
  end if;
  if char_length(p_note) > 500 or (p_reason = 'other' and nullif(btrim(coalesce(p_note, '')), '') is null) then
    raise exception 'admin_refuse_withdrawal: invalid note' using errcode = '22023';
  end if;
  if exists (select 1 from public.refunds r
              where r.withdrawal_id = p_withdrawal_id and r.status in ('pending', 'succeeded')) then
    raise exception 'admin_refuse_withdrawal: a refund is under way' using errcode = '23514';
  end if;
  update public.order_withdrawals
     set status = 'refused', refused_at = now(), refusal_reason = p_reason,
         refusal_note = nullif(btrim(coalesce(p_note, '')), ''), handled_by = auth.uid()
   where id = p_withdrawal_id and status in ('declared', 'return_received')
  returning * into v_row;
  if v_row.id is null then
    raise exception 'admin_refuse_withdrawal: the withdrawal is already settled' using errcode = '23514';
  end if;
  return v_row;
end;
$$;

revoke all on function public.admin_refuse_withdrawal(uuid, text, text) from public, anon;
grant execute on function public.admin_refuse_withdrawal(uuid, text, text) to authenticated;

-- The card refund of a withdrawal: request_refund() with the withdrawal's lines,
-- reason 'return', linked to it. Called by the Edge Function refund-order with
-- the caller's JWT, which then sends it to Stripe.
create or replace function public.request_withdrawal_refund(
  p_withdrawal_id uuid,
  p_order_id      uuid,
  p_amount        numeric,
  p_restock       boolean default false
)
returns public.refunds
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row    public.order_withdrawals;
  v_items  jsonb;
  v_refund public.refunds;
begin
  if not private.has_permission('manage_orders') then
    raise exception 'request_withdrawal_refund: not allowed' using errcode = '42501';
  end if;
  select * into v_row from public.order_withdrawals where id = p_withdrawal_id for update;
  if v_row.id is null or v_row.order_id is distinct from p_order_id then
    raise exception 'request_withdrawal_refund: unknown withdrawal' using errcode = '22023';
  end if;
  if v_row.status not in ('declared', 'return_received') then
    raise exception 'request_withdrawal_refund: the withdrawal is already settled' using errcode = '23514';
  end if;
  if exists (select 1 from public.refunds r
              where r.withdrawal_id = p_withdrawal_id and r.status in ('pending', 'succeeded')) then
    raise exception 'request_withdrawal_refund: a refund is under way' using errcode = '23514';
  end if;

  select jsonb_agg(jsonb_build_object('order_item_id', wi.order_item_id, 'quantity', wi.quantity))
    into v_items
    from public.order_withdrawal_items wi where wi.withdrawal_id = p_withdrawal_id;

  v_refund := public.request_refund(p_order_id, p_amount, 'return', coalesce(v_items, '[]'::jsonb), coalesce(p_restock, false));
  update public.refunds set withdrawal_id = p_withdrawal_id where id = v_refund.id returning * into v_refund;
  return v_refund;
end;
$$;

revoke all on function public.request_withdrawal_refund(uuid, uuid, numeric, boolean) from public, anon;
grant execute on function public.request_withdrawal_refund(uuid, uuid, numeric, boolean) to authenticated;

-- A confirmed refund settles its withdrawal (stripe-webhook → mark_refund_succeeded).
create or replace function private.order_withdrawal_refund_settled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.withdrawal_id is not null and new.status = 'succeeded' and old.status is distinct from 'succeeded' then
    update public.order_withdrawals
       set status = 'refunded', refunded_at = coalesce(new.processed_at, now())
     where id = new.withdrawal_id and status in ('declared', 'return_received');
  end if;
  return null;
end;
$$;

create trigger refunds_zz_settle_withdrawal
  after update of status on public.refunds
  for each row execute function private.order_withdrawal_refund_settled();

-- -----------------------------------------------------------------------------
-- 8. E-mails: the acknowledgement (order_withdrawal:<id>) and the guest link
-- -----------------------------------------------------------------------------
create or replace function public.pending_order_withdrawal_emails(p_limit integer default 25)
returns table (
  withdrawal_id  uuid,
  order_id       uuid,
  order_number   text,
  email          text,
  locale         text,
  customer_name  text,
  declared_at    timestamptz,
  is_member      boolean,
  items          jsonb,
  return_address text
)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, o.id, o.order_number, w.email, w.locale, w.customer_name, w.declared_at, o.user_id is not null,
         (select coalesce(jsonb_agg(jsonb_build_object('name', i.product_name, 'variant', i.variant_name,
                                                      'quantity', wi.quantity) order by i.created_at, i.id), '[]'::jsonb)
            from public.order_withdrawal_items wi join public.order_items i on i.id = wi.order_item_id
           where wi.withdrawal_id = w.id),
         (select nullif(concat_ws(', ',
                   coalesce(s.trading_name, s.store_name),
                   s.address_line1, s.address_line2,
                   nullif(btrim(concat_ws(' ', s.postal_code, s.city)), ''),
                   s.country_code), '')
            from public.store_settings s limit 1)
    from public.order_withdrawals w
    join public.orders o on o.id = w.order_id
   where w.declared_at >= now() - interval '7 days'
     and private.email_event_open('order_withdrawal:' || w.id::text)
   order by w.declared_at
   limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.pending_order_withdrawal_emails(integer) from public, anon, authenticated;
grant execute on function public.pending_order_withdrawal_emails(integer) to service_role;

insert into public.email_templates (key, name, description, subject, preheader, body, variables, translation_priority) values
  ('order_withdrawal_confirmation', 'Shop withdrawal acknowledged',
   'Sent at once when a customer withdraws from a shop order online (L221-21): the declaration, its date and time, and how to send the goods back',
   'Votre rétractation pour la commande {{order_number}} est enregistrée',
   'Accusé de réception de votre rétractation.',
   E'Bonjour {{customer_name}},\n\nNous avons bien reçu votre rétractation pour la commande {{order_number}}. Cet e-mail en est l''accusé de réception : conservez-le.\n\nVous trouverez ci-dessous le contenu de votre déclaration, puis la marche à suivre pour nous renvoyer les articles. Nous vous remboursons dès réception et contrôle du retour, sur le moyen de paiement utilisé pour la commande.',
   array['customer_name', 'order_number'], 'high'),
  ('order_withdrawal_link', 'Shop withdrawal link (guest)',
   'Sent when a visitor asks to withdraw from an order placed without an account: a link valid 48 hours',
   'Votre lien pour vous rétracter de la commande {{order_number}}',
   'Ce lien est valable 48 heures.',
   E'Bonjour,\n\nVous avez demandé à vous rétracter de la commande {{order_number}}. Ouvrez le lien ci-dessous pour choisir les articles concernés et confirmer votre rétractation. Il est valable 48 heures.\n\nSi vous n''êtes pas à l''origine de cette demande, ignorez cet e-mail : rien ne sera fait sans votre confirmation.',
   array['order_number'], 'high');

insert into public.email_template_translations (template_id, locale, subject, preheader, body, status)
select t.id, 'en', v.subject, v.preheader, v.body, 'published'
  from (values
    ('order_withdrawal_confirmation', 'Your withdrawal from order {{order_number}} is recorded',
     'Acknowledgement of your withdrawal.',
     E'Hello {{customer_name}},\n\nWe have received your withdrawal from order {{order_number}}. This e-mail is its acknowledgement of receipt: please keep it.\n\nBelow you will find what you declared, then how to send the items back to us. We refund you as soon as the return is received and checked, to the payment method used for the order.'),
    ('order_withdrawal_link', 'Your link to withdraw from order {{order_number}}',
     'This link is valid for 48 hours.',
     E'Hello,\n\nYou asked to withdraw from order {{order_number}}. Open the link below to choose the items concerned and confirm your withdrawal. It is valid for 48 hours.\n\nIf you did not ask for this, ignore this e-mail: nothing will happen without your confirmation.')
  ) as v(key, subject, preheader, body)
  join public.email_templates t on t.key = v.key;

-- -----------------------------------------------------------------------------
-- 9. Personal data: the export lists each order's withdrawals; the purge drops
--    expired guest links. Withdrawals stay with the order after an erasure
--    (user_id set null), like the order itself.
-- -----------------------------------------------------------------------------

create or replace function public.my_personal_data()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_user    auth.users;
  v_email   text;
  v_last    timestamptz;
  v_archive jsonb;
begin
  if v_uid is null then
    raise exception 'my_personal_data: sign in first' using errcode = '42501';
  end if;
  select * into v_user from auth.users where id = v_uid;
  if v_user.id is null then
    raise exception 'my_personal_data: unknown account' using errcode = '42501';
  end if;

  select max(r.ready_at) into v_last
    from public.data_export_requests r
   where r.user_id = v_uid and r.status = 'delivered';
  if v_last > now() - interval '5 minutes' then
    return jsonb_build_object('status', 'too_soon', 'retry_at', v_last + interval '5 minutes');
  end if;

  -- Guest orders placed with the account's address belong to the member only
  -- once that address is confirmed.
  v_email := case when v_user.email_confirmed_at is not null then lower(v_user.email) end;

  v_archive := jsonb_build_object(
    'format', 'global-toothgems-personal-data/2',
    'generated_at', now(),
    'account', jsonb_build_object(
      'id', v_user.id,
      'email', v_user.email,
      'email_confirmed_at', v_user.email_confirmed_at,
      'created_at', v_user.created_at,
      'last_sign_in_at', v_user.last_sign_in_at,
      'sign_in_methods', coalesce(v_user.raw_app_meta_data -> 'providers', '[]'::jsonb)),
    'profile', (select private.personal_data_clean(to_jsonb(p)) from public.profiles p where p.id = v_uid),
    'addresses', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(a)) order by a.created_at), '[]')
                    from public.customer_addresses a where a.user_id = v_uid),
    'consents', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(c)) order by c.created_at), '[]')
                   from public.consent_records c where c.user_id = v_uid),
    'newsletter', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(n))), '[]')
                     from public.newsletter_subscriptions n
                    where n.user_id = v_uid or (v_email is not null and lower(n.email) = v_email)),

    'shop', jsonb_build_object(
      'orders', (select coalesce(jsonb_agg(
                   private.personal_data_clean(to_jsonb(o)) || jsonb_build_object(
                     'items', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(i)) order by i.created_at), '[]')
                                 from public.order_items i where i.order_id = o.id),
                     'parcels', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(s)) order by s.created_at), '[]')
                                   from public.shipments s where s.order_id = o.id),
                     'refunds', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(r)) order by r.created_at), '[]')
                                   from public.refunds r where r.order_id = o.id),
                     'withdrawals', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(w)) || jsonb_build_object(
                                       'items', (select coalesce(jsonb_agg(to_jsonb(wi) - 'withdrawal_id'), '[]')
                                                   from public.order_withdrawal_items wi where wi.withdrawal_id = w.id))
                                       order by w.declared_at), '[]')
                                       from public.order_withdrawals w where w.order_id = o.id),
                     'documents', (select coalesce(jsonb_agg(jsonb_build_object(
                                     'number', d.invoice_number, 'kind', d.kind, 'issued_at', d.issued_at,
                                     'total_incl_tax', d.total_incl_tax, 'currency', d.currency, 'buyer', d.buyer)
                                     order by d.issued_at), '[]')
                                     from public.invoices d where d.order_id = o.id))
                   order by o.created_at), '[]')
                   from public.orders o
                  where o.user_id = v_uid
                     or (o.user_id is null and v_email is not null and lower(o.customer_email) = v_email)),
      'gift_cards_bought', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(g)) order by g.created_at), '[]')
                              from public.gift_cards g where g.purchaser_user_id = v_uid),
      'loyalty_cards', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(l))), '[]')
                          from public.loyalty_cards l where l.user_id = v_uid),
      'loyalty_stamps', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(l))), '[]')
                           from public.loyalty_stamps l where l.user_id = v_uid),
      'favourites', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(w))), '[]')
                       from public.wishlist_items w where w.user_id = v_uid),
      'back_in_stock_alerts', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(b)) order by b.created_at), '[]')
                                 from public.back_in_stock_requests b
                                where b.user_id = v_uid or (v_email is not null and lower(b.email) = v_email)),
      'reviews', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(v)) || jsonb_build_object(
                    'photos', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(ph)) order by ph.position), '[]')
                                 from public.review_photos ph where ph.review_id = v.id))
                    order by v.created_at), '[]')
                    from public.reviews v where v.user_id = v_uid),
      'review_votes', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(h))), '[]')
                         from public.review_helpful_votes h where h.user_id = v_uid)),

    'academy', jsonb_build_object(
      'courses', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(e)) || jsonb_build_object('course_title', c.title)), '[]')
                    from public.course_entitlements e join public.courses c on c.id = e.course_id
                   where e.user_id = v_uid),
      'progress', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(lp)) order by lp.completed_at), '[]')
                     from public.lesson_progress lp where lp.user_id = v_uid),
      'quiz_attempts', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(q)) order by q.started_at), '[]')
                          from public.quiz_attempts q where q.user_id = v_uid),
      'certificates', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(cc)) || jsonb_build_object('course_title', c.title)), '[]')
                         from public.course_completions cc join public.courses c on c.id = cc.course_id
                        where cc.user_id = v_uid)),

    'studio', jsonb_build_object(
      'trial', (select private.personal_data_clean(to_jsonb(t)) from public.studio_trials t where t.user_id = v_uid),
      'subscriptions', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(s)) order by s.created_at), '[]')
                          from public.studio_subscriptions s where s.user_id = v_uid),
      'subscription_payments', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(si)) order by si.occurred_at), '[]')
                                  from public.studio_subscription_invoices si where si.user_id = v_uid),
      'withdrawals', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(w)) order by w.requested_at), '[]')
                        from public.studio_withdrawals w where w.user_id = v_uid),
      'documents', (select coalesce(jsonb_agg(jsonb_build_object(
                      'number', d.invoice_number, 'kind', d.kind, 'issued_at', d.issued_at,
                      'total_incl_tax', d.total_incl_tax, 'currency', d.currency, 'buyer', d.buyer)
                      order by d.issued_at), '[]')
                      from public.invoices d
                     where d.studio_invoice_id in (select si.stripe_invoice_id from public.studio_subscription_invoices si where si.user_id = v_uid)
                        or d.studio_withdrawal_id in (select w.id from public.studio_withdrawals w where w.user_id = v_uid)),
      'creations', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(cr)) order by cr.created_at), '[]')
                      from public.creations cr where cr.user_id = v_uid),
      'gem_groups', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(gg))), '[]')
                       from public.gem_groups gg where gg.user_id = v_uid),
      'share_links', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(sh)) order by sh.created_at), '[]')
                        from public.creation_shares sh where sh.user_id = v_uid),
      'collections', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(co))), '[]')
                        from public.studio_collections co where co.user_id = v_uid),
      'collection_entries', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(ce))), '[]')
                               from public.studio_collection_creations ce where ce.user_id = v_uid),
      'preferences', (select private.personal_data_clean(to_jsonb(sp)) from public.studio_preferences sp where sp.user_id = v_uid),
      'share_logo', (select private.personal_data_clean(to_jsonb(sl)) from public.studio_share_logos sl where sl.user_id = v_uid),
      'glowbook', (select private.personal_data_clean(to_jsonb(sc)) from public.studio_showcases sc where sc.user_id = v_uid),
      'glowbook_creations', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(it))), '[]')
                               from public.studio_showcase_items it where it.user_id = v_uid),
      'glowbook_sections', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(se))), '[]')
                              from public.studio_showcase_sections se where se.user_id = v_uid),
      'try_on_requests', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(tr)) order by tr.created_at), '[]')
                            from public.studio_try_on_requests tr where tr.user_id = v_uid),
      'feedback', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(f))), '[]')
                     from public.studio_feedback f where f.user_id = v_uid)),

    'community', jsonb_build_object(
      'lounge_profile', (select private.personal_data_clean(to_jsonb(lm)) from public.lounge_members lm where lm.user_id = v_uid),
      'messages', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(m)) order by m.created_at), '[]')
                     from public.lounge_messages m where m.author_id = v_uid),
      'reactions', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(lr))), '[]')
                      from public.lounge_reactions lr where lr.user_id = v_uid)),

    'customer_service', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(cq)) order by cq.created_at), '[]')
                           from public.contact_requests cq
                          where cq.user_id = v_uid or (v_email is not null and lower(cq.email) = v_email)),

    -- What the team recorded about the member: the right of access covers it.
    'customer_file', jsonb_build_object(
      'tags', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(ct))), '[]')
                 from public.customer_tags ct where ct.user_id = v_uid),
      'notes', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(cn)) order by cn.created_at), '[]')
                  from public.customer_notes cn where cn.user_id = v_uid)),

    'files', (select coalesce(jsonb_agg(jsonb_build_object(
                'bucket', o.bucket_id, 'path', o.name,
                'size', (o.metadata ->> 'size')::bigint, 'created_at', o.created_at)
                order by o.bucket_id, o.name), '[]')
                from storage.objects o
               where o.bucket_id = any (private.personal_file_buckets() || array['contact-attachments'])
                 and (storage.foldername(o.name))[1] = v_uid::text)
  );

  insert into public.data_export_requests (user_id, status, requested_at, ready_at)
  values (v_uid, 'delivered', now(), now());

  return jsonb_build_object('status', 'ok', 'archive', v_archive);
end;
$$;

revoke all on function public.my_personal_data() from public, anon;
grant execute on function public.my_personal_data() to authenticated;

comment on function public.my_personal_data() is
  'GDPR access/portability: the signed-in member''s personal data as one JSON archive ({status: ok, archive}), '
  'or {status: too_soon, retry_at} within 5 minutes of the previous one.';

-- Same purge as 20261108211113, plus the expired guest withdrawal links.
create or replace function private.purge_expired_personal_data(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tickets      uuid[];
  v_signups      uuid[];
  v_files        integer := 0;
  v_orphans      integer := 0;
  v_consents     integer := 0;
  v_back_in_stock integer := 0;
  v_throttles    integer := 0;
  v_links        integer := 0;
  v_count        integer;
  v_report       jsonb;
begin
  if p_now is null or p_now > now() + interval '1 day' then
    raise exception 'purge_expired_personal_data: invalid date' using errcode = '22023';
  end if;

  perform set_config('gt.retention_purge', 'on', true);

  -- Customer-service requests: 3 years after the last exchange.
  select coalesce(array_agg(r.id), '{}') into v_tickets
    from public.contact_requests r
   where greatest(r.created_at, r.updated_at,
                  coalesce(r.first_response_at, r.created_at),
                  coalesce(r.resolved_at, r.created_at),
                  coalesce((select max(greatest(n.created_at, n.updated_at))
                              from public.contact_request_notes n
                             where n.request_id = r.id), r.created_at))
         < p_now - interval '3 years';

  if cardinality(v_tickets) > 0 then
    insert into private.storage_purge_queue (bucket_id, name, reason)
    select distinct 'contact-attachments', p, 'contact_request_expired'
      from public.contact_requests r, unnest(r.attachment_paths) p
     where r.id = any (v_tickets)
    on conflict (bucket_id, name) do nothing;
    get diagnostics v_files = row_count;

    delete from public.contact_requests r where r.id = any (v_tickets);

    update public.audit_logs a
       set changes = jsonb_build_object('reason', 'retention_purge')
     where a.table_name = 'contact_requests'
       and a.record_id = any (select t::text from unnest(v_tickets) t);
  end if;

  -- Attachments no ticket references (the form was never sent).
  insert into private.storage_purge_queue (bucket_id, name, reason)
  select o.bucket_id, o.name, 'contact_attachment_orphan'
    from storage.objects o
   where o.bucket_id = 'contact-attachments'
     and o.created_at < p_now - interval '1 day'
     and not exists (select 1 from public.contact_requests r where o.name = any (r.attachment_paths))
  on conflict (bucket_id, name) do nothing;
  get diagnostics v_orphans = row_count;

  -- Consent proofs: 5 years after the consent ended or was replaced; the one in
  -- force is kept. Per-purchase waivers (Studio, courses): 5 years after the purchase.
  delete from public.consent_records c
   where c.created_at < p_now - interval '5 years'
     and (c.user_id is null
          or c.purpose in ('studio_immediate_access', 'course_immediate_access')
          or exists (select 1
                       from public.consent_records l
                      where l.user_id = c.user_id
                        and l.purpose = c.purpose
                        and (l.created_at, l.id) > (c.created_at, c.id)
                        and l.created_at < p_now - interval '5 years'));
  get diagnostics v_consents = row_count;

  -- Newsletter sign-ups never confirmed (never sent to Resend).
  with gone as (
    delete from public.newsletter_subscriptions n
     where n.status = 'pending'
       and n.contact_synced_at is null
       and coalesce(n.confirm_expires_at, n.created_at) < p_now - interval '30 days'
    returning n.id
  )
  select coalesce(array_agg(id), '{}') into v_signups from gone;

  if cardinality(v_signups) > 0 then
    update public.audit_logs a
       set changes = jsonb_build_object('reason', 'retention_purge')
     where a.table_name = 'newsletter_subscriptions'
       and a.record_id = any (select s::text from unnest(v_signups) s);
  end if;

  -- Back-in-stock alerts.
  delete from public.back_in_stock_requests b
   where (b.notified_at is not null and b.notified_at < p_now - interval '1 year')
      or (b.notified_at is null and b.created_at < p_now - interval '3 years');
  get diagnostics v_back_in_stock = row_count;

  -- Guest withdrawal links (decision 131): 30 days after they expired.
  delete from public.order_withdrawal_links l where l.expires_at < p_now - interval '30 days';
  get diagnostics v_links = row_count;

  -- Throttle ledgers left behind.
  delete from public.promotion_code_attempts where created_at < p_now - interval '1 day';
  get diagnostics v_count = row_count;
  v_throttles := v_throttles + v_count;
  delete from public.gift_card_code_attempts where created_at < p_now - interval '1 day';
  get diagnostics v_count = row_count;
  v_throttles := v_throttles + v_count;
  delete from public.promotion_email_lookups where created_at < p_now - interval '1 day';
  get diagnostics v_count = row_count;
  v_throttles := v_throttles + v_count;
  delete from private.rate_limit_hits where created_at < p_now - interval '7 days';
  get diagnostics v_count = row_count;
  v_throttles := v_throttles + v_count;

  perform set_config('gt.retention_purge', '', true);

  v_report := jsonb_build_object(
    'contact_requests',       cardinality(v_tickets),
    'attachments_queued',     v_files,
    'orphan_files_queued',    v_orphans,
    'consent_records',        v_consents,
    'newsletter_pending',     cardinality(v_signups),
    'back_in_stock_requests', v_back_in_stock,
    'throttle_rows',          v_throttles,
    'withdrawal_links',       v_links);

  if cardinality(v_tickets) + v_files + v_orphans + v_consents + cardinality(v_signups) + v_back_in_stock > 0 then
    insert into public.audit_logs (actor_id, actor_role, action, table_name, record_id, changes)
    values (null, 'retention_purge', 'delete', 'retention_purge', p_now::date::text,
            jsonb_build_object('reason', 'retention_purge') || v_report);
  end if;

  return v_report;
end;
$$;

revoke all on function private.purge_expired_personal_data(timestamptz) from public, anon, authenticated, service_role;

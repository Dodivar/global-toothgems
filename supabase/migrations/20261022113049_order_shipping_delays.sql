-- The delivery delay promised at checkout, kept on the order (decision 109).
--
-- The storefront shows each shipping rate as "min to max working days". The
-- order kept only a link to the rate (`shipping_rate_id`, set null when the
-- rate is deleted) and its name, so the promise changed with every later edit
-- of the rate and vanished with it. The two delays are now copied onto the
-- order when it is created, like the rate's name:
--
--   orders.shipping_min_days / shipping_max_days   working days, null when the
--     order ships nothing or has no rate
--
-- Filled by a BEFORE INSERT trigger from the rate the order names, so
-- create_order() (every version) needs no change and no caller can forget it.
-- The back office pre-fills a parcel's estimated delivery with the day it is
-- shipped + shipping_max_days working days (webapp/src/lib/workingDays.ts);
-- the date stays editable and the database never computes it.
--
-- Orders created before this migration take their rate's current delays
-- (pre-production: no customer order yet whose promise could differ).

alter table public.orders
  add column shipping_min_days integer check (shipping_min_days >= 0),
  add column shipping_max_days integer,
  add constraint orders_shipping_days check (
    (shipping_min_days is null) = (shipping_max_days is null)
    and (shipping_max_days is null or shipping_max_days >= shipping_min_days)
  );

comment on column public.orders.shipping_min_days is
  'Working days promised at checkout (lower bound), copied from shipping_rates at insert. Null = no rate.';
comment on column public.orders.shipping_max_days is
  'Working days promised at checkout (upper bound), copied from shipping_rates at insert. Null = no rate.';

create or replace function private.order_snapshot_shipping_days()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.shipping_rate_id is not null and new.shipping_max_days is null then
    select r.min_days, r.max_days
      into new.shipping_min_days, new.shipping_max_days
      from public.shipping_rates r
     where r.id = new.shipping_rate_id;
  end if;
  return new;
end;
$$;

revoke all on function private.order_snapshot_shipping_days() from public, anon, authenticated;

create trigger orders_snapshot_shipping_days
  before insert on public.orders
  for each row execute function private.order_snapshot_shipping_days();

update public.orders o
   set shipping_min_days = r.min_days,
       shipping_max_days = r.max_days
  from public.shipping_rates r
 where r.id = o.shipping_rate_id
   and o.shipping_max_days is null;

-- =============================================================================
-- Order staff notes out of the customer's reach
-- =============================================================================
-- Problem: `orders.admin_note` is a column of `orders`, and customers read
-- their own orders through RLS ("orders: owners and staff read"). RLS filters
-- rows, not columns, and staff use the same `authenticated` role, so a column
-- grant cannot tell them apart: any member could read the internal notes on
-- their own orders (including the checkout's "[auto] … stock insuffisant"
-- note) with a direct API call.
--
-- Fix: the note moves to `order_notes` (one row per order, staff only). A
-- trigger on `orders` moves whatever is written into `orders.admin_note`
-- (the stock-transition trigger's automatic notes, any older client) into
-- `order_notes` and blanks the column, so `orders.admin_note` stays NULL and
-- nothing else has to change in the checkout functions. The column is kept
-- (always NULL) until those functions are rewritten; dropping it is a
-- follow-up.
-- =============================================================================

create table public.order_notes (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null unique references public.orders (id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid()
);

comment on table public.order_notes is
  'Internal notes on an order (back office and automatic checkout notes). Staff only, never visible to the customer.';

alter table public.order_notes enable row level security;

revoke all on public.order_notes from anon;
revoke truncate, references, trigger on public.order_notes from authenticated;

create policy "order_notes: staff read"
  on public.order_notes for select to authenticated
  using ((select private.is_staff()));
create policy "order_notes: staff insert"
  on public.order_notes for insert to authenticated
  with check ((select private.has_permission('manage_orders')));
create policy "order_notes: staff update"
  on public.order_notes for update to authenticated
  using ((select private.has_permission('manage_orders')))
  with check ((select private.has_permission('manage_orders')));

create or replace function private.stamp_order_note()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'UPDATE' and new.order_id is distinct from old.order_id then
    raise exception 'order_notes: a note cannot move to another order' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger order_notes_stamp
  before insert or update on public.order_notes
  for each row execute function private.stamp_order_note();

create trigger order_notes_audit_log
  after insert or update or delete on public.order_notes
  for each row execute function private.audit_changes();

-- -----------------------------------------------------------------------------
-- Anything written to orders.admin_note is appended to order_notes.
-- Named to sort after orders_stock_transitions* (BEFORE triggers fire in name
-- order), so the automatic notes those triggers add are moved too.
-- -----------------------------------------------------------------------------
create or replace function private.move_order_admin_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(new.admin_note), '') is not null then
    insert into public.order_notes (order_id, body)
    values (new.id, new.admin_note)
    on conflict (order_id) do update
      set body = public.order_notes.body || E'\n\n' || excluded.body;
  end if;
  new.admin_note := null;
  return new;
end;
$$;

revoke all on function private.move_order_admin_note() from public, anon, authenticated;
revoke all on function private.stamp_order_note() from public, anon, authenticated;

-- Every UPDATE, not `update of admin_note`: a column list only sees the
-- columns the statement sets, not a note added by an earlier trigger.
-- Orders are never inserted with a note (the check below refuses one: the
-- order row does not exist yet for order_notes to point at).
create trigger orders_zz_move_admin_note
  before update on public.orders
  for each row execute function private.move_order_admin_note();

-- A note given at insert time is refused rather than stored readable.
alter table public.orders
  add constraint orders_admin_note_moved check (admin_note is null) not valid;

-- -----------------------------------------------------------------------------
-- Existing notes move over: setting the column again goes through the
-- trigger above, which appends it to order_notes and empties the column
-- (the audit log records the change, as for any note edit).
-- -----------------------------------------------------------------------------
update public.orders set admin_note = admin_note where admin_note is not null;

alter table public.orders validate constraint orders_admin_note_moved;

comment on column public.orders.admin_note is
  'Deprecated, always NULL: internal notes live in order_notes (staff only). Writes are moved there by orders_zz_move_admin_note.';

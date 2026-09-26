-- =============================================================================
-- Migration 010 — Administrative audit log (iteration 2)
-- =============================================================================
-- Records the security- and money-sensitive changes AGENTS.md / guideline 12
-- ask for: permission and account-status changes, order lifecycle changes,
-- price and publication changes, tax/shipping configuration changes, and
-- destructive operations. Written ONLY by triggers (security definer); nobody
-- can insert, edit or delete entries through the API. Admins can read them.
--
-- Stock changes are not duplicated here: inventory_movements is their ledger.
-- =============================================================================

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id    uuid references public.profiles (id) on delete set null,  -- null = backend / system
  actor_role  text not null,                                            -- database role that made the change
  action      text not null check (action in ('insert', 'update', 'delete')),
  table_name  text not null,
  record_id   text not null,
  changes     jsonb not null default '{}'::jsonb   -- update: {"col": {"old": .., "new": ..}}; insert/delete: full row
);

comment on table public.audit_logs is
  'Append-only admin audit trail, written by trigger. Read-only for admins; no API writes.';

create index audit_logs_record_idx on public.audit_logs (table_name, record_id, occurred_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, occurred_at desc) where actor_id is not null;
create index audit_logs_occurred_idx on public.audit_logs (occurred_at desc);

alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon;
revoke insert, update, delete, truncate, references, trigger on public.audit_logs from authenticated;

create policy "audit_logs: admins read"
  on public.audit_logs for select to authenticated
  using ((select private.is_admin()));

-- -----------------------------------------------------------------------------
-- Generic trigger. Trigger arguments = columns to watch on UPDATE; no
-- arguments = every column. Updates touching no watched column are skipped.
-- updated_at / updated_by are always ignored (noise).
-- -----------------------------------------------------------------------------
create or replace function private.audit_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old     jsonb;
  v_new     jsonb;
  v_changes jsonb := '{}'::jsonb;
  v_key     text;
  v_watch   text[] := tg_argv;
  v_row     jsonb;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    for v_key in select jsonb_object_keys(v_new)
    loop
      continue when v_key in ('updated_at', 'updated_by');
      continue when cardinality(v_watch) > 0 and not (v_key = any (v_watch));
      if v_old -> v_key is distinct from v_new -> v_key then
        v_changes := v_changes || jsonb_build_object(
          v_key, jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return null;
    end if;
  elsif tg_op = 'DELETE' then
    v_changes := to_jsonb(old);
  else
    v_changes := to_jsonb(new);
  end if;

  insert into public.audit_logs (actor_id, actor_role, action, table_name, record_id, changes)
  values (
    auth.uid(),
    coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', session_user::text),
    lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'key', v_row ->> 'country_code'),
    v_changes
  );
  return null;
end;
$$;

revoke all on function private.audit_changes() from public;

-- Accounts: permissions and moderation.
create trigger profiles_audit_log
  after update on public.profiles
  for each row execute function private.audit_changes('role', 'status');

-- Orders: lifecycle, payment, fulfilment, notes, cancellation. Deletions too.
create trigger orders_audit_log
  after update on public.orders
  for each row execute function private.audit_changes(
    'status', 'payment_status', 'fulfillment_status', 'admin_note', 'cancellation_reason');
create trigger orders_audit_log_delete
  after delete on public.orders
  for each row execute function private.audit_changes();

-- Catalogue: publication and price changes; every deletion.
create trigger products_audit_log
  after update on public.products
  for each row execute function private.audit_changes(
    'status', 'price', 'compare_at_price', 'currency', 'is_featured', 'tax_category', 'slug');
create trigger products_audit_log_delete
  after delete on public.products
  for each row execute function private.audit_changes();

create trigger product_variants_audit_log
  after update on public.product_variants
  for each row execute function private.audit_changes('price', 'compare_at_price', 'is_active', 'sku');
create trigger product_variants_audit_log_delete
  after delete on public.product_variants
  for each row execute function private.audit_changes();

create trigger categories_audit_log
  after update on public.categories
  for each row execute function private.audit_changes('is_active', 'slug');
create trigger categories_audit_log_delete
  after delete on public.categories
  for each row execute function private.audit_changes();

-- Money configuration: every change.
create trigger tax_rates_audit_log
  after insert or update or delete on public.tax_rates
  for each row execute function private.audit_changes();
create trigger shipping_rates_audit_log
  after insert or update or delete on public.shipping_rates
  for each row execute function private.audit_changes();
create trigger shipping_zones_audit_log
  after insert or update or delete on public.shipping_zones
  for each row execute function private.audit_changes();
create trigger shipping_zone_countries_audit_log
  after insert or delete on public.shipping_zone_countries
  for each row execute function private.audit_changes();

-- Roles table (new roles = permission model change).
create trigger roles_audit_log
  after insert or update or delete on public.roles
  for each row execute function private.audit_changes();

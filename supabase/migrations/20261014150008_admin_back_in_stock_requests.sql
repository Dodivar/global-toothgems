-- Back-office reading of the back-in-stock requests (decision 90, screen
-- /admin/alertes-stock): staff with `manage_products` see who waits for what,
-- whether the product is back, and how each e-mail went. Read-only; the table
-- itself stays closed to the API.
--
-- One row per request, newest first, with:
--   * the product and option names (French base) and the product's current
--     state (status, and the stock state of the requested target);
--   * the address, the member's account (null for a visitor) and the language;
--   * the e-mail's email_log status (null = not sent yet), so a request stuck
--     on a capped failure (decision 90 f) is visible.

create or replace function public.admin_back_in_stock_requests(p_limit integer default 1000)
returns table (
  id               uuid,
  product_id       uuid,
  product_name     text,
  product_status   text,
  variant_id       uuid,
  variant_name     text,
  email            text,
  user_id          uuid,
  locale           text,
  created_at       timestamptz,
  notified_at      timestamptz,
  stock_status     text,
  email_status     text,
  email_attempts   integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('manage_products') then
    raise exception 'admin_back_in_stock_requests: permission denied' using errcode = '42501';
  end if;
  return query
  select r.id, r.product_id, p.name, p.status, r.variant_id, v.name,
         r.email, r.user_id, r.locale, r.created_at, r.notified_at,
         -- No stock row = always sellable, as the storefront and the sweep read it.
         coalesce((select i.stock_status from public.inventory_items i
                    where (r.variant_id is not null and i.variant_id = r.variant_id)
                       or (r.variant_id is null and i.product_id = r.product_id)), 'in_stock'),
         e.status, e.attempt
    from public.back_in_stock_requests r
    join public.products p on p.id = r.product_id
    left join public.product_variants v on v.id = r.variant_id
    left join public.email_log e on e.event_key = 'back_in_stock:' || r.id::text
   order by r.created_at desc
   limit least(greatest(coalesce(p_limit, 1000), 1), 5000);
end;
$$;

revoke all on function public.admin_back_in_stock_requests(integer) from public, anon;
grant execute on function public.admin_back_in_stock_requests(integer) to authenticated, service_role;

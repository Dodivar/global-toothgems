-- Quick stock change from the back-office product list (decision 91): the
-- "Restock" pop-up adds the units received to a product or to one of its
-- variants, or corrects the count after a stocktake.
--
-- Why a function rather than admin_save_product(): that one writes the count
-- the form loaded, so a sale paid between loading the list and saving would be
-- overwritten. Here the change is relative and atomic:
--
--   * p_delta is added to quantity_on_hand in one UPDATE (positive = units
--     received, negative = units removed);
--   * p_expected, when given, is the count the administrator saw: if the shelf
--     moved since, nothing is written and 40001 is raised, so a correction to
--     an exact count never erases a sale it did not see;
--   * the result may not drop below zero nor below the units held by unpaid
--     orders (22023 with a readable hint);
--   * only a tracked stock row has a count (22023 otherwise).
--
-- The inventory_items_ledger trigger records the movement as an 'adjustment'
-- with the actor, so the change is audited without anything more. A restock
-- also feeds the back-in-stock sweep (decision 90) like any other stock change.

create or replace function public.admin_adjust_stock(
  p_product_id uuid,
  p_variant_id uuid,
  p_delta      integer,
  p_expected   integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.inventory_items;
begin
  if not private.has_permission('manage_products') then
    raise exception 'admin_adjust_stock: permission denied' using errcode = '42501';
  end if;
  if p_product_id is null or p_delta is null or p_delta = 0 or abs(p_delta) > 1000000 then
    raise exception 'admin_adjust_stock: invalid change' using errcode = '22023';
  end if;

  if p_variant_id is null then
    -- A product with variants keeps its stock on them.
    if exists (select 1 from public.product_variants v where v.product_id = p_product_id and v.is_active) then
      raise exception 'admin_adjust_stock: the product stock is per variant' using errcode = '22023';
    end if;
    select * into v_item from public.inventory_items i where i.product_id = p_product_id for update;
  else
    select i.* into v_item
      from public.inventory_items i
      join public.product_variants v on v.id = i.variant_id
     where i.variant_id = p_variant_id and v.product_id = p_product_id
       for update of i;
  end if;

  if not found then
    raise exception 'admin_adjust_stock: no stock row' using errcode = 'P0002';
  end if;
  if not v_item.track_inventory then
    raise exception 'admin_adjust_stock: stock not tracked' using errcode = '22023';
  end if;
  if p_expected is not null and v_item.quantity_on_hand <> p_expected then
    raise exception 'admin_adjust_stock: the stock changed meanwhile' using errcode = '40001';
  end if;
  if v_item.quantity_on_hand + p_delta < v_item.quantity_reserved then
    raise exception 'admin_adjust_stock: below the reserved units'
      using errcode = '22023', hint = 'reserved';
  end if;

  update public.inventory_items
     set quantity_on_hand = quantity_on_hand + p_delta,
         updated_at       = now(),
         updated_by       = auth.uid()
   where id = v_item.id
  returning * into v_item;

  return jsonb_build_object(
    'quantity_on_hand', v_item.quantity_on_hand,
    'quantity_reserved', v_item.quantity_reserved,
    'stock_status', v_item.stock_status
  );
end;
$$;

revoke all on function public.admin_adjust_stock(uuid, uuid, integer, integer) from public, anon;
grant execute on function public.admin_adjust_stock(uuid, uuid, integer, integer) to authenticated, service_role;

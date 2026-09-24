-- =============================================================================
-- Migration 012 — Fix consume_inventory() insufficient-stock detection
-- =============================================================================
-- Migration 009 reset the inventory context with PERFORM *before* testing
-- FOUND. PERFORM overwrites FOUND, so an insufficient-stock call returned NULL
-- instead of raising. Caught by the iteration 1 regression suite.
-- Fix: capture the UPDATE outcome before resetting the context.
-- =============================================================================

create or replace function public.consume_inventory(p_inventory_item_id uuid, p_quantity integer)
returns public.inventory_items
language plpgsql
set search_path = ''
as $$
declare
  result    public.inventory_items;
  v_updated boolean;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'consume_inventory: quantity must be positive' using errcode = '22023';
  end if;

  perform private.set_inventory_context('sale', null);

  update public.inventory_items
     set quantity_on_hand = case when track_inventory
                                 then quantity_on_hand - p_quantity
                                 else quantity_on_hand end
   where id = p_inventory_item_id
     and case when track_inventory
              then quantity_on_hand - quantity_reserved >= p_quantity
              else availability <> 'out_of_stock' end
  returning * into result;
  v_updated := found;

  perform private.set_inventory_context(null, null);

  if not v_updated then
    if exists (select 1 from public.inventory_items where id = p_inventory_item_id) then
      raise exception 'consume_inventory: insufficient stock' using errcode = 'P0001';
    else
      raise exception 'consume_inventory: inventory item not found' using errcode = 'P0002';
    end if;
  end if;

  return result;
end;
$$;

revoke all on function public.consume_inventory(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_inventory(uuid, integer) to service_role;

-- =============================================================================
-- 3D Studio: new saved-content limits (owner's request 2026-11-17)
-- =============================================================================
-- "Essential 10 creations and 3 Gem Groups; Artist x5 = 50 creations and 15
-- Gem Groups — it justifies the 19.90 EUR price better."
--
--   plan        creations   Gem Groups
--   essential   10          3
--   artist      50          15
--   atelier     unlimited   unlimited
--
-- Only the numbers change (decision 113 (a)); the triggers read this one
-- function. Nobody loses anything: editing, deleting and reading are never
-- limited, a member already above the new number simply cannot save a new
-- creation / Gem Group until they are under it again. Mirrored for display in
-- webapp/src/data/studio.ts.
-- =============================================================================

create or replace function private.studio_plan_limit(p_tier text, p_kind text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_tier
    when 'essential' then case p_kind when 'creations' then 10 when 'gem_groups' then 3 end
    when 'artist'    then case p_kind when 'creations' then 50 when 'gem_groups' then 15 end
  end;
$$;

-- The GLOBAL PRO MASTER PACK's copy names the Artist numbers (migration
-- 20261108171000); keep it true. Guarded by slug: nothing happens where the
-- pack does not exist (CI, a fresh stack).
update public.products
   set description = replace(description, 'Jusqu''à 150 créations et 30 Gem Groups', 'Jusqu''à 50 créations et 15 Gem Groups')
 where slug = 'global-pro-master-pack';

update public.product_translations t
   set description = replace(replace(t.description,
         'Jusqu''à 150 créations et 30 Gem Groups', 'Jusqu''à 50 créations et 15 Gem Groups'),
         'Up to 150 creations and 30 Gem Groups', 'Up to 50 creations and 15 Gem Groups')
  from public.products p
 where p.id = t.product_id and p.slug = 'global-pro-master-pack';

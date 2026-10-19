-- =============================================================================
-- 3D Studio Glowbook: one public creation in 3D (decision 99, owner's request 2026-10-19)
-- =============================================================================
-- Visitors of a Glowbook open a creation read-only in the 3D viewer
-- (/studio-3d/glowbook/<handle>/<item id>), as share links do, and can put
-- its gems in their cart. studio_public_showcase() returns the cards only;
-- this reader returns ONE creation's scene, under exactly the same rule:
-- the Glowbook is approved, its author has Studio access now, the item is
-- approved and belongs to that Glowbook. Nothing otherwise (null), never
-- the owner's id, tags, favourite flag or estimate. The Gem Group a piece
-- came from is the author's own library id: blanked, as for share links.
-- =============================================================================

create or replace function public.studio_public_showcase_creation(p_handle text, p_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'handle', s.handle,
           'display_name', s.display_name,
           'name', c.name,
           'description', c.description,
           'scene_data', c.scene_data || jsonb_build_object(
             'groups', coalesce((
               select jsonb_agg(g || jsonb_build_object('gemGroupId', null))
                 from jsonb_array_elements(case when jsonb_typeof(c.scene_data -> 'groups') = 'array'
                                                then c.scene_data -> 'groups' else '[]'::jsonb end) g
             ), '[]'::jsonb)),
           'updated_at', c.updated_at)
    from public.studio_showcases s
    join public.studio_showcase_items i on i.user_id = s.user_id and i.id = p_item_id and i.status = 'approved'
    join public.creations c on c.id = i.creation_id
   where s.handle = lower(btrim(p_handle))
     and s.status = 'approved'
     and private.studio_user_has_access(s.user_id);
$$;

comment on function public.studio_public_showcase_creation(text, uuid) is
  '3D Studio Glowbook: one approved creation of a public Glowbook, with its scene, for the read-only 3D viewer; null otherwise. No owner id or personal data.';

revoke all on function public.studio_public_showcase_creation(text, uuid) from public, anon;
grant execute on function public.studio_public_showcase_creation(text, uuid) to anon, authenticated, service_role;

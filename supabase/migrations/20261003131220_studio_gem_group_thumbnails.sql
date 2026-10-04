-- =============================================================================
-- 3D Studio: a captured render for each Gem Group, like the creations'.
-- =============================================================================
-- The image lives in the existing private `studio-thumbnails` bucket at
-- <auth.uid()>/groups/<group id>.jpg: the bucket's policies check only the
-- first folder (the owner), so no storage policy changes.
-- Validation: supabase/tests/studio_workspace_validation.sql
-- =============================================================================

alter table public.gem_groups
  add column thumbnail_path text
    check (thumbnail_path is null or thumbnail_path like user_id::text || '/%');

comment on column public.gem_groups.thumbnail_path is
  'Object path of the group''s captured render in the private studio-thumbnails bucket, inside the owner''s folder (<user id>/groups/<id>.jpg). Null: the card draws its preview.';

-- Owners write it like the other content columns (column-level grants).
grant insert (thumbnail_path) on public.gem_groups to authenticated;
grant update (thumbnail_path) on public.gem_groups to authenticated;

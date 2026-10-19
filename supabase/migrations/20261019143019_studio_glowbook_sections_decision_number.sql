-- Glowbook sections and certified badge: their decision is number 102 in
-- supabase/README.md (101 went to the social exports' plan branding,
-- migration 20261019142032, applied the same afternoon). Migration
-- 20261019142050 says "decision 101" in its header and in these comments;
-- the comments are restated with the right number. No behaviour change.
comment on table public.studio_showcase_sections is
  '3D Studio Glowbook: the sections of an artist''s Glowbook (decision 102). Owners read and delete theirs, moderators read all; written through studio_save_showcase_section() / studio_reorder_showcase_sections(); public through studio_public_showcase() only.';
comment on function public.studio_save_showcase_section(uuid, text) is
  '3D Studio Glowbook (decision 102): creates (null id) or renames one of the caller''s sections. Studio access + plan switch; at most 12; names unique per Glowbook (case-insensitive).';
comment on function public.studio_reorder_showcase_sections(uuid[]) is
  '3D Studio Glowbook (decision 102): sets the order of the caller''s sections (first = first on the page). Others'' rows are ignored.';
comment on function public.studio_set_showcase_item_section(uuid, uuid) is
  '3D Studio Glowbook (decision 102): files one of the caller''s Glowbook creations in one of their sections, or in none (null). Studio access + plan switch.';
comment on function public.studio_my_certification() is
  '3D Studio Glowbook (decision 102): the titles of the courses the caller completed with a certificate, [{fr, en}] — what their badge shows.';
comment on function public.studio_set_showcase_certification(boolean) is
  '3D Studio Glowbook (decision 102): shows or hides the "certified artist" badge on the caller''s page.';

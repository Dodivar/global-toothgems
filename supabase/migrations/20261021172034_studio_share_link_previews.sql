-- =============================================================================
-- 3D Studio share links: a preview card for social networks (decision 101, addendum 2026-10-21)
-- =============================================================================
-- A post shared on Facebook, X, Threads, WhatsApp or Pinterest carries the
-- creation's public link; the network reads the page's Open Graph tags to draw
-- its preview card. The read-only viewer of a share link (/studio-3d/partage/<token>)
-- now names the creation and shows its card render there.
--
--   * studio_shared_creation_preview(token): name, description and render path
--     of an active (not revoked) share link — what the page's metadata needs;
--   * "anyone reads renders of shared creations": the card render of a creation
--     with an active share link can be signed with the publishable key. The
--     link already shows the whole design to anyone who has it; the render
--     shows no more. Revoking the link closes both.
-- No link is ever created here: links are still made only by the member
-- (studio_share_creation, the share dialog or the export dialog's explicit button).
-- =============================================================================

create or replace function private.is_shared_creation_thumbnail(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.creations c
      join public.creation_shares s on s.creation_id = c.id and s.revoked_at is null
     where c.thumbnail_path = p_name
  );
$$;

comment on function private.is_shared_creation_thumbnail(text) is
  '3D Studio: whether a studio-thumbnails file is the card render of a creation with an active share link (decision 101 addendum).';

revoke all on function private.is_shared_creation_thumbnail(text) from public;
grant execute on function private.is_shared_creation_thumbnail(text) to anon, authenticated, service_role;

create policy "studio-thumbnails: anyone reads renders of shared creations"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'studio-thumbnails' and private.is_shared_creation_thumbnail(name));

create or replace function public.studio_shared_creation_preview(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('name', c.name, 'description', c.description, 'thumbnail_path', c.thumbnail_path)
    from public.creation_shares s
    join public.creations c on c.id = s.creation_id
   where coalesce(p_token, '') ~ '^[0-9a-f]{48}$'
     and s.token = p_token
     and s.revoked_at is null;
$$;

comment on function public.studio_shared_creation_preview(text) is
  '3D Studio share links (decision 101 addendum): name, description and card render path of an active share link, for the viewer page''s preview card. Null for an unknown or revoked token.';

revoke all on function public.studio_shared_creation_preview(text) from public;
grant execute on function public.studio_shared_creation_preview(text) to anon, authenticated, service_role;

-- =============================================================================
-- Migration 006 — Storage: product media bucket and policies
-- =============================================================================
-- Bucket `product-media` is PUBLIC for reads: product imagery is intentionally
-- public catalogue content served through the CDN via public URLs.
-- (Public buckets serve files by URL without an RLS SELECT policy, so no broad
-- SELECT policy is created: visitors cannot LIST the bucket.)
-- Only administrators can upload, replace or delete objects.
--
-- Private customer or training files must NEVER go in this bucket; they will
-- get their own private buckets with signed URLs in later iterations.
-- Path convention: products/<product-slug>/<file>, categories/<category-slug>/<file>
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-media',
  'product-media',
  true,
  10485760,  -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm']
)
on conflict (id) do nothing;

create policy "product-media: admins read objects"
  on storage.objects for select to authenticated
  using (bucket_id = 'product-media' and (select private.is_admin()));

create policy "product-media: admins upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-media' and (select private.is_admin()));

create policy "product-media: admins update"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-media' and (select private.is_admin()))
  with check (bucket_id = 'product-media' and (select private.is_admin()));

create policy "product-media: admins delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-media' and (select private.is_admin()));

-- =============================================================================
-- Training media library: folders and thumbnails (decision 104).
-- =============================================================================
-- Folders: the course editors' own way of sorting the library (one folder per
-- file, e.g. "English images"), created, renamed and deleted from
-- /admin/formations/medias. Deleting a folder never deletes a file: its files
-- go back to "not filed" (on delete set null).
--
-- Thumbnails: the library grids showed every original (41 images = 64 MB on
-- 2026-10-21) to show a 200-pixel tile. The browser now draws a small WebP at
-- upload (and once for older files) and stores it next to the original, at
-- media/<id>/_thumb.webp — under the bucket's existing upload policy. Lessons
-- keep using the original.
-- =============================================================================

create table public.training_media_folders (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 80 and name = btrim(name)),
  position   integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null
);

comment on table public.training_media_folders is
  'Folders of the training media library (one per file, optional). Deleting one unfiles its files.';

create unique index training_media_folders_name_key on public.training_media_folders (lower(name));
create index training_media_folders_created_by_idx on public.training_media_folders (created_by);

create trigger training_media_folders_set_updated_at
  before update on public.training_media_folders
  for each row execute function private.set_updated_at();

alter table public.training_media
  add column folder_id uuid references public.training_media_folders (id) on delete set null,
  add column thumb_path text,
  add constraint training_media_thumb_path_matches_id check (
    thumb_path is null
    or (thumb_path ~ '^media/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$'
        and thumb_path like 'media/' || id::text || '/%'
        and thumb_path <> storage_path));

comment on column public.training_media.folder_id is 'Library folder (null = not filed).';
comment on column public.training_media.thumb_path is
  'Small WebP preview for the library grids (media/<id>/_thumb.webp); null until drawn.';

create index training_media_folder_id_idx on public.training_media (folder_id);
create index training_media_created_at_idx on public.training_media (created_at desc);

-- Same access as the library itself: staff read, manage_training writes.
alter table public.training_media_folders enable row level security;
revoke truncate, references, trigger on public.training_media_folders from anon, authenticated;
revoke insert, update, delete on public.training_media_folders from anon;

create policy "training_media_folders: staff read"
  on public.training_media_folders for select to authenticated
  using ((select private.is_staff()));
create policy "training_media_folders: training managers insert"
  on public.training_media_folders for insert to authenticated
  with check ((select private.has_permission('manage_training')));
create policy "training_media_folders: training managers update"
  on public.training_media_folders for update to authenticated
  using ((select private.has_permission('manage_training')))
  with check ((select private.has_permission('manage_training')));
create policy "training_media_folders: training managers delete"
  on public.training_media_folders for delete to authenticated
  using ((select private.has_permission('manage_training')));

create trigger training_media_folders_audit_log
  after delete on public.training_media_folders
  for each row execute function private.audit_changes();

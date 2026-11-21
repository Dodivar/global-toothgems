-- =============================================================================
-- Review photos: an author may only change a photo's alt text, and doing so
-- sends the review back to moderation (security review of 2026-11-20).
-- =============================================================================
-- Before: the "authors update alt text" policy let `authenticated` UPDATE every
-- column of `review_photos` (Supabase's default table grant), and the guard
-- trigger only fired on INSERT and DELETE. A member whose review was published
-- could point `storage_path` at any newly uploaded image (or move the photo to
-- another review with `review_id`) and the unmoderated image went public with
-- the review, which stayed `published`.
--
-- After:
--   * members hold UPDATE on `alt_text` only (column grant);
--   * the guard trigger also fires on UPDATE: `storage_path` and `review_id`
--     never change (a new picture is a delete + insert, checked as before), and
--     an author's change sends a non-pending review back to moderation.
-- =============================================================================

revoke update on public.review_photos from authenticated;
grant update (alt_text) on public.review_photos to authenticated;

create or replace function private.guard_review_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.reviews;
  v_row    public.review_photos;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  select * into v_review from public.reviews where id = v_row.review_id;

  if tg_op = 'INSERT' then
    if (select count(*) from public.review_photos where review_id = new.review_id) >= 4 then
      raise exception 'review_photos: at most 4 photos per review' using errcode = '23514';
    end if;
    if new.storage_path not like v_review.user_id::text || '/%' then
      raise exception 'review_photos: photo must be in the author''s folder' using errcode = '23514';
    end if;
  end if;

  -- A photo keeps its file and its review: a new picture is a delete + insert.
  if tg_op = 'UPDATE'
     and (new.storage_path is distinct from old.storage_path or new.review_id is distinct from old.review_id) then
    raise exception 'review_photos: the file and the review of a photo cannot change' using errcode = '42501';
  end if;

  -- Author changing photos (not staff moderation) -> re-moderate.
  if v_review.id is not null
     and auth.uid() = v_review.user_id
     and v_review.status <> 'pending' then
    update public.reviews
       set status = 'pending', edited_at = now(), rejection_reason = null, changes_request = null
     where id = v_review.id;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.guard_review_photo() from public;

drop trigger if exists review_photos_guard on public.review_photos;
create trigger review_photos_guard
  before insert or update or delete on public.review_photos
  for each row execute function private.guard_review_photo();

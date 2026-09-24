-- =============================================================================
-- Migration 013 — Product reviews and moderation (iteration 3)
-- =============================================================================
-- Mirrors the review system prototype (webapp/src/data/reviewSystem.ts,
-- lib/reviews.tsx, lib/reviewRules.ts). Rules enforced in the database:
--
--   * Verification comes from an order, never from a checkbox: a customer can
--     review a product only if one of their own orders containing it has been
--     shipped or delivered; that order is recorded (reviews.order_id).
--   * One review per customer and product; editing is the way forward.
--   * The text is the customer's. Staff moderate (publish / ask for changes /
--     reject / hide), reply, flag and annotate — they never edit the text.
--   * Any customer edit (text, rating, tags or photos) sends the review back to
--     'pending': a published review leaves the page until re-approved.
--   * Reports never delete anything; resolving a report may hide the review.
--   * Photos live in a PRIVATE bucket and become readable only once their
--     review is published.
--   * Visitors never see the author's account id or order id — only a
--     privacy name ("Sarah M.") and a verified flag.
--
-- Subject: products only for now. Courses do not exist yet; they will add a
-- nullable course_id and widen reviews_one_subject — no restructuring.
-- History: every moderation and edit event is recorded in audit_logs.
-- =============================================================================

create table public.reviews (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid references public.products (id) on delete cascade,
  -- CASCADE: a customer's review is their personal data; deleting the account deletes it.
  user_id          uuid not null references public.profiles (id) on delete cascade,
  order_id         uuid references public.orders (id) on delete set null,
  is_verified      boolean generated always as (order_id is not null) stored,
  author_name      text not null check (char_length(author_name) between 1 and 60),
  rating           smallint not null check (rating between 1 and 5),
  title            text not null check (char_length(btrim(title)) between 1 and 80),
  body             text not null check (char_length(btrim(body)) between 30 and 2000),
  language         text not null references public.languages (code) on update cascade,
  tags             text[] not null default '{}'
                   check (tags <@ array['quality', 'result', 'easy', 'value', 'delivery',
                                        'beginner', 'followable', 'clear', 'techniques',
                                        'informative', 'highQuality', 'skills']::text[]
                          and cardinality(tags) <= 7
                          and (product_id is null
                               or tags <@ array['quality', 'result', 'easy', 'value', 'delivery']::text[])),
  status           text not null default 'pending'
                   check (status in ('pending', 'published', 'needs_changes', 'rejected', 'hidden')),
  rejection_reason text check (rejection_reason in
                     ('guidelines', 'personal', 'off_topic', 'spam', 'offensive', 'not_authentic')),
  changes_request  text check (char_length(changes_request) <= 1000),   -- message shown to the customer
  is_flagged       boolean not null default false,                      -- internal team flag
  helpful_count    integer not null default 0 check (helpful_count >= 0),
  response_body    text check (char_length(btrim(response_body)) between 1 and 1000),
  response_at      timestamptz,
  response_by      uuid references public.profiles (id) on delete set null,
  submitted_at     timestamptz not null default now(),
  published_at     timestamptz,
  edited_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint reviews_one_subject check (num_nonnulls(product_id) = 1),
  constraint reviews_rejected_has_reason check (status <> 'rejected' or rejection_reason is not null),
  constraint reviews_changes_has_message check (status <> 'needs_changes' or changes_request is not null)
);

comment on table public.reviews is
  'Customer reviews. Text belongs to the customer; staff only moderate, reply, flag and annotate.';
comment on column public.reviews.author_name is 'Privacy name snapshot shown publicly, e.g. "Sarah M.".';
comment on column public.reviews.order_id is 'Order that verifies the purchase (shipped or delivered). Set by the database, never by the client.';

create unique index reviews_one_per_customer_product_idx on public.reviews (user_id, product_id);
create index reviews_product_published_idx on public.reviews (product_id, published_at desc) where status = 'published';
create index reviews_status_idx on public.reviews (status, submitted_at desc);
create index reviews_order_idx on public.reviews (order_id) where order_id is not null;

alter table public.reviews enable row level security;

-- -----------------------------------------------------------------------------
-- Photos (max 4 per review), private bucket `review-photos`: <user_id>/<file>
-- -----------------------------------------------------------------------------
create table public.review_photos (
  id           uuid primary key default gen_random_uuid(),
  review_id    uuid not null references public.reviews (id) on delete cascade,
  storage_path text not null check (storage_path !~ '^/' and storage_path !~ '\.\.'),
  alt_text     text check (char_length(alt_text) <= 300),     -- written by the customer
  position     smallint not null default 0 check (position between 0 and 3),
  created_at   timestamptz not null default now(),
  constraint review_photos_path_unique unique (storage_path),
  constraint review_photos_position_unique unique (review_id, position)
);

create index review_photos_review_idx on public.review_photos (review_id);
alter table public.review_photos enable row level security;

-- -----------------------------------------------------------------------------
-- Reports (customers or the team). Never delete the review.
-- -----------------------------------------------------------------------------
create table public.review_reports (
  id           uuid primary key default gen_random_uuid(),
  review_id    uuid not null references public.reviews (id) on delete cascade,
  reporter_id  uuid references public.profiles (id) on delete set null,
  source       text not null default 'customer' check (source in ('customer', 'team')),
  reason       text not null check (reason in
                 ('inappropriate', 'spam', 'fake', 'personal', 'offensive', 'irrelevant', 'other')),
  details      text check (char_length(details) <= 500),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles (id) on delete set null,
  resolution   text check (resolution in ('kept', 'hidden', 'removed')),
  constraint review_reports_resolution_pair check ((resolution is null) = (resolved_at is null))
);

-- One open-or-closed report per customer and review.
create unique index review_reports_one_per_customer_idx
  on public.review_reports (review_id, reporter_id) where source = 'customer';
create index review_reports_open_idx on public.review_reports (review_id) where resolved_at is null;
alter table public.review_reports enable row level security;

-- -----------------------------------------------------------------------------
-- "Helpful" votes: one per customer and review; count kept on reviews.
-- -----------------------------------------------------------------------------
create table public.review_helpful_votes (
  review_id  uuid not null references public.reviews (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

create index review_helpful_votes_user_idx on public.review_helpful_votes (user_id);
alter table public.review_helpful_votes enable row level security;

-- -----------------------------------------------------------------------------
-- Internal moderation notes (team only)
-- -----------------------------------------------------------------------------
create table public.review_notes (
  id         uuid primary key default gen_random_uuid(),
  review_id  uuid not null references public.reviews (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null default auth.uid(),
  body       text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index review_notes_review_idx on public.review_notes (review_id, created_at);
alter table public.review_notes enable row level security;

-- =============================================================================
-- Rules (triggers)
-- =============================================================================

-- "Sarah M." from a profile.
create or replace function private.privacy_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(btrim(p.first_name) || coalesce(' ' || upper(left(nullif(btrim(p.last_name), ''), 1)) || '.', ''), ''),
    nullif(btrim(p.display_name), ''),
    'Client')
  from public.profiles p where p.id = p_user_id;
$$;

-- Verified order for a product: the customer's latest order containing it
-- that has left the workshop. Cancelled/refunded orders never count.
create or replace function private.review_verifying_order(p_user_id uuid, p_product_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.id
    from public.orders o
    join public.order_items i on i.order_id = o.id
   where o.user_id = p_user_id
     and i.product_id = p_product_id
     and o.status in ('shipped', 'delivered')
   order by o.created_at desc
   limit 1;
$$;

revoke all on function private.privacy_name(uuid) from public;
revoke all on function private.review_verifying_order(uuid, uuid) from public;
grant execute on function private.privacy_name(uuid) to authenticated, service_role;
grant execute on function private.review_verifying_order(uuid, uuid) to authenticated, service_role;

-- Customer submissions: eligibility, and system fields forced.
-- SECURITY INVOKER on purpose: is_trusted_backend() must see the caller's
-- role. Elevated reads go through the definer helpers above.
create or replace function private.prepare_review_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  new.body  := btrim(new.body);

  if private.is_trusted_backend() then          -- imports / backend
    new.author_name := coalesce(new.author_name, private.privacy_name(new.user_id));
    return new;
  end if;

  if new.user_id is distinct from auth.uid() then
    raise exception 'reviews: you can only review as yourself' using errcode = '42501';
  end if;
  if not exists (select 1 from public.products p where p.id = new.product_id and p.status = 'active') then
    raise exception 'reviews: product not available' using errcode = 'P0002';
  end if;

  new.order_id := private.review_verifying_order(new.user_id, new.product_id);
  if new.order_id is null then
    raise exception 'reviews: only customers who received this product can review it'
      using errcode = '42501';
  end if;

  new.author_name      := private.privacy_name(new.user_id);
  new.status           := 'pending';
  new.rejection_reason := null;
  new.changes_request  := null;
  new.is_flagged       := false;
  new.helpful_count    := 0;
  new.response_body    := null;
  new.response_at      := null;
  new.response_by      := null;
  new.submitted_at     := now();
  new.published_at     := null;
  new.edited_at        := null;
  new.created_at       := now();
  new.updated_at       := now();
  return new;
end;
$$;

create trigger reviews_prepare_insert
  before insert on public.reviews
  for each row execute function private.prepare_review_insert();

-- Updates: customers edit content only (→ pending); staff moderate only.
create or replace function private.guard_review_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_content_changed boolean;
  v_system_changed  boolean;
begin
  new.updated_at := now();
  new.title := btrim(new.title);
  new.body  := btrim(new.body);

  v_content_changed := new.rating   is distinct from old.rating
                    or new.title    is distinct from old.title
                    or new.body     is distinct from old.body
                    or new.tags     is distinct from old.tags
                    or new.language is distinct from old.language;

  v_system_changed := new.id           is distinct from old.id
                   or new.product_id   is distinct from old.product_id
                   or new.user_id      is distinct from old.user_id
                   or new.order_id     is distinct from old.order_id
                   or new.author_name  is distinct from old.author_name
                   or new.submitted_at is distinct from old.submitted_at
                   or new.created_at   is distinct from old.created_at;

  if private.is_trusted_backend() then
    return new;
  end if;

  if v_system_changed or new.helpful_count is distinct from old.helpful_count then
    raise exception 'reviews: identity, verification and counters are read-only' using errcode = '42501';
  end if;

  if private.is_admin() and old.user_id is distinct from auth.uid() then
    -- Staff: moderation only, never the customer's words.
    if v_content_changed or new.edited_at is distinct from old.edited_at then
      raise exception 'reviews: staff cannot edit a customer''s review' using errcode = '42501';
    end if;
    if new.status = 'published' and old.status <> 'published' then
      new.published_at := now();
    end if;
    if new.status <> 'rejected' then
      new.rejection_reason := null;
    end if;
    if new.status <> 'needs_changes' then
      new.changes_request := null;
    end if;
    if new.response_body is distinct from old.response_body then
      new.response_at := case when new.response_body is null then null else now() end;
      new.response_by := case when new.response_body is null then null else auth.uid() end;
    elsif new.response_at is distinct from old.response_at or new.response_by is distinct from old.response_by then
      raise exception 'reviews: response metadata is set automatically' using errcode = '42501';
    end if;
    return new;
  end if;

  -- The author: content only, and any edit goes back to moderation.
  if old.user_id is distinct from auth.uid() then
    raise exception 'reviews: not your review' using errcode = '42501';
  end if;
  if new.status           is distinct from old.status
  or new.rejection_reason is distinct from old.rejection_reason
  or new.changes_request  is distinct from old.changes_request
  or new.is_flagged       is distinct from old.is_flagged
  or new.response_body    is distinct from old.response_body
  or new.response_at      is distinct from old.response_at
  or new.response_by      is distinct from old.response_by
  or new.published_at     is distinct from old.published_at
  or new.edited_at        is distinct from old.edited_at then
    raise exception 'reviews: moderation fields are managed by the team' using errcode = '42501';
  end if;
  if v_content_changed then
    new.status           := 'pending';
    new.edited_at        := now();
    new.rejection_reason := null;
    new.changes_request  := null;
  end if;
  return new;
end;
$$;

create trigger reviews_guard_update
  before update on public.reviews
  for each row execute function private.guard_review_update();

-- Photos: at most 4, stored in the author's own folder; a customer photo
-- change sends the review back to moderation.
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

create trigger review_photos_guard
  before insert or delete on public.review_photos
  for each row execute function private.guard_review_photo();

-- Helpful counter.
create or replace function private.sync_review_helpful_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.reviews r
     set helpful_count = (select count(*) from public.review_helpful_votes v where v.review_id = r.id)
   where r.id = case when tg_op = 'DELETE' then old.review_id else new.review_id end;
  return null;
end;
$$;

create trigger review_helpful_votes_count
  after insert or delete on public.review_helpful_votes
  for each row execute function private.sync_review_helpful_count();

-- Reports: system fields forced for customers; resolving applies the outcome.
create or replace function private.handle_review_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then            -- API callers; backend (no JWT user) keeps its values
      new.reporter_id := auth.uid();
      new.source := case when private.is_admin() then 'team' else 'customer' end;
      new.resolved_at := null;
      new.resolved_by := null;
      new.resolution := null;
    end if;
    new.created_at := now();
    return new;
  end if;

  -- UPDATE (staff only by RLS). A report itself is never rewritten.
  if new.review_id is distinct from old.review_id or new.reporter_id is distinct from old.reporter_id
     or new.reason is distinct from old.reason or new.source is distinct from old.source
     or new.created_at is distinct from old.created_at then
    raise exception 'review_reports: a report cannot be rewritten' using errcode = '42501';
  end if;
  -- Resolution stamps and effect on the review.
  if new.resolution is distinct from old.resolution then
    new.resolved_at := case when new.resolution is null then null else now() end;
    new.resolved_by := case when new.resolution is null then null else auth.uid() end;
    if new.resolution = 'hidden' then
      update public.reviews set status = 'hidden' where id = new.review_id;
    elsif new.resolution = 'removed' then
      update public.reviews set status = 'rejected', rejection_reason = 'guidelines' where id = new.review_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger review_reports_handle
  before insert or update on public.review_reports
  for each row execute function private.handle_review_report();

revoke all on function private.guard_review_photo() from public;
revoke all on function private.sync_review_helpful_count() from public;
revoke all on function private.handle_review_report() from public;
revoke all on function private.prepare_review_insert() from public;

-- History for the moderation timeline.
create trigger reviews_audit_log
  after update on public.reviews
  for each row execute function private.audit_changes(
    'status', 'rejection_reason', 'changes_request', 'is_flagged', 'response_body', 'edited_at', 'rating');
create trigger reviews_audit_log_delete
  after delete on public.reviews
  for each row execute function private.audit_changes();
create trigger review_reports_audit_log
  after insert or update on public.review_reports
  for each row execute function private.audit_changes('resolution');

-- =============================================================================
-- Aggregates for product pages and cards (respects RLS: published only)
-- =============================================================================
create view public.product_review_stats
with (security_invoker = true)
as
select r.product_id,
       count(*)::integer                                        as review_count,
       round(avg(r.rating)::numeric, 1)                         as average_rating,
       count(*) filter (where r.rating = 5)::integer            as five_star,
       count(*) filter (where r.rating = 4)::integer            as four_star,
       count(*) filter (where r.rating = 3)::integer            as three_star,
       count(*) filter (where r.rating = 2)::integer            as two_star,
       count(*) filter (where r.rating = 1)::integer            as one_star,
       count(*) filter (where r.is_verified)::integer           as verified_count,
       count(*) filter (where exists (select 1 from public.review_photos p where p.review_id = r.id))::integer
                                                                as with_photos_count
  from public.reviews r
 where r.status = 'published'
 group by r.product_id;

comment on view public.product_review_stats is
  'Published-review summary per product (count, average, star buckets, verified, with photos).';

-- =============================================================================
-- Privileges and RLS
-- =============================================================================
revoke truncate, references, trigger on public.reviews, public.review_photos, public.review_reports,
  public.review_helpful_votes, public.review_notes from anon, authenticated;
revoke all on public.review_reports, public.review_helpful_votes, public.review_notes from anon;
revoke all on public.reviews, public.review_photos from anon;

-- Visitors: public columns only (no account id, no order id, no moderation internals).
grant select (id, product_id, is_verified, author_name, rating, title, body, language, tags, status,
              helpful_count, response_body, response_at, published_at, edited_at)
  on public.reviews to anon;
grant select (id, review_id, storage_path, alt_text, position) on public.review_photos to anon;
grant select on public.product_review_stats to anon, authenticated;

-- reviews
create policy "reviews: public reads published, authors read own, admins read all"
  on public.reviews for select to anon, authenticated
  using (
    (status = 'published' and exists (
       select 1 from public.products p where p.id = reviews.product_id and p.status = 'active'))
    or user_id = (select auth.uid())
    or (select private.is_admin())
  );
create policy "reviews: customers submit their own"
  on public.reviews for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "reviews: authors edit own, admins moderate"
  on public.reviews for update to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()))
  with check (user_id = (select auth.uid()) or (select private.is_admin()));
create policy "reviews: authors delete own, admins delete"
  on public.reviews for delete to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- review_photos
create policy "review_photos: visible with their review"
  on public.review_photos for select to anon, authenticated
  using (exists (select 1 from public.reviews r where r.id = review_photos.review_id));
create policy "review_photos: authors add to own review"
  on public.review_photos for insert to authenticated
  with check (exists (select 1 from public.reviews r
                      where r.id = review_photos.review_id and r.user_id = (select auth.uid())));
create policy "review_photos: authors and admins delete"
  on public.review_photos for delete to authenticated
  using (exists (select 1 from public.reviews r
                 where r.id = review_photos.review_id
                   and (r.user_id = (select auth.uid()) or (select private.is_admin()))));
create policy "review_photos: authors update alt text"
  on public.review_photos for update to authenticated
  using (exists (select 1 from public.reviews r
                 where r.id = review_photos.review_id and r.user_id = (select auth.uid())))
  with check (exists (select 1 from public.reviews r
                      where r.id = review_photos.review_id and r.user_id = (select auth.uid())));

-- review_reports: customers file reports on published reviews that are not theirs.
create policy "review_reports: reporters read own, admins read all"
  on public.review_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_admin()));
create policy "review_reports: customers report published reviews, admins flag any"
  on public.review_reports for insert to authenticated
  with check (
    (select private.is_admin())
    or exists (select 1 from public.reviews r
               where r.id = review_reports.review_id and r.status = 'published'
                 and r.user_id <> (select auth.uid()))
  );
create policy "review_reports: admins resolve"
  on public.review_reports for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- review_helpful_votes: customers vote on published reviews that are not theirs.
create policy "review_helpful_votes: voters read own"
  on public.review_helpful_votes for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy "review_helpful_votes: customers vote"
  on public.review_helpful_votes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.reviews r
                where r.id = review_helpful_votes.review_id and r.status = 'published'
                  and r.user_id <> (select auth.uid()))
  );
create policy "review_helpful_votes: customers withdraw own vote"
  on public.review_helpful_votes for delete to authenticated
  using (user_id = (select auth.uid()));

-- review_notes: team only.
create policy "review_notes: admins read"
  on public.review_notes for select to authenticated using ((select private.is_admin()));
create policy "review_notes: admins write"
  on public.review_notes for insert to authenticated with check ((select private.is_admin()));
create policy "review_notes: admins delete"
  on public.review_notes for delete to authenticated using ((select private.is_admin()));

-- =============================================================================
-- Storage: private review photos
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('review-photos', 'review-photos', false, 8388608,   -- 8 MB
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "review-photos: public reads photos of published reviews"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'review-photos'
    and exists (
      select 1 from public.review_photos rp
      join public.reviews r on r.id = rp.review_id
      where rp.storage_path = storage.objects.name and r.status = 'published')
  );
create policy "review-photos: authors and admins read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'review-photos'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_admin()))
  );
create policy "review-photos: authors upload into own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'review-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "review-photos: authors and admins delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'review-photos'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_admin()))
  );

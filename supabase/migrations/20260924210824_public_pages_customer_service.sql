-- =============================================================================
-- Migration 023 — Public pages and customer service (iteration 7)
-- =============================================================================
-- Checked against the prototype:
--   * Contact page (webapp/src/pages/legal/Contact.tsx, data/legal/types.ts):
--     name, email, optional order number, 9 categories, subject, message
--     (>= 20 characters), optional attachment (jpg/png/pdf, 10 MB)
--     -> contact_requests (+ staff notes, private bucket `contact-attachments`)
--   * Newsletter forms of the storefront (Home, editorial home) for visitors
--     without an account -> newsletter_subscriptions (double opt-in), kept in
--     step with the members' consent records
--   * Translations workspace (data/adminTranslations.ts) types `email` and
--     `content`: subject / preheader / body, title / body, priority, outdated
--     -> email_templates, content_pages (+ translations, translation_status view)
--   * Maintenance page (pages/Maintenance.tsx) -> store_settings (single row,
--     only the maintenance switch for now; iteration "store settings" adds the
--     rest of the Settings workspace to the same row)
--
-- Anti-abuse: the database throttles by e-mail / account (private.hit_rate_limit).
-- Captcha and per-IP limits belong to the server route that calls these
-- functions (the database never sees the visitor's IP).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Permission for editorial content, and a small rate limiter
-- -----------------------------------------------------------------------------
insert into public.permissions (key, name, description) values
  ('manage_content', 'Manage content', 'Content pages, e-mail templates and their translations.');
insert into public.role_permissions (role_key, permission_key) values
  ('manager', 'manage_content'), ('admin', 'manage_content');

create table private.rate_limit_hits (
  id         bigint generated always as identity primary key,
  bucket     text not null,
  key_hash   text not null,                         -- sha256 of the key: no e-mail stored twice
  created_at timestamptz not null default clock_timestamp()
);

create index rate_limit_hits_lookup_idx on private.rate_limit_hits (bucket, key_hash, created_at desc);

comment on table private.rate_limit_hits is 'Throttling ledger for public endpoints (hashed keys). Pruned as it is used.';

-- Records a hit and says whether it is within `p_max` hits per `p_window`.
create or replace function private.hit_rate_limit(p_bucket text, p_key text, p_max integer, p_window interval)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_hash  text := encode(extensions.digest(lower(coalesce(p_key, '')), 'sha256'), 'hex');
  v_count integer;
begin
  delete from private.rate_limit_hits
   where bucket = p_bucket and key_hash = v_hash and created_at < clock_timestamp() - p_window;
  select count(*) into v_count from private.rate_limit_hits
   where bucket = p_bucket and key_hash = v_hash;
  if v_count >= p_max then
    return false;
  end if;
  insert into private.rate_limit_hits (bucket, key_hash) values (p_bucket, v_hash);
  return true;
end;
$$;

revoke all on table private.rate_limit_hits from public, anon, authenticated;
revoke all on function private.hit_rate_limit(text, text, integer, interval) from public;

-- -----------------------------------------------------------------------------
-- 1. Store settings (single row) — maintenance mode
-- -----------------------------------------------------------------------------
create table public.store_settings (
  id                        boolean primary key default true check (id),
  maintenance_enabled       boolean not null default false,
  maintenance_started_at    timestamptz,
  maintenance_expected_end  timestamptz,        -- optional: the page shows no countdown without it
  maintenance_staff_bypass  boolean not null default true,   -- team members keep using the site
  updated_at                timestamptz not null default now(),
  updated_by                uuid references public.profiles (id) on delete set null,
  created_at                timestamptz not null default now(),
  created_by                uuid references public.profiles (id) on delete set null,
  constraint store_settings_maintenance_dates check (
    maintenance_expected_end is null or maintenance_started_at is null or maintenance_expected_end > maintenance_started_at)
);

comment on table public.store_settings is
  'Shop-wide settings (single row). Public read. The storefront and the server routes check maintenance_enabled; the checkout must refuse orders while it is on.';

insert into public.store_settings (id) values (true) on conflict (id) do nothing;
alter table public.store_settings enable row level security;

create or replace function private.stamp_maintenance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.maintenance_enabled and not coalesce(old.maintenance_enabled, false) then
    new.maintenance_started_at := now();
  elsif not new.maintenance_enabled then
    new.maintenance_started_at := null;
    new.maintenance_expected_end := null;
  else
    new.maintenance_started_at := old.maintenance_started_at;
  end if;
  return new;
end;
$$;

create trigger store_settings_audit_columns
  before insert or update on public.store_settings
  for each row execute function private.set_audit_columns();
create trigger store_settings_stamp_maintenance
  before update on public.store_settings
  for each row execute function private.stamp_maintenance();
create trigger store_settings_audit_log
  after update on public.store_settings
  for each row execute function private.audit_changes();

-- -----------------------------------------------------------------------------
-- 2. Contact requests (support tickets)
-- -----------------------------------------------------------------------------
create sequence public.contact_request_number_seq start with 100001;

create table public.contact_requests (
  id                 uuid primary key default gen_random_uuid(),
  ticket_number      text not null unique default ('SUP-' || nextval('public.contact_request_number_seq')::text),
  user_id            uuid references public.profiles (id) on delete set null,
  name               text not null check (char_length(name) between 1 and 120),
  email              text not null check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and char_length(email) <= 254),
  order_reference    text check (char_length(order_reference) <= 40),     -- as typed
  order_id           uuid references public.orders (id) on delete set null, -- resolved only when it is the requester's order
  category           text not null check (category in
                       ('order', 'delivery', 'returns', 'product', 'training', 'technical', 'privacy', 'professional', 'other')),
  subject            text not null check (char_length(subject) between 1 and 200),
  message            text not null check (char_length(message) between 20 and 5000),
  locale             text not null default 'fr' references public.languages (code) on update cascade,
  attachment_path    text check (attachment_path ~ '^[A-Za-z0-9][A-Za-z0-9/_.-]*$' and attachment_path !~ '\.\.'),
  status             text not null default 'new'
                     check (status in ('new', 'open', 'waiting_customer', 'resolved', 'closed', 'spam')),
  priority           text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  assigned_to        uuid references public.profiles (id) on delete set null,
  first_response_at  timestamptz,
  resolved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references public.profiles (id) on delete set null
);

comment on table public.contact_requests is
  'Contact form submissions = support tickets. Created only through submit_contact_request(); staff (manage_customers) triage them.';
comment on column public.contact_requests.order_id is
  'Linked only when the typed reference is the requester''s own order (account, or same e-mail for guests).';

create index contact_requests_status_idx on public.contact_requests (status, created_at desc);
create index contact_requests_user_idx on public.contact_requests (user_id, created_at desc) where user_id is not null;
create index contact_requests_email_idx on public.contact_requests (lower(email));
create index contact_requests_order_idx on public.contact_requests (order_id) where order_id is not null;
create index contact_requests_assigned_idx on public.contact_requests (assigned_to) where assigned_to is not null;
alter table public.contact_requests enable row level security;

-- Staff triage only: what the customer wrote never changes.
create or replace function private.guard_contact_request_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if not private.is_trusted_backend() then
    if new.id is distinct from old.id or new.ticket_number is distinct from old.ticket_number
       or new.user_id is distinct from old.user_id or new.name is distinct from old.name
       or new.email is distinct from old.email or new.order_reference is distinct from old.order_reference
       or new.order_id is distinct from old.order_id or new.category is distinct from old.category
       or new.subject is distinct from old.subject or new.message is distinct from old.message
       or new.locale is distinct from old.locale or new.attachment_path is distinct from old.attachment_path
       or new.created_at is distinct from old.created_at
       or new.first_response_at is distinct from old.first_response_at
       or new.resolved_at is distinct from old.resolved_at then
      raise exception 'contact_requests: only status, priority and assignee can change' using errcode = '42501';
    end if;
    if new.assigned_to is not null and new.assigned_to is distinct from old.assigned_to
       and not exists (select 1 from public.profiles p join public.roles r on r.key = p.role
                        where p.id = new.assigned_to and r.is_staff and p.status = 'active') then
      raise exception 'contact_requests: assign to an active team member' using errcode = '23514';
    end if;
  end if;
  if old.status = 'new' and new.status <> 'new' and new.first_response_at is null then
    new.first_response_at := now();
  end if;
  if new.status in ('resolved', 'closed') and old.status not in ('resolved', 'closed') then
    new.resolved_at := now();
  elsif new.status not in ('resolved', 'closed') then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

create trigger contact_requests_guard_update
  before update on public.contact_requests
  for each row execute function private.guard_contact_request_update();
create trigger contact_requests_audit_log
  after update on public.contact_requests
  for each row execute function private.audit_changes('status', 'priority', 'assigned_to');

create table public.contact_request_notes (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.contact_requests (id) on delete cascade,
  author_id   uuid references public.profiles (id) on delete set null,
  body        text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.contact_request_notes is 'Internal notes on a ticket (staff only, never shown to the customer).';

create index contact_request_notes_request_idx on public.contact_request_notes (request_id, created_at);
create index contact_request_notes_author_idx on public.contact_request_notes (author_id) where author_id is not null;
alter table public.contact_request_notes enable row level security;

create or replace function private.prepare_contact_note()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := coalesce(auth.uid(), new.author_id);
    new.created_at := now();
  elsif new.request_id is distinct from old.request_id or new.author_id is distinct from old.author_id
        or new.created_at is distinct from old.created_at then
    raise exception 'contact_request_notes: ticket, author and date are read-only' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger contact_request_notes_prepare
  before insert or update on public.contact_request_notes
  for each row execute function private.prepare_contact_note();

-- Private attachments: <user_id>/<file> for members, guest/<file> written by the backend.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contact-attachments', 'contact-attachments', false, 10485760,   -- 10 MB
        array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;

create policy "contact-attachments: members upload into own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'contact-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "contact-attachments: owners and staff read"
  on storage.objects for select to authenticated
  using (bucket_id = 'contact-attachments'
         and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_staff())));
create policy "contact-attachments: owners and support delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'contact-attachments'
         and ((storage.foldername(name))[1] = (select auth.uid())::text
              or (select private.has_permission('manage_customers'))));

-- The only way in. Members call it with their JWT; guests go through the
-- server route (captcha, IP limit) which calls it with the service role.
-- Returns the ticket number (for the confirmation screen and e-mail).
create or replace function public.submit_contact_request(
  p_name            text,
  p_email           text,
  p_category        text,
  p_subject         text,
  p_message         text,
  p_order_reference text default null,
  p_locale          text default 'fr',
  p_attachment_path text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_role     text := private.caller_jwt_role();
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_ref      text := nullif(upper(btrim(coalesce(p_order_reference, ''))), '');
  v_order_id uuid;
  v_ticket   text;
begin
  if v_user is null and v_role <> 'service_role' then
    raise exception 'submit_contact_request: sign in or use the contact form' using errcode = '42501';
  end if;
  if v_user is not null and not exists (select 1 from public.profiles where id = v_user and status = 'active') then
    raise exception 'submit_contact_request: account is not active' using errcode = '42501';
  end if;
  if not private.hit_rate_limit('contact', coalesce(v_user::text, v_email), 3, interval '10 minutes') then
    raise exception 'submit_contact_request: too many messages, please try again later' using errcode = 'PT429';
  end if;
  if char_length(btrim(coalesce(p_message, ''))) < 20 or nullif(btrim(p_name), '') is null
     or nullif(btrim(p_subject), '') is null then
    raise exception 'submit_contact_request: name, subject and a message of at least 20 characters are required'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.languages where code = p_locale and is_enabled) then
    p_locale := 'fr';
  end if;
  if p_attachment_path is not null then
    if (v_user is not null and split_part(p_attachment_path, '/', 1) <> v_user::text)
       or (v_user is null and split_part(p_attachment_path, '/', 1) <> 'guest')
       or not exists (select 1 from storage.objects o
                       where o.bucket_id = 'contact-attachments' and o.name = p_attachment_path) then
      raise exception 'submit_contact_request: attachment not found' using errcode = '42501';
    end if;
  end if;

  -- Link the order only when it is the requester's own; never say whether it matched.
  if v_ref is not null then
    select o.id into v_order_id from public.orders o
     where o.order_number = v_ref
       and ((v_user is not null and o.user_id = v_user) or (v_user is null and lower(o.customer_email) = v_email));
  end if;

  insert into public.contact_requests
    (user_id, name, email, order_reference, order_id, category, subject, message, locale, attachment_path,
     priority)
  values
    (v_user, btrim(p_name), v_email, v_ref, v_order_id, p_category, btrim(p_subject), btrim(p_message), p_locale,
     p_attachment_path, case when p_category = 'privacy' then 'high' else 'normal' end)
  returning ticket_number into v_ticket;
  return v_ticket;
exception
  when check_violation then
    raise exception 'submit_contact_request: invalid field (%)', sqlerrm using errcode = '22023';
end;
$$;

comment on function public.submit_contact_request(text, text, text, text, text, text, text, text) is
  'Contact form. Members: with their JWT (attachment in their folder). Guests: via the server route with the service role (attachment under guest/). Throttled: 3 per 10 minutes per account or e-mail.';

-- -----------------------------------------------------------------------------
-- 3. Newsletter (visitors) — double opt-in, kept in step with member consents
-- -----------------------------------------------------------------------------
alter table public.consent_records drop constraint consent_records_source_check;
alter table public.consent_records add constraint consent_records_source_check
  check (source in ('registration', 'account', 'cookie_banner', 'checkout', 'admin', 'import', 'newsletter'));

create table public.newsletter_subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  email                text not null check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and char_length(email) <= 254),
  user_id              uuid unique references public.profiles (id) on delete set null,
  locale               text not null default 'fr' references public.languages (code) on update cascade,
  status               text not null default 'pending'
                       check (status in ('pending', 'subscribed', 'unsubscribed', 'bounced', 'complained')),
  source               text not null default 'footer' check (source in ('footer', 'home', 'checkout', 'account', 'import')),
  policy_version       text check (char_length(policy_version) between 1 and 40),
  confirm_token_hash   text,                     -- sha256 of the token e-mailed for the double opt-in
  confirm_expires_at   timestamptz,
  unsubscribe_token    text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  confirmation_sent_at timestamptz,
  confirmed_at         timestamptz,
  unsubscribed_at      timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint newsletter_confirmed_dated check (status <> 'subscribed' or confirmed_at is not null)
);

comment on table public.newsletter_subscriptions is
  'Marketing e-mail list. Visitors: double opt-in. Members: follows their marketing_email consent records (source of truth for members).';
comment on column public.newsletter_subscriptions.unsubscribe_token is
  'Bearer token for the one-click unsubscribe link in every e-mail. Never granted to API roles.';

create unique index newsletter_subscriptions_email_idx on public.newsletter_subscriptions (lower(email));
create index newsletter_subscriptions_status_idx on public.newsletter_subscriptions (status);
alter table public.newsletter_subscriptions enable row level security;

create trigger newsletter_subscriptions_set_updated_at
  before update on public.newsletter_subscriptions
  for each row execute function private.set_updated_at();
create trigger newsletter_subscriptions_audit_log
  after update on public.newsletter_subscriptions
  for each row execute function private.audit_changes('status', 'user_id');

-- A member's marketing decision (account, registration, cookie banner...) moves
-- their list entry. Never the other way round except through the functions
-- below, which record a consent first.
create or replace function private.sync_newsletter_from_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_sub   public.newsletter_subscriptions;
begin
  if new.purpose <> 'marketing_email' then
    return new;
  end if;
  select email into v_email from public.profiles where id = new.user_id;
  select * into v_sub from public.newsletter_subscriptions where user_id = new.user_id for update;
  if v_sub.id is null and v_email is not null then
    select * into v_sub from public.newsletter_subscriptions
     where lower(email) = lower(v_email) and user_id is null for update;
  end if;

  if v_sub.id is not null then
    update public.newsletter_subscriptions
       set user_id = new.user_id,
           -- a bounced or complaining address is never re-activated by a consent
           status = case when not new.granted then 'unsubscribed'
                         when status in ('bounced', 'complained') then status
                         else 'subscribed' end,
           confirmed_at = case when new.granted then coalesce(confirmed_at, now()) else confirmed_at end,
           unsubscribed_at = case when new.granted then null else now() end,
           policy_version = new.policy_version,
           confirm_token_hash = null, confirm_expires_at = null
     where id = v_sub.id;
  elsif new.granted and v_email is not null then
    insert into public.newsletter_subscriptions
      (email, user_id, locale, status, source, policy_version, confirmed_at)
    select lower(v_email), new.user_id, p.preferred_locale, 'subscribed',
           case when new.source = 'checkout' then 'checkout' else 'account' end, new.policy_version, now()
      from public.profiles p where p.id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger consent_records_sync_newsletter
  after insert on public.consent_records
  for each row execute function private.sync_newsletter_from_consent();

-- Members who already opted in (latest marketing_email decision = granted).
insert into public.newsletter_subscriptions (email, user_id, locale, status, source, policy_version, confirmed_at)
select lower(p.email), p.id, p.preferred_locale, 'subscribed', 'account', c.policy_version, c.decided_at
  from public.member_consents c
  join public.profiles p on p.id = c.user_id
 where c.purpose = 'marketing_email' and c.granted and p.email is not null
on conflict do nothing;

-- A new account whose e-mail already confirmed a subscription as a visitor:
-- link it and record the consent it proves (the registration form, if it
-- asked, records its own later decision after this one).
create or replace function private.link_newsletter_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.newsletter_subscriptions;
begin
  if new.email is null then
    return new;
  end if;
  select * into v_sub from public.newsletter_subscriptions
   where lower(email) = lower(new.email) and user_id is null for update;
  if v_sub.id is null then
    return new;
  end if;
  update public.newsletter_subscriptions set user_id = new.id where id = v_sub.id;
  if v_sub.status = 'subscribed' then
    insert into public.consent_records (user_id, purpose, granted, policy_version, source)
    values (new.id, 'marketing_email', true, coalesce(v_sub.policy_version, 'newsletter'), 'newsletter');
  end if;
  return new;
end;
$$;

create trigger profiles_link_newsletter
  after insert on public.profiles
  for each row execute function private.link_newsletter_on_signup();

-- Server route only (captcha, IP limit, then it e-mails the confirmation link).
-- Returns {"status": ..., "confirm_token": ...}: a token only when a
-- confirmation e-mail must be sent. The route answers the visitor the same way
-- whatever the status (no list enumeration).
create or replace function public.newsletter_subscribe(
  p_email          text,
  p_locale         text default 'fr',
  p_source         text default 'footer',
  p_policy_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_sub   public.newsletter_subscriptions;
  v_token text;
begin
  -- (current_user is the owner here: check the caller's JWT, '' = SQL editor / migrations)
  if private.caller_jwt_role() not in ('service_role', '') then
    raise exception 'newsletter_subscribe: server only' using errcode = '42501';
  end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(v_email) > 254 then
    raise exception 'newsletter_subscribe: invalid e-mail' using errcode = '22023';
  end if;
  if nullif(btrim(p_policy_version), '') is null then
    raise exception 'newsletter_subscribe: the privacy policy version shown on the form is required' using errcode = '22023';
  end if;
  if p_source not in ('footer', 'home', 'checkout') then
    raise exception 'newsletter_subscribe: unknown source' using errcode = '22023';
  end if;
  if not exists (select 1 from public.languages where code = p_locale and is_enabled) then
    p_locale := 'fr';
  end if;
  if not private.hit_rate_limit('newsletter', v_email, 3, interval '1 hour') then
    raise exception 'newsletter_subscribe: too many requests' using errcode = 'PT429';
  end if;

  select * into v_sub from public.newsletter_subscriptions where lower(email) = v_email for update;
  if v_sub.status = 'subscribed' then
    return jsonb_build_object('status', 'subscribed');
  end if;
  if v_sub.status in ('bounced', 'complained') then
    return jsonb_build_object('status', v_sub.status);      -- never re-mail a complaint or a dead address
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  if v_sub.id is null then
    insert into public.newsletter_subscriptions
      (email, locale, status, source, policy_version, confirm_token_hash, confirm_expires_at, confirmation_sent_at)
    values
      (v_email, p_locale, 'pending', p_source, btrim(p_policy_version),
       encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '48 hours', now());
  else
    update public.newsletter_subscriptions
       set status = 'pending', locale = p_locale, source = p_source, policy_version = btrim(p_policy_version),
           confirm_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
           confirm_expires_at = now() + interval '48 hours', confirmation_sent_at = now()
     where id = v_sub.id;
  end if;
  return jsonb_build_object('status', 'pending', 'confirm_token', v_token);
end;
$$;

-- Confirmation link (public). True when the subscription is now active.
create or replace function public.newsletter_confirm(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.newsletter_subscriptions;
  v_user uuid;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{48}$' then
    return false;
  end if;
  select * into v_sub from public.newsletter_subscriptions
   where confirm_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and status = 'pending' and confirm_expires_at > now()
   for update;
  if v_sub.id is null then
    return false;
  end if;

  update public.newsletter_subscriptions
     set status = 'subscribed', confirmed_at = now(), unsubscribed_at = null,
         confirm_token_hash = null, confirm_expires_at = null
   where id = v_sub.id;

  -- The address belongs to a member: their consent history records it.
  v_user := coalesce(v_sub.user_id,
                     (select p.id from public.profiles p where lower(p.email) = lower(v_sub.email) limit 1));
  if v_user is not null then
    insert into public.consent_records (user_id, purpose, granted, policy_version, source)
    values (v_user, 'marketing_email', true, coalesce(v_sub.policy_version, 'newsletter'), 'newsletter');
  end if;
  return true;
end;
$$;

-- One-click unsubscribe link in every marketing e-mail (public).
create or replace function public.newsletter_unsubscribe(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.newsletter_subscriptions;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{32}$' then
    return false;
  end if;
  select * into v_sub from public.newsletter_subscriptions where unsubscribe_token = p_token for update;
  if v_sub.id is null then
    return false;
  end if;
  if v_sub.status in ('subscribed', 'pending') then
    update public.newsletter_subscriptions
       set status = 'unsubscribed', unsubscribed_at = now(), confirm_token_hash = null, confirm_expires_at = null
     where id = v_sub.id;
    if v_sub.user_id is not null then
      insert into public.consent_records (user_id, purpose, granted, policy_version, source)
      values (v_sub.user_id, 'marketing_email', false, coalesce(v_sub.policy_version, 'newsletter'), 'newsletter');
    end if;
  end if;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. E-mail templates and content pages (+ translations)
-- -----------------------------------------------------------------------------
-- {{placeholder}} names used in a text.
create or replace function private.text_placeholders(p_text text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(distinct m[1] order by m[1]), '{}'::text[])
    from regexp_matches(coalesce(p_text, ''), '\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}', 'g') as m;
$$;

create table public.email_templates (
  id                   uuid primary key default gen_random_uuid(),
  key                  text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),   -- used by the sending code
  name                 text not null check (char_length(name) between 1 and 120),
  description          text check (char_length(description) <= 500),            -- "Sent when an order is paid"
  subject              text not null check (char_length(subject) between 1 and 200),
  preheader            text check (char_length(preheader) <= 200),
  body                 text not null check (char_length(body) between 1 and 20000),
  variables            text[] not null default '{}',     -- placeholders the sending code provides
  translation_priority text not null default 'normal' check (translation_priority in ('high', 'normal', 'low')),
  is_active            boolean not null default true,
  content_updated_at   timestamptz not null default now(),   -- last change of subject/preheader/body
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references public.profiles (id) on delete set null,
  updated_by           uuid references public.profiles (id) on delete set null
);

comment on table public.email_templates is
  'Transactional e-mails. Base columns = default language. Only {{variables}} listed in `variables` may appear.';

create table public.email_template_translations (
  template_id       uuid not null references public.email_templates (id) on delete cascade,
  locale            text not null references public.languages (code) on update cascade,
  subject           text not null check (char_length(subject) between 1 and 200),
  preheader         text check (char_length(preheader) <= 200),
  body              text not null check (char_length(body) between 1 and 20000),
  status            text not null default 'draft' check (status in ('draft', 'published')),
  source_updated_at timestamptz not null default now(),   -- the source version this translation follows
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.profiles (id) on delete set null,
  primary key (template_id, locale)
);

create index email_template_translations_locale_idx on public.email_template_translations (locale);

create table public.content_pages (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind                 text not null default 'page' check (kind in ('page', 'guide', 'help', 'legal')),
  title                text not null check (char_length(title) between 1 and 200),
  summary              text check (char_length(summary) <= 500),
  body                 text not null default '' check (char_length(body) <= 100000),   -- rich text (see data/legal/types.ts markup)
  meta_title           text check (char_length(meta_title) <= 70),
  meta_description     text check (char_length(meta_description) <= 170),
  policy_version       text check (char_length(policy_version) between 1 and 40),     -- legal pages: what consents refer to
  status               text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at         timestamptz,
  translation_priority text not null default 'normal' check (translation_priority in ('high', 'normal', 'low')),
  content_updated_at   timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references public.profiles (id) on delete set null,
  updated_by           uuid references public.profiles (id) on delete set null,
  constraint content_pages_legal_version check (kind <> 'legal' or status <> 'published' or policy_version is not null),
  constraint content_pages_published_dated check (status <> 'published' or published_at is not null)
);

comment on table public.content_pages is
  'Editorial pages (aftercare guide, help articles, legal documents). Base columns = default language.';

create table public.content_page_translations (
  page_id           uuid not null references public.content_pages (id) on delete cascade,
  locale            text not null references public.languages (code) on update cascade,
  slug              text check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title             text not null check (char_length(title) between 1 and 200),
  summary           text check (char_length(summary) <= 500),
  body              text not null default '' check (char_length(body) <= 100000),
  meta_title        text check (char_length(meta_title) <= 70),
  meta_description  text check (char_length(meta_description) <= 170),
  status            text not null default 'draft' check (status in ('draft', 'published')),
  source_updated_at timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.profiles (id) on delete set null,
  primary key (page_id, locale),
  constraint content_page_translations_slug_unique unique (locale, slug)
);

-- Source side: stamp content changes; validate placeholders; publication date.
create or replace function private.prepare_email_template()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_unknown text[];
begin
  select array_agg(v) into v_unknown
    from unnest(private.text_placeholders(new.subject || ' ' || coalesce(new.preheader, '') || ' ' || new.body)) v
   where not (v = any (new.variables));
  if v_unknown is not null then
    raise exception 'email_templates: unknown placeholder(s) %', v_unknown using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.key is distinct from old.key then
    raise exception 'email_templates: the key is used by the sending code and cannot change' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' or new.subject is distinct from old.subject or new.preheader is distinct from old.preheader
     or new.body is distinct from old.body then
    new.content_updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function private.prepare_content_page()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.title is distinct from old.title or new.summary is distinct from old.summary
     or new.body is distinct from old.body or new.meta_title is distinct from old.meta_title
     or new.meta_description is distinct from old.meta_description then
    new.content_updated_at := now();
  end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    new.published_at := now();
  end if;
  return new;
end;
$$;

-- Translation side: which source version it follows; placeholders must exist in the source.
create or replace function private.prepare_email_translation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tpl     public.email_templates;
  v_unknown text[];
begin
  select * into v_tpl from public.email_templates where id = new.template_id;
  select array_agg(v) into v_unknown
    from unnest(private.text_placeholders(new.subject || ' ' || coalesce(new.preheader, '') || ' ' || new.body)) v
   where not (v = any (v_tpl.variables));
  if v_unknown is not null then
    raise exception 'email_template_translations: unknown placeholder(s) %', v_unknown using errcode = '23514';
  end if;
  if tg_op = 'INSERT' or new.subject is distinct from old.subject or new.preheader is distinct from old.preheader
     or new.body is distinct from old.body or (new.status = 'published' and old.status <> 'published') then
    new.source_updated_at := v_tpl.content_updated_at;
  else
    new.source_updated_at := old.source_updated_at;
  end if;
  return new;
end;
$$;

create or replace function private.prepare_content_translation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.title is distinct from old.title or new.summary is distinct from old.summary
     or new.body is distinct from old.body or new.meta_title is distinct from old.meta_title
     or new.meta_description is distinct from old.meta_description
     or (new.status = 'published' and old.status <> 'published') then
    new.source_updated_at := (select p.content_updated_at from public.content_pages p where p.id = new.page_id);
  else
    new.source_updated_at := old.source_updated_at;
  end if;
  return new;
end;
$$;

create trigger email_templates_audit_columns
  before insert or update on public.email_templates
  for each row execute function private.set_audit_columns();
create trigger email_templates_prepare
  before insert or update on public.email_templates
  for each row execute function private.prepare_email_template();
create trigger content_pages_audit_columns
  before insert or update on public.content_pages
  for each row execute function private.set_audit_columns();
create trigger content_pages_prepare
  before insert or update on public.content_pages
  for each row execute function private.prepare_content_page();
create trigger email_template_translations_prepare
  before insert or update on public.email_template_translations
  for each row execute function private.prepare_email_translation();
create trigger content_page_translations_prepare
  before insert or update on public.content_page_translations
  for each row execute function private.prepare_content_translation();

do $$
declare
  t text;
begin
  foreach t in array array['email_templates', 'email_template_translations', 'content_pages', 'content_page_translations']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['email_template_translations', 'content_page_translations']
  loop
    execute format(
      'create trigger %I before insert or update on public.%I
         for each row execute function private.reject_default_locale_translation()',
      t || '_not_default_locale', t);
    execute format(
      'create trigger %I before insert or update on public.%I
         for each row execute function private.set_translation_audit()',
      t || '_audit', t);
  end loop;
end;
$$;

create trigger email_templates_audit_log
  after insert or update or delete on public.email_templates
  for each row execute function private.audit_changes('subject', 'preheader', 'body', 'variables', 'is_active');
create trigger content_pages_audit_log
  after insert or update or delete on public.content_pages
  for each row execute function private.audit_changes('status', 'slug', 'policy_version', 'kind');

-- Translation coverage for the Translations workspace: one row per item and
-- enabled non-default language. state: missing | draft | outdated | published.
create view public.translation_status
with (security_invoker = true) as
with langs as (
  select code from public.languages where is_enabled and not is_default
)
select 'email'::text as item_type, t.id as item_id, t.key as item_key, t.name as item_name,
       t.translation_priority as priority, t.content_updated_at as source_updated_at, l.code as locale,
       case when tr.template_id is null then 'missing'
            when tr.source_updated_at < t.content_updated_at then 'outdated'
            else tr.status end as state,
       tr.updated_at as translation_updated_at
  from public.email_templates t
  cross join langs l
  left join public.email_template_translations tr on tr.template_id = t.id and tr.locale = l.code
union all
select 'content', p.id, p.slug, p.title, p.translation_priority, p.content_updated_at, l.code,
       case when tr.page_id is null then 'missing'
            when tr.source_updated_at < p.content_updated_at then 'outdated'
            else tr.status end,
       tr.updated_at
  from public.content_pages p
  cross join langs l
  left join public.content_page_translations tr on tr.page_id = p.id and tr.locale = l.code
 where p.status <> 'archived';

comment on view public.translation_status is
  'Translation coverage of e-mails and content pages per enabled language (missing/draft/outdated/published). Staff (RLS applies).';

-- The sending code: the template in the customer's language, or the default
-- language when no published, up-to-date-or-not translation exists.
create or replace function public.email_template_for(p_key text, p_locale text)
returns table (locale text, subject text, preheader text, body text, variables text[], outdated boolean)
language sql
stable
set search_path = ''
as $$
  select coalesce(tr.locale, (select l.code from public.languages l where l.is_default)),
         coalesce(tr.subject, t.subject), coalesce(tr.preheader, t.preheader), coalesce(tr.body, t.body),
         t.variables, coalesce(tr.source_updated_at < t.content_updated_at, false)
    from public.email_templates t
    left join public.email_template_translations tr
      on tr.template_id = t.id and tr.locale = p_locale and tr.status = 'published'
   where t.key = p_key and t.is_active;
$$;

-- Templates the backend sends (French base, English published). Wording is a
-- starting point for the team; the variables are what the sending code provides.
insert into public.email_templates (key, name, description, subject, preheader, body, variables, translation_priority) values
  ('order_confirmation', 'Order confirmation', 'Sent when an order is paid',
   'Votre commande {{order_number}} est confirmée', 'Merci — nous préparons votre colis.',
   E'Bonjour {{first_name}},\n\nMerci pour votre commande. Nous la préparons avec soin et vous écrirons dès son expédition.',
   array['first_name', 'order_number'], 'high'),
  ('shipping_notification', 'Shipping notification', 'Sent when a parcel leaves the studio',
   'Votre commande est en route', 'Suivez votre colis en un clic.',
   E'Bonjour {{first_name}},\n\nBonne nouvelle : votre commande {{order_number}} a quitté notre studio. Suivez-la ici : {{tracking_url}}',
   array['first_name', 'order_number', 'tracking_url'], 'normal'),
  ('course_enrolment', 'Course enrolment welcome', 'Sent when a training is purchased',
   'Bienvenue dans {{course_name}}', 'Votre première leçon vous attend.',
   E'Bonjour {{first_name}},\n\nBienvenue à l''Academy. Votre formation est prête — commencez la première leçon quand vous le souhaitez.',
   array['first_name', 'course_name'], 'normal'),
  ('newsletter_confirmation', 'Newsletter confirmation', 'Sent after a visitor subscribes (double opt-in)',
   'Confirmez votre inscription', 'Un clic pour recevoir nos nouveautés.',
   E'Bonjour,\n\nConfirmez votre inscription à la newsletter Global Toothgems : {{confirm_url}}\n\nSi vous n''êtes pas à l''origine de cette demande, ignorez ce message.',
   array['confirm_url'], 'high'),
  ('contact_acknowledgement', 'Contact acknowledgement', 'Sent when a contact form is received',
   'Nous avons bien reçu votre message ({{ticket_number}})', 'Notre équipe vous répond rapidement.',
   E'Bonjour {{name}},\n\nNous avons bien reçu votre message « {{subject}} ». Votre référence : {{ticket_number}}. Notre équipe vous répondra dans les meilleurs délais.',
   array['name', 'subject', 'ticket_number'], 'normal');

insert into public.email_template_translations (template_id, locale, subject, preheader, body, status)
select t.id, 'en', v.subject, v.preheader, v.body, 'published'
  from (values
    ('order_confirmation', 'Your order {{order_number}} is confirmed', 'Thank you — we are preparing your parcel.',
     E'Hello {{first_name}},\n\nThank you for your order. We are preparing it with care and will email you as soon as it ships.'),
    ('shipping_notification', 'Your order is on its way', 'Track your parcel in one click.',
     E'Hello {{first_name}},\n\nGood news: your order {{order_number}} has left our studio. Follow it here: {{tracking_url}}'),
    ('course_enrolment', 'Welcome to {{course_name}}', 'Your first lesson is ready.',
     E'Hello {{first_name}},\n\nWelcome to the Academy. Your training is ready — start the first lesson whenever you like.'),
    ('newsletter_confirmation', 'Confirm your subscription', 'One click to get our news.',
     E'Hello,\n\nPlease confirm your subscription to the Global Toothgems newsletter: {{confirm_url}}\n\nIf you did not ask for it, just ignore this e-mail.'),
    ('contact_acknowledgement', 'We received your message ({{ticket_number}})', 'Our team will get back to you soon.',
     E'Hello {{name}},\n\nWe received your message "{{subject}}". Your reference: {{ticket_number}}. Our team will reply as soon as possible.')
  ) as v(key, subject, preheader, body)
  join public.email_templates t on t.key = v.key;

-- -----------------------------------------------------------------------------
-- 5. Privileges and RLS
-- -----------------------------------------------------------------------------
revoke truncate, references, trigger on
  public.store_settings, public.contact_requests, public.contact_request_notes, public.newsletter_subscriptions,
  public.email_templates, public.email_template_translations, public.content_pages, public.content_page_translations
  from anon, authenticated;
revoke all on public.contact_requests, public.contact_request_notes, public.newsletter_subscriptions,
              public.email_templates, public.email_template_translations, public.translation_status
  from anon;
revoke insert, update, delete on public.store_settings, public.content_pages, public.content_page_translations from anon;
revoke insert, delete on public.store_settings, public.contact_requests from authenticated;
revoke insert, update, delete on public.newsletter_subscriptions from authenticated;
revoke all on sequence public.contact_request_number_seq from anon, authenticated;
-- Tokens are never readable through the API (staff see the rest of the row).
revoke select on public.newsletter_subscriptions from authenticated;
grant select (id, email, user_id, locale, status, source, policy_version, confirmation_sent_at, confirmed_at,
              unsubscribed_at, created_at, updated_at)
  on public.newsletter_subscriptions to authenticated;
revoke all on public.translation_status from authenticated;
grant select on public.translation_status to authenticated;

create policy "store_settings: everyone reads"
  on public.store_settings for select to anon, authenticated using (true);
create policy "store_settings: settings managers update"
  on public.store_settings for update to authenticated
  using ((select private.has_permission('manage_settings')))
  with check ((select private.has_permission('manage_settings')));

create policy "contact_requests: requesters read own, staff read all"
  on public.contact_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_staff()));
create policy "contact_requests: support triages"
  on public.contact_requests for update to authenticated
  using ((select private.has_permission('manage_customers')))
  with check ((select private.has_permission('manage_customers')));

create policy "contact_request_notes: staff read"
  on public.contact_request_notes for select to authenticated using ((select private.is_staff()));
create policy "contact_request_notes: support writes"
  on public.contact_request_notes for insert to authenticated
  with check ((select private.has_permission('manage_customers')));
create policy "contact_request_notes: authors edit own"
  on public.contact_request_notes for update to authenticated
  using ((select private.has_permission('manage_customers')) and author_id = (select auth.uid()))
  with check ((select private.has_permission('manage_customers')) and author_id = (select auth.uid()));
create policy "contact_request_notes: support deletes"
  on public.contact_request_notes for delete to authenticated
  using ((select private.has_permission('manage_customers')));

create policy "newsletter_subscriptions: members read own, staff read all"
  on public.newsletter_subscriptions for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_staff()));

create policy "email_templates: staff read"
  on public.email_templates for select to authenticated using ((select private.is_staff()));
create policy "email_template_translations: staff read"
  on public.email_template_translations for select to authenticated using ((select private.is_staff()));

create policy "content_pages: public reads published, staff read all"
  on public.content_pages for select to anon, authenticated
  using (status = 'published' or (select private.is_staff()));
create policy "content_page_translations: public reads published, staff read all"
  on public.content_page_translations for select to anon, authenticated
  using ((status = 'published' and exists (select 1 from public.content_pages p
                                            where p.id = content_page_translations.page_id and p.status = 'published'))
         or (select private.is_staff()));

do $$
declare
  t   text;
  cmd text;
begin
  foreach t in array array['email_templates', 'email_template_translations', 'content_pages', 'content_page_translations']
  loop
    foreach cmd in array array['insert', 'update', 'delete']
    loop
      execute format(
        'create policy %I on public.%I for %s to authenticated %s',
        t || ': content managers ' || cmd, t, cmd,
        case cmd
          when 'insert' then 'with check ((select private.has_permission(''manage_content'')))'
          when 'update' then 'using ((select private.has_permission(''manage_content''))) '
                          || 'with check ((select private.has_permission(''manage_content'')))'
          else 'using ((select private.has_permission(''manage_content'')))'
        end);
    end loop;
  end loop;
end;
$$;

revoke all on function private.stamp_maintenance(), private.guard_contact_request_update(),
                       private.prepare_contact_note(), private.sync_newsletter_from_consent(),
                       private.link_newsletter_on_signup(), private.text_placeholders(text),
                       private.prepare_email_template(), private.prepare_content_page(),
                       private.prepare_email_translation(), private.prepare_content_translation()
  from public;
grant execute on function private.text_placeholders(text) to authenticated, service_role;

revoke all on function public.submit_contact_request(text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.submit_contact_request(text, text, text, text, text, text, text, text) to authenticated, service_role;
revoke all on function public.newsletter_subscribe(text, text, text, text) from public, anon, authenticated;
grant execute on function public.newsletter_subscribe(text, text, text, text) to service_role;
revoke all on function public.newsletter_confirm(text) from public;
grant execute on function public.newsletter_confirm(text) to anon, authenticated, service_role;
revoke all on function public.newsletter_unsubscribe(text) from public;
grant execute on function public.newsletter_unsubscribe(text) to anon, authenticated, service_role;
revoke all on function public.email_template_for(text, text) from public, anon, authenticated;
grant execute on function public.email_template_for(text, text) to service_role;

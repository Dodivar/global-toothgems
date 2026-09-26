-- =============================================================================
-- Migration 019 — Member account data (iteration 5)
-- =============================================================================
-- Closes the gap between the member-area prototype (webapp/src/pages/account,
-- lib/auth.tsx, lib/registration.ts, lib/securityState.tsx, lib/cookieConsent.tsx,
-- data/loyalty.ts, data/adminCustomers.ts) and the database. Training (courses,
-- lessons, certificates) and the community it unlocks are NOT covered here.
--
--   * profiles: registration answers (country, persona, interest), preferred
--     language, birth date, password-change date, marketing opt-in cache.
--   * consent_records: append-only proof of consent (terms, privacy, marketing
--     email, cookie categories) with policy version and source.
--   * data_export_requests + private `data-exports` bucket (GDPR access).
--   * loyalty club: settings, cards, stamps — a stamp per qualifying paid order,
--     awarded by trigger, voided when the order is cancelled or fully refunded.
--   * CRM: customer_tags and customer_notes (staff only).
--   * review_requests view: what the member can still review.
--
-- What is deliberately NOT stored here (Supabase Auth owns it):
--   email verification (auth.users.email_confirmed_at), pending email change
--   (auth.users.email_change / email_change_sent_at), passwords, sessions,
--   Google identities (auth.identities). Account deletion = auth admin
--   deleteUser from the backend; profiles cascade, orders keep their snapshots.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Profiles: what registration and the profile form collect
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column country_code        char(2) check (country_code ~ '^[A-Z]{2}$'),
  add column preferred_locale    text not null default 'fr' references public.languages (code) on update cascade,
  add column persona             text check (persona in ('artist', 'student', 'customer', 'other')),
  add column interest            text check (interest in ('products', 'training', 'community', 'all')),
  add column birth_date          date check (birth_date between date '1900-01-01' and date '2020-01-01'),
  add column marketing_opt_in    boolean not null default false,
  add column password_changed_at timestamptz;

comment on column public.profiles.country_code is
  'Country declared at registration (ISO 3166-1). Not a shipping or tax country: those come from addresses.';
comment on column public.profiles.preferred_locale is 'Language for emails and the UI when signed in.';
comment on column public.profiles.persona is 'Registration answer: who the member is. Presentation/segmentation only.';
comment on column public.profiles.interest is 'Registration answer: what the member came for. Presentation/segmentation only.';
comment on column public.profiles.marketing_opt_in is
  'Cache of the latest marketing_email consent record. Written by trigger only; consent_records is the source of truth.';
comment on column public.profiles.password_changed_at is
  'Set by the backend after a password change through Supabase Auth ("last changed" on Security & privacy).';

-- The customer may edit identity/preferences; the consent cache and the
-- password date are system-maintained.
create or replace function private.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_trusted_backend() then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.email is distinct from old.email
     or new.created_at is distinct from old.created_at
     or new.marketing_opt_in is distinct from old.marketing_opt_in
     or new.password_changed_at is distinct from old.password_changed_at then
    raise exception 'profiles: id, email, created_at, marketing_opt_in and password_changed_at are read-only'
      using errcode = '42501';
  end if;

  if (new.role is distinct from old.role or new.status is distinct from old.status)
     and not private.is_admin() then
    raise exception 'profiles: only administrators can change role or status'
      using errcode = '42501';
  end if;

  -- An admin cannot lock themselves out by demoting/suspending their own account.
  if new.id = auth.uid()
     and (new.role is distinct from old.role or new.status is distinct from old.status) then
    raise exception 'profiles: administrators cannot change their own role or status'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Consent records (append-only)
-- -----------------------------------------------------------------------------
create table public.consent_records (
  id             uuid primary key default gen_random_uuid(),
  -- CASCADE: consent history is personal data and goes with the account.
  user_id        uuid not null references public.profiles (id) on delete cascade,
  purpose        text not null check (purpose in
                   ('terms', 'privacy', 'marketing_email',
                    'cookies_preferences', 'cookies_analytics', 'cookies_marketing')),
  granted        boolean not null,
  policy_version text not null check (char_length(btrim(policy_version)) between 1 and 40),
  source         text not null check (source in ('registration', 'account', 'cookie_banner', 'checkout', 'admin', 'import')),
  created_at     timestamptz not null default now(),
  -- Terms and privacy are accepted to hold an account; refusing them is not a record, it is no account.
  constraint consent_records_required_granted check (purpose not in ('terms', 'privacy') or granted)
);

comment on table public.consent_records is
  'Append-only proof of consent: what, granted or withdrawn, which policy version, from where, when.';

create index consent_records_user_purpose_idx on public.consent_records (user_id, purpose, created_at desc);
alter table public.consent_records enable row level security;

-- Customers may only state their own choice, now.
create or replace function private.prepare_consent_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_trusted_backend() then
    return new;
  end if;
  if new.user_id is distinct from auth.uid() then
    raise exception 'consent_records: you can only record your own consent' using errcode = '42501';
  end if;
  if new.source not in ('account', 'cookie_banner', 'checkout') then
    raise exception 'consent_records: source not allowed' using errcode = '42501';
  end if;
  new.created_at := now();
  return new;
end;
$$;

create trigger consent_records_prepare_insert
  before insert on public.consent_records
  for each row execute function private.prepare_consent_insert();

-- Keep profiles.marketing_opt_in equal to the latest marketing_email record.
create or replace function private.sync_marketing_opt_in()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.purpose = 'marketing_email' then
    update public.profiles set marketing_opt_in = new.granted where id = new.user_id;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_marketing_opt_in() from public;

create trigger consent_records_sync_marketing
  after insert on public.consent_records
  for each row execute function private.sync_marketing_opt_in();

-- Current state per purpose (latest record wins).
create view public.member_consents
with (security_invoker = true) as
select distinct on (c.user_id, c.purpose)
       c.user_id, c.purpose, c.granted, c.policy_version, c.source, c.created_at as decided_at
  from public.consent_records c
 order by c.user_id, c.purpose, c.created_at desc, c.id desc;

comment on view public.member_consents is 'Latest consent decision per member and purpose (RLS of consent_records applies).';

-- -----------------------------------------------------------------------------
-- 3. Sign-up: copy the registration answers (validated, never authorization)
-- -----------------------------------------------------------------------------
-- Metadata is client-supplied: each field is validated and silently dropped
-- when invalid, so a bad value can never block an account from being created.
-- Role is still ALWAYS the default. Consents given on the registration form are
-- recorded with the policy version the form declared.
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta      jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_country text  := upper(nullif(trim(meta ->> 'country'), ''));
  v_locale  text  := lower(nullif(trim(meta ->> 'locale'), ''));
  v_phone   text  := nullif(trim(meta ->> 'phone'), '');
  v_persona text  := nullif(trim(meta ->> 'persona'), '');
  v_interest text := nullif(trim(meta ->> 'interest'), '');
  v_version text  := left(nullif(trim(meta ->> 'policy_version'), ''), 40);
begin
  insert into public.profiles (id, email, first_name, last_name, display_name, phone,
                               country_code, preferred_locale, persona, interest)
  values (
    new.id,
    new.email,
    left(nullif(trim(meta ->> 'first_name'), ''), 100),
    left(nullif(trim(meta ->> 'last_name'), ''), 100),
    left(nullif(trim(meta ->> 'display_name'), ''), 100),
    case when v_phone ~ '^\+?[0-9 ().-]{6,20}$' then v_phone end,
    case when v_country ~ '^[A-Z]{2}$' then v_country end,
    coalesce((select l.code from public.languages l where l.code = v_locale and l.is_enabled), 'fr'),
    case when v_persona in ('artist', 'student', 'customer', 'other') then v_persona end,
    case when v_interest in ('products', 'training', 'community', 'all') then v_interest end
  )
  on conflict (id) do nothing;

  if v_version is not null then
    if (meta ->> 'terms_accepted') = 'true' then
      insert into public.consent_records (user_id, purpose, granted, policy_version, source)
      values (new.id, 'terms', true, v_version, 'registration'),
             (new.id, 'privacy', true, v_version, 'registration');
    end if;
    if (meta ->> 'marketing') in ('true', 'false') then
      insert into public.consent_records (user_id, purpose, granted, policy_version, source)
      values (new.id, 'marketing_email', (meta ->> 'marketing')::boolean, v_version, 'registration');
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public;

-- -----------------------------------------------------------------------------
-- 4. Personal-data export requests (GDPR art. 15/20)
-- -----------------------------------------------------------------------------
create table public.data_export_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending'
               check (status in ('pending', 'processing', 'ready', 'expired', 'failed')),
  requested_at timestamptz not null default now(),
  ready_at     timestamptz,
  expires_at   timestamptz,
  storage_path text check (storage_path !~ '^/' and storage_path !~ '\.\.'),   -- data-exports/<user_id>/<file>
  error        text check (char_length(error) <= 500),                          -- internal, never shown as-is
  updated_at   timestamptz not null default now(),
  constraint data_export_ready_complete
    check (status <> 'ready' or (ready_at is not null and expires_at is not null and storage_path is not null)),
  constraint data_export_path_own_folder
    check (storage_path is null or storage_path like user_id::text || '/%')
);

comment on table public.data_export_requests is
  'Personal-data archive requests. Customers create them; only the backend job moves them forward.';

-- One request in flight per member.
create unique index data_export_one_active_idx on public.data_export_requests (user_id)
  where status in ('pending', 'processing');
create index data_export_user_idx on public.data_export_requests (user_id, requested_at desc);
alter table public.data_export_requests enable row level security;

create trigger data_export_requests_set_updated_at
  before update on public.data_export_requests
  for each row execute function private.set_updated_at();

create or replace function private.prepare_data_export_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_trusted_backend() then
    return new;
  end if;
  if new.user_id is distinct from auth.uid() then
    raise exception 'data_export_requests: you can only request your own data' using errcode = '42501';
  end if;
  new.status       := 'pending';
  new.requested_at := now();
  new.ready_at     := null;
  new.expires_at   := null;
  new.storage_path := null;
  new.error        := null;
  return new;
end;
$$;

create trigger data_export_requests_prepare_insert
  before insert on public.data_export_requests
  for each row execute function private.prepare_data_export_insert();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('data-exports', 'data-exports', false, 104857600,   -- 100 MB
        array['application/zip', 'application/json'])
on conflict (id) do nothing;

-- Owners read their own archive (signed URL); only the backend writes.
create policy "data-exports: owners read own folder"
  on storage.objects for select to authenticated
  using (bucket_id = 'data-exports' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- -----------------------------------------------------------------------------
-- 5. Loyalty club
-- -----------------------------------------------------------------------------
create table public.loyalty_settings (
  id                boolean primary key default true check (id),     -- single row
  is_active         boolean not null default true,
  stamps_per_card   smallint not null default 5 check (stamps_per_card between 1 and 20),
  qualifying_amount numeric(12, 2) not null default 20.00 check (qualifying_amount >= 0),
  reward_percent    smallint not null default 10 check (reward_percent between 1 and 100),
  currency          char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles (id) on delete set null
);

comment on table public.loyalty_settings is
  'Loyalty club rules (single row). One stamp per paid order of at least qualifying_amount of goods; a full card unlocks reward_percent off one order.';

insert into public.loyalty_settings (id) values (true) on conflict (id) do nothing;
alter table public.loyalty_settings enable row level security;

create trigger loyalty_settings_audit_columns
  before insert or update on public.loyalty_settings
  for each row execute function private.set_audit_columns();

create table public.loyalty_cards (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  status            text not null default 'collecting'
                    check (status in ('collecting', 'completed', 'redeemed', 'cancelled')),
  stamps_required   smallint not null check (stamps_required between 1 and 20),   -- snapshot of the rule
  reward_percent    smallint not null check (reward_percent between 1 and 100),   -- snapshot of the rule
  stamps_count      smallint not null default 0 check (stamps_count >= 0),         -- trigger-kept cache
  completed_at      timestamptz,
  redeemed_at       timestamptz,
  redeemed_order_id uuid references public.orders (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint loyalty_cards_count_le_required check (stamps_count <= stamps_required),
  constraint loyalty_cards_completed_dated check (status = 'collecting' or status = 'cancelled' or completed_at is not null),
  constraint loyalty_cards_redeemed_dated check (status <> 'redeemed' or redeemed_at is not null)
);

comment on table public.loyalty_cards is
  'Stamp cards. completed = reward waiting for the next order; redeemed = reward used (redemption arrives with promotions/checkout).';

create unique index loyalty_cards_one_collecting_idx on public.loyalty_cards (user_id) where status = 'collecting';
create index loyalty_cards_user_idx on public.loyalty_cards (user_id, created_at desc);
alter table public.loyalty_cards enable row level security;

create trigger loyalty_cards_set_updated_at
  before update on public.loyalty_cards
  for each row execute function private.set_updated_at();

create table public.loyalty_stamps (
  id             uuid primary key default gen_random_uuid(),
  card_id        uuid not null references public.loyalty_cards (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  order_id       uuid not null references public.orders (id) on delete cascade,
  order_amount   numeric(12, 2) not null check (order_amount >= 0),   -- qualifying goods amount, snapshot
  currency       char(3) not null check (currency ~ '^[A-Z]{3}$'),
  earned_at      timestamptz not null default now(),
  voided_at      timestamptz,
  void_reason    text check (void_reason in ('order_cancelled', 'order_refunded', 'admin')),
  constraint loyalty_stamps_void_pair check ((voided_at is null) = (void_reason is null))
);

comment on table public.loyalty_stamps is
  'One stamp per qualifying paid order (never two for the same order). Written by trigger only.';

create unique index loyalty_stamps_one_per_order_idx on public.loyalty_stamps (order_id);
create index loyalty_stamps_card_idx on public.loyalty_stamps (card_id);
create index loyalty_stamps_user_idx on public.loyalty_stamps (user_id, earned_at desc);
alter table public.loyalty_stamps enable row level security;

-- Keep the card count and state in step with its valid stamps.
create or replace function private.refresh_loyalty_card(p_card_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count smallint;
begin
  select count(*) into v_count from public.loyalty_stamps where card_id = p_card_id and voided_at is null;
  update public.loyalty_cards c
     set stamps_count = least(v_count, c.stamps_required),
         status       = case when c.status = 'collecting' and v_count >= c.stamps_required then 'completed'
                             else c.status end,
         completed_at = case when c.status = 'collecting' and v_count >= c.stamps_required then now()
                             else c.completed_at end
   where c.id = p_card_id;
end;
$$;

revoke all on function private.refresh_loyalty_card(uuid) from public;

-- Award on payment; void on cancellation / full refund.
-- Qualifying amount = goods (gift cards excluded) minus discount, shipping excluded,
-- in the programme currency. Gift-card payments still count: they are a payment,
-- not a discount.
create or replace function private.apply_loyalty_on_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s        public.loyalty_settings;
  v_amount numeric(12, 2);
  v_card   uuid;
  v_stamp  public.loyalty_stamps;
begin
  if new.user_id is null then
    return new;
  end if;

  -- Void first: a cancelled or fully refunded order loses its stamp while the
  -- card is still being collected. A completed card is left as is.
  if (new.status in ('cancelled', 'refunded') and old.status is distinct from new.status)
     or (new.payment_status = 'refunded' and old.payment_status is distinct from 'refunded') then
    select * into v_stamp from public.loyalty_stamps where order_id = new.id and voided_at is null;
    if found and exists (select 1 from public.loyalty_cards where id = v_stamp.card_id and status = 'collecting') then
      update public.loyalty_stamps
         set voided_at = now(),
             void_reason = case when new.status = 'cancelled' then 'order_cancelled' else 'order_refunded' end
       where id = v_stamp.id;
      perform private.refresh_loyalty_card(v_stamp.card_id);
    end if;
    return new;
  end if;

  if not (new.payment_status = 'paid' and old.payment_status is distinct from 'paid') then
    return new;
  end if;

  select * into s from public.loyalty_settings where id;
  if not found or not s.is_active or new.currency <> s.currency then
    return new;
  end if;

  select coalesce(sum(i.subtotal_amount), 0) - new.discount_amount
    into v_amount
    from public.order_items i
    join public.products p on p.id = i.product_id
   where i.order_id = new.id and p.product_type <> 'gift_card';
  if v_amount < s.qualifying_amount then
    return new;
  end if;

  select id into v_card from public.loyalty_cards where user_id = new.user_id and status = 'collecting';
  if v_card is null then
    insert into public.loyalty_cards (user_id, stamps_required, reward_percent)
    values (new.user_id, s.stamps_per_card, s.reward_percent)
    returning id into v_card;
  end if;

  insert into public.loyalty_stamps (card_id, user_id, order_id, order_amount, currency)
  values (v_card, new.user_id, new.id, v_amount, new.currency)
  on conflict (order_id) do nothing;

  perform private.refresh_loyalty_card(v_card);
  return new;
end;
$$;

revoke all on function private.apply_loyalty_on_order() from public;

create trigger orders_apply_loyalty
  after update of payment_status, status on public.orders
  for each row execute function private.apply_loyalty_on_order();

-- The member's club at a glance: the UI derives "start" (no card ever),
-- "collecting", "one away", "unlocked" (reward_ready) and "renewed" (fresh card
-- after a redeemed one) from these figures.
create view public.loyalty_overview
with (security_invoker = true) as
select p.id                                                                     as user_id,
       coalesce(cur.stamps_count, 0)                                            as current_stamps,
       coalesce(cur.stamps_required, s.stamps_per_card)                         as stamps_required,
       (select count(*) from public.loyalty_cards c
         where c.user_id = p.id and c.status = 'completed')                     as rewards_available,
       (select count(*) from public.loyalty_cards c
         where c.user_id = p.id and c.status = 'redeemed')                      as cards_redeemed,
       (select count(*) from public.loyalty_stamps st
         where st.user_id = p.id and st.voided_at is null)                      as stamps_lifetime,
       s.qualifying_amount, s.reward_percent, s.currency, s.is_active           as programme_active
  from public.profiles p
  cross join public.loyalty_settings s
  left join public.loyalty_cards cur on cur.user_id = p.id and cur.status = 'collecting';

comment on view public.loyalty_overview is 'Loyalty state per member (RLS of profiles/cards/stamps applies).';

create trigger loyalty_settings_audit_log
  after insert or update or delete on public.loyalty_settings
  for each row execute function private.audit_changes();
create trigger loyalty_cards_audit_log
  after update or delete on public.loyalty_cards
  for each row execute function private.audit_changes('status');

-- -----------------------------------------------------------------------------
-- 6. CRM: tags and internal notes on a customer (staff only)
-- -----------------------------------------------------------------------------
create table public.customer_tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  tag        text not null check (tag in
               ('vip', 'repeat', 'training_student', 'training_completed', 'new_customer', 'high_value', 'follow_up')),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  constraint customer_tags_unique unique (user_id, tag)
);

comment on table public.customer_tags is 'Tags set by hand by staff. Never derived: they express a judgement.';
alter table public.customer_tags enable row level security;

create table public.customer_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null default auth.uid(),
  body       text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.customer_notes is 'Internal notes about a customer. Never visible to the customer.';
create index customer_notes_user_idx on public.customer_notes (user_id, created_at desc);
alter table public.customer_notes enable row level security;

create trigger customer_notes_set_updated_at
  before update on public.customer_notes
  for each row execute function private.set_updated_at();

create trigger customer_tags_audit_log
  after insert or delete on public.customer_tags
  for each row execute function private.audit_changes();

-- -----------------------------------------------------------------------------
-- 7. Review requests: what the member received and has not reviewed yet
-- -----------------------------------------------------------------------------
create view public.review_requests
with (security_invoker = true) as
select distinct on (o.user_id, i.product_id)
       o.user_id, i.product_id, o.id as order_id, o.order_number,
       i.product_name, o.created_at as ordered_at
  from public.orders o
  join public.order_items i on i.order_id = o.id
  join public.products p on p.id = i.product_id and p.status = 'active' and p.product_type = 'physical'
 where o.user_id is not null
   and o.status in ('shipped', 'delivered')
   and not exists (select 1 from public.reviews r where r.user_id = o.user_id and r.product_id = i.product_id)
 order by o.user_id, i.product_id, o.created_at desc;

comment on view public.review_requests is 'Products the member can review (RLS of orders/reviews applies).';

-- -----------------------------------------------------------------------------
-- 8. Privileges and RLS
-- -----------------------------------------------------------------------------
revoke all on public.consent_records, public.data_export_requests, public.loyalty_cards,
              public.loyalty_stamps, public.customer_tags, public.customer_notes,
              public.member_consents, public.loyalty_overview, public.review_requests
  from anon;
revoke insert, update, delete on public.loyalty_settings from anon;
revoke truncate, references, trigger on public.consent_records, public.data_export_requests,
       public.loyalty_settings, public.loyalty_cards, public.loyalty_stamps,
       public.customer_tags, public.customer_notes
  from anon, authenticated;

-- Append-only / backend-written.
revoke update, delete on public.consent_records from authenticated;
revoke update, delete on public.data_export_requests from authenticated;
revoke insert, update, delete on public.loyalty_cards, public.loyalty_stamps from authenticated;
revoke insert, delete on public.loyalty_settings from authenticated;
revoke all on public.member_consents, public.loyalty_overview, public.review_requests from authenticated;
grant select on public.member_consents, public.loyalty_overview, public.review_requests to authenticated;

-- consent_records
create policy "consent_records: read own, admins read all"
  on public.consent_records for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy "consent_records: record own"
  on public.consent_records for insert to authenticated
  with check (user_id = (select auth.uid()));

-- data_export_requests
create policy "data_export_requests: read own, admins read all"
  on public.data_export_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy "data_export_requests: request own"
  on public.data_export_requests for insert to authenticated
  with check (user_id = (select auth.uid()));

-- loyalty
create policy "loyalty_settings: everyone reads"
  on public.loyalty_settings for select to anon, authenticated
  using (true);
create policy "loyalty_settings: admins update"
  on public.loyalty_settings for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "loyalty_cards: read own, admins read all"
  on public.loyalty_cards for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy "loyalty_stamps: read own, admins read all"
  on public.loyalty_stamps for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- CRM (admins only; customers never see their tags or notes)
create policy "customer_tags: admins read"
  on public.customer_tags for select to authenticated using ((select private.is_admin()));
create policy "customer_tags: admins insert"
  on public.customer_tags for insert to authenticated with check ((select private.is_admin()));
create policy "customer_tags: admins delete"
  on public.customer_tags for delete to authenticated using ((select private.is_admin()));
revoke update on public.customer_tags from authenticated;

create policy "customer_notes: admins read"
  on public.customer_notes for select to authenticated using ((select private.is_admin()));
create policy "customer_notes: admins insert"
  on public.customer_notes for insert to authenticated
  with check ((select private.is_admin()) and author_id = (select auth.uid()));
create policy "customer_notes: authors update own"
  on public.customer_notes for update to authenticated
  using ((select private.is_admin()) and author_id = (select auth.uid()))
  with check ((select private.is_admin()) and author_id = (select auth.uid()));
create policy "customer_notes: admins delete"
  on public.customer_notes for delete to authenticated using ((select private.is_admin()));

-- =============================================================================
-- Members' privacy rights: personal-data export and account erasure (decision 123)
-- =============================================================================
-- GDPR art. 15/20 (access, portability) and art. 17 (erasure), for signed-in
-- members, replacing the simulated Security & privacy page.
--
--   my_personal_data()             the member's own data as one JSON archive,
--                                  built here and returned at once (no file kept);
--                                  at most one every 5 minutes (data_export_requests)
--   my_account_erasure_blockers()  what stops the member's erasure now, if anything
--   account_erasure_files(uuid)    service role: the member's own Storage files
--   erase_account(uuid)            service role: the erasure itself, one transaction
--                                  (called by the Edge Function `delete-account`,
--                                  which first removes the Storage files)
--
-- What an erasure keeps (legal obligations, art. 17(3)(b)/(e)):
--   * orders, their lines, parcels, refunds and every invoice / credit note
--     (`invoices` is immutable; 10 years, art. L123-22 Code de commerce), with
--     `orders.user_id` set null as before;
--   * 3D Studio subscriptions, their invoices and withdrawals: they back the
--     FA-/AV- documents. Their `user_id` now goes null instead of cascading —
--     the cascade used to hit `invoices` (on delete restrict), so a Studio
--     subscriber could not be deleted at all;
--   * the consent to immediate access recorded at a Studio payment (L221-25),
--     user_id set null; every other consent record goes with the account;
--   * customer-service tickets and their attachments (user_id set null, as before);
--   * the newsletter row, turned `unsubscribed` (opposition list; the Resend
--     contact sync removes the contact).
-- Everything else linked to the profile goes by the existing cascades. The
-- audit trigger no longer copies the rows an erasure deletes into `audit_logs`
-- (it records the reason only), and one audit row records the erasure itself.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Studio billing records and the Studio consent outlive the account
-- -----------------------------------------------------------------------------
alter table public.studio_subscriptions alter column user_id drop not null;
alter table public.studio_subscriptions
  drop constraint studio_subscriptions_user_id_fkey,
  add constraint studio_subscriptions_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete set null;

alter table public.studio_subscription_invoices alter column user_id drop not null;
alter table public.studio_subscription_invoices
  drop constraint studio_subscription_invoices_user_id_fkey,
  add constraint studio_subscription_invoices_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete set null;

alter table public.studio_withdrawals alter column user_id drop not null;
alter table public.studio_withdrawals
  drop constraint studio_withdrawals_user_id_fkey,
  add constraint studio_withdrawals_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete set null;

alter table public.consent_records alter column user_id drop not null;
alter table public.consent_records
  drop constraint consent_records_user_id_fkey,
  add constraint consent_records_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete set null;

comment on column public.consent_records.user_id is
  'Null once the account is erased: only the Studio immediate-access consents (L221-25) are kept then.';

-- -----------------------------------------------------------------------------
-- 2. Export requests: an archive delivered at once is `delivered`
-- -----------------------------------------------------------------------------
alter table public.data_export_requests drop constraint data_export_requests_status_check;
alter table public.data_export_requests add constraint data_export_requests_status_check
  check (status in ('pending', 'processing', 'ready', 'expired', 'failed', 'delivered'));

comment on table public.data_export_requests is
  'Personal-data exports. my_personal_data() records each archive it returns as `delivered` (ready_at = when); '
  'the other statuses belong to the former asynchronous design and are not used.';

-- -----------------------------------------------------------------------------
-- 3. The audit trail keeps no copy of what an erasure deletes
-- -----------------------------------------------------------------------------
create or replace function private.audit_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old     jsonb;
  v_new     jsonb;
  v_changes jsonb := '{}'::jsonb;
  v_key     text;
  v_watch   text[] := tg_argv;
  v_row     jsonb;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    for v_key in select jsonb_object_keys(v_new)
    loop
      continue when v_key in ('updated_at', 'updated_by');
      continue when cardinality(v_watch) > 0 and not (v_key = any (v_watch));
      if v_old -> v_key is distinct from v_new -> v_key then
        v_changes := v_changes || jsonb_build_object(
          v_key, jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return null;
    end if;
  elsif tg_op = 'DELETE' then
    -- An account erasure (erase_account) deletes the member's rows: the audit
    -- says why, it does not keep a copy of them.
    v_changes := case when current_setting('gt.account_erasure', true) = 'on'
                      then jsonb_build_object('reason', 'account_erasure')
                      else to_jsonb(old) end;
  else
    v_changes := to_jsonb(new);
  end if;

  insert into public.audit_logs (actor_id, actor_role, action, table_name, record_id, changes)
  values (
    auth.uid(),
    coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', session_user::text),
    lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'key', v_row ->> 'country_code', v_row ->> 'user_id',
             (v_row ->> 'role_key') || '/' || (v_row ->> 'permission_key'),
             (v_row ->> 'promotion_id') || '/' || coalesce(v_row ->> 'product_id', v_row ->> 'category_id',
                                                           v_row ->> 'collection_id', v_row ->> 'segment_id'),
             case when tg_table_name = 'languages' then v_row ->> 'code' end,
             v_row ->> 'locale',
             '?'),
    v_changes
  );
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. The export
-- -----------------------------------------------------------------------------

-- A row as the member reads it: no secrets (codes, tokens, hashes), no
-- provider or staff identifiers, no other member's identifier.
create or replace function private.personal_data_clean(p_row jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    from jsonb_each(p_row) e
   where e.key !~ '(token|hash|secret)'
     and e.key !~ '^(stripe|provider)_'
     and e.key !~ '_by$'
     and e.key not in ('user_id', 'code', 'assigned_to', 'actor_id', 'author_id', 'user_a', 'user_b',
                       'mention_ids', 'payment_id', 'error', 'error_code', 'failure_reason', 'contact_sync_error');
$$;

revoke all on function private.personal_data_clean(jsonb) from public;

-- Buckets holding files a member uploaded or the Studio drew for them, in
-- `<user id>/…` folders. contact-attachments stay with their ticket.
create or replace function private.personal_file_buckets()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['avatars', 'review-photos', 'data-exports', 'studio-thumbnails', 'studio-share-logos',
               'glowbook-media', 'glowbook-videos', 'lounge-media'];
$$;

revoke all on function private.personal_file_buckets() from public;

create or replace function public.my_personal_data()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_user    auth.users;
  v_email   text;
  v_last    timestamptz;
  v_archive jsonb;
begin
  if v_uid is null then
    raise exception 'my_personal_data: sign in first' using errcode = '42501';
  end if;
  select * into v_user from auth.users where id = v_uid;
  if v_user.id is null then
    raise exception 'my_personal_data: unknown account' using errcode = '42501';
  end if;

  select max(r.ready_at) into v_last
    from public.data_export_requests r
   where r.user_id = v_uid and r.status = 'delivered';
  if v_last > now() - interval '5 minutes' then
    return jsonb_build_object('status', 'too_soon', 'retry_at', v_last + interval '5 minutes');
  end if;

  -- Guest orders placed with the account's address belong to the member only
  -- once that address is confirmed.
  v_email := case when v_user.email_confirmed_at is not null then lower(v_user.email) end;

  v_archive := jsonb_build_object(
    'format', 'global-toothgems-personal-data/2',
    'generated_at', now(),
    'account', jsonb_build_object(
      'id', v_user.id,
      'email', v_user.email,
      'email_confirmed_at', v_user.email_confirmed_at,
      'created_at', v_user.created_at,
      'last_sign_in_at', v_user.last_sign_in_at,
      'sign_in_methods', coalesce(v_user.raw_app_meta_data -> 'providers', '[]'::jsonb)),
    'profile', (select private.personal_data_clean(to_jsonb(p)) from public.profiles p where p.id = v_uid),
    'addresses', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(a)) order by a.created_at), '[]')
                    from public.customer_addresses a where a.user_id = v_uid),
    'consents', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(c)) order by c.created_at), '[]')
                   from public.consent_records c where c.user_id = v_uid),
    'newsletter', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(n))), '[]')
                     from public.newsletter_subscriptions n
                    where n.user_id = v_uid or (v_email is not null and lower(n.email) = v_email)),

    'shop', jsonb_build_object(
      'orders', (select coalesce(jsonb_agg(
                   private.personal_data_clean(to_jsonb(o)) || jsonb_build_object(
                     'items', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(i)) order by i.created_at), '[]')
                                 from public.order_items i where i.order_id = o.id),
                     'parcels', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(s)) order by s.created_at), '[]')
                                   from public.shipments s where s.order_id = o.id),
                     'refunds', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(r)) order by r.created_at), '[]')
                                   from public.refunds r where r.order_id = o.id),
                     'documents', (select coalesce(jsonb_agg(jsonb_build_object(
                                     'number', d.invoice_number, 'kind', d.kind, 'issued_at', d.issued_at,
                                     'total_incl_tax', d.total_incl_tax, 'currency', d.currency, 'buyer', d.buyer)
                                     order by d.issued_at), '[]')
                                     from public.invoices d where d.order_id = o.id))
                   order by o.created_at), '[]')
                   from public.orders o
                  where o.user_id = v_uid
                     or (o.user_id is null and v_email is not null and lower(o.customer_email) = v_email)),
      'gift_cards_bought', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(g)) order by g.created_at), '[]')
                              from public.gift_cards g where g.purchaser_user_id = v_uid),
      'loyalty_cards', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(l))), '[]')
                          from public.loyalty_cards l where l.user_id = v_uid),
      'loyalty_stamps', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(l))), '[]')
                           from public.loyalty_stamps l where l.user_id = v_uid),
      'favourites', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(w))), '[]')
                       from public.wishlist_items w where w.user_id = v_uid),
      'back_in_stock_alerts', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(b)) order by b.created_at), '[]')
                                 from public.back_in_stock_requests b
                                where b.user_id = v_uid or (v_email is not null and lower(b.email) = v_email)),
      'reviews', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(v)) || jsonb_build_object(
                    'photos', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(ph)) order by ph.position), '[]')
                                 from public.review_photos ph where ph.review_id = v.id))
                    order by v.created_at), '[]')
                    from public.reviews v where v.user_id = v_uid),
      'review_votes', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(h))), '[]')
                         from public.review_helpful_votes h where h.user_id = v_uid)),

    'academy', jsonb_build_object(
      'courses', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(e)) || jsonb_build_object('course_title', c.title)), '[]')
                    from public.course_entitlements e join public.courses c on c.id = e.course_id
                   where e.user_id = v_uid),
      'progress', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(lp)) order by lp.completed_at), '[]')
                     from public.lesson_progress lp where lp.user_id = v_uid),
      'quiz_attempts', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(q)) order by q.started_at), '[]')
                          from public.quiz_attempts q where q.user_id = v_uid),
      'certificates', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(cc)) || jsonb_build_object('course_title', c.title)), '[]')
                         from public.course_completions cc join public.courses c on c.id = cc.course_id
                        where cc.user_id = v_uid)),

    'studio', jsonb_build_object(
      'trial', (select private.personal_data_clean(to_jsonb(t)) from public.studio_trials t where t.user_id = v_uid),
      'subscriptions', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(s)) order by s.created_at), '[]')
                          from public.studio_subscriptions s where s.user_id = v_uid),
      'subscription_payments', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(si)) order by si.occurred_at), '[]')
                                  from public.studio_subscription_invoices si where si.user_id = v_uid),
      'withdrawals', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(w)) order by w.requested_at), '[]')
                        from public.studio_withdrawals w where w.user_id = v_uid),
      'documents', (select coalesce(jsonb_agg(jsonb_build_object(
                      'number', d.invoice_number, 'kind', d.kind, 'issued_at', d.issued_at,
                      'total_incl_tax', d.total_incl_tax, 'currency', d.currency, 'buyer', d.buyer)
                      order by d.issued_at), '[]')
                      from public.invoices d
                     where d.studio_invoice_id in (select si.stripe_invoice_id from public.studio_subscription_invoices si where si.user_id = v_uid)
                        or d.studio_withdrawal_id in (select w.id from public.studio_withdrawals w where w.user_id = v_uid)),
      'creations', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(cr)) order by cr.created_at), '[]')
                      from public.creations cr where cr.user_id = v_uid),
      'gem_groups', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(gg))), '[]')
                       from public.gem_groups gg where gg.user_id = v_uid),
      'share_links', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(sh)) order by sh.created_at), '[]')
                        from public.creation_shares sh where sh.user_id = v_uid),
      'collections', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(co))), '[]')
                        from public.studio_collections co where co.user_id = v_uid),
      'collection_entries', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(ce))), '[]')
                               from public.studio_collection_creations ce where ce.user_id = v_uid),
      'preferences', (select private.personal_data_clean(to_jsonb(sp)) from public.studio_preferences sp where sp.user_id = v_uid),
      'share_logo', (select private.personal_data_clean(to_jsonb(sl)) from public.studio_share_logos sl where sl.user_id = v_uid),
      'glowbook', (select private.personal_data_clean(to_jsonb(sc)) from public.studio_showcases sc where sc.user_id = v_uid),
      'glowbook_creations', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(it))), '[]')
                               from public.studio_showcase_items it where it.user_id = v_uid),
      'glowbook_sections', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(se))), '[]')
                              from public.studio_showcase_sections se where se.user_id = v_uid),
      'try_on_requests', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(tr)) order by tr.created_at), '[]')
                            from public.studio_try_on_requests tr where tr.user_id = v_uid),
      'feedback', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(f))), '[]')
                     from public.studio_feedback f where f.user_id = v_uid)),

    'community', jsonb_build_object(
      'lounge_profile', (select private.personal_data_clean(to_jsonb(lm)) from public.lounge_members lm where lm.user_id = v_uid),
      'messages', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(m)) order by m.created_at), '[]')
                     from public.lounge_messages m where m.author_id = v_uid),
      'reactions', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(lr))), '[]')
                      from public.lounge_reactions lr where lr.user_id = v_uid)),

    'customer_service', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(cq)) order by cq.created_at), '[]')
                           from public.contact_requests cq
                          where cq.user_id = v_uid or (v_email is not null and lower(cq.email) = v_email)),

    -- What the team recorded about the member: the right of access covers it.
    'customer_file', jsonb_build_object(
      'tags', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(ct))), '[]')
                 from public.customer_tags ct where ct.user_id = v_uid),
      'notes', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(cn)) order by cn.created_at), '[]')
                  from public.customer_notes cn where cn.user_id = v_uid)),

    'files', (select coalesce(jsonb_agg(jsonb_build_object(
                'bucket', o.bucket_id, 'path', o.name,
                'size', (o.metadata ->> 'size')::bigint, 'created_at', o.created_at)
                order by o.bucket_id, o.name), '[]')
                from storage.objects o
               where o.bucket_id = any (private.personal_file_buckets() || array['contact-attachments'])
                 and (storage.foldername(o.name))[1] = v_uid::text)
  );

  insert into public.data_export_requests (user_id, status, requested_at, ready_at)
  values (v_uid, 'delivered', now(), now());

  return jsonb_build_object('status', 'ok', 'archive', v_archive);
end;
$$;

revoke all on function public.my_personal_data() from public, anon;
grant execute on function public.my_personal_data() to authenticated;

comment on function public.my_personal_data() is
  'GDPR access/portability: the signed-in member''s personal data as one JSON archive ({status: ok, archive}), '
  'or {status: too_soon, retry_at} within 5 minutes of the previous one.';

-- -----------------------------------------------------------------------------
-- 5. The erasure
-- -----------------------------------------------------------------------------

-- What stops an erasure now. Each one is temporary and the member is told how
-- to lift it: a staff account is closed by the team first; a running Studio
-- subscription or a withdrawal under way still needs the account (the
-- contract is being performed); an order waiting for its payment would be paid
-- for a missing account.
create or replace function private.account_erasure_blockers(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_remove(array[
    case when exists (select 1 from public.profiles p where p.id = p_user and private.role_is_staff(p.role))
         then 'staff' end,
    case when exists (select 1 from public.studio_subscriptions s
                       where s.user_id = p_user
                         and s.status in ('incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused'))
         then 'studio_subscription' end,
    case when exists (select 1 from public.studio_withdrawals w
                       where w.user_id = p_user and w.status in ('requested', 'refund_pending'))
         then 'studio_withdrawal' end,
    case when exists (select 1 from public.orders o
                       where o.user_id = p_user and o.status = 'pending' and o.payment_status = 'pending'
                         and (o.expires_at is null or o.expires_at > now()))
         then 'order_payment_pending' end
  ], null);
$$;

revoke all on function private.account_erasure_blockers(uuid) from public;

create or replace function public.my_account_erasure_blockers()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case when auth.uid() is null then array['sign_in_required']
              else private.account_erasure_blockers(auth.uid()) end;
$$;

revoke all on function public.my_account_erasure_blockers() from public, anon;
grant execute on function public.my_account_erasure_blockers() to authenticated;

create or replace function public.account_erasure_files(p_user uuid)
returns table (bucket_id text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.bucket_id, o.name
    from storage.objects o
   where o.bucket_id = any (private.personal_file_buckets())
     and (storage.foldername(o.name))[1] = p_user::text
   order by o.bucket_id, o.name;
$$;

revoke all on function public.account_erasure_files(uuid) from public, anon, authenticated;
grant execute on function public.account_erasure_files(uuid) to service_role;

create or replace function public.erase_account(p_user uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email    text;
  v_blockers text[];
begin
  select u.email into v_email from auth.users u where u.id = p_user;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  v_blockers := private.account_erasure_blockers(p_user);
  if cardinality(v_blockers) > 0 then
    return jsonb_build_object('status', 'blocked', 'blockers', to_jsonb(v_blockers));
  end if;

  perform set_config('gt.account_erasure', 'on', true);

  -- Unsubscribed, not deleted: the row is the opposition list, and the contact
  -- sync removes the address from Resend.
  update public.newsletter_subscriptions n
     set status = 'unsubscribed',
         unsubscribed_at = coalesce(n.unsubscribed_at, now()),
         confirm_token_hash = null,
         confirm_expires_at = null
   where (n.user_id = p_user or (v_email is not null and lower(n.email) = lower(v_email)))
     and n.status in ('pending', 'subscribed');

  delete from public.consent_records c
   where c.user_id = p_user and c.purpose <> 'studio_immediate_access';

  insert into public.audit_logs (actor_id, actor_role, action, table_name, record_id, changes)
  values (null, 'service_role', 'delete', 'profiles', p_user::text, jsonb_build_object('reason', 'account_erasure'));

  -- Sessions, identities and factors go with the auth user; the profile and
  -- everything that cascades from it go with the profile.
  delete from auth.users u where u.id = p_user;

  perform set_config('gt.account_erasure', '', true);
  return jsonb_build_object('status', 'erased');
end;
$$;

revoke all on function public.erase_account(uuid) from public, anon, authenticated;
grant execute on function public.erase_account(uuid) to service_role;

comment on function public.erase_account(uuid) is
  'GDPR erasure of one account, in one transaction (service role, Edge Function delete-account). '
  'Returns {status: erased | blocked (blockers) | not_found}.';

-- -----------------------------------------------------------------------------
-- 6. The confirmation e-mail
-- -----------------------------------------------------------------------------
insert into public.email_templates (key, name, description, subject, preheader, body, variables, translation_priority) values
  ('account_deleted', 'Account deleted',
   'Sent once, after a member deleted their account; says what was erased and what the law makes us keep',
   'Votre compte Global Toothgems est supprimé',
   'Votre compte et les données qui y étaient liées ont été effacés.',
   E'Bonjour,\n\nComme vous l’avez demandé, votre compte Global Toothgems a été supprimé le {{date}}. Votre profil, vos adresses, vos favoris, vos avis, vos créations et votre Glowbook du Studio 3D, votre progression et vos attestations de l’Academy, vos messages dans les salons et vos avantages fidélité ont été effacés.\n\nNous conservons uniquement ce que la loi nous oblige à garder : vos commandes, leurs factures et avoirs, ainsi que ceux de vos abonnements au Studio 3D, pendant la durée légale de conservation des pièces comptables (10 ans), sans lien avec un compte. Les échanges avec notre service client sont conservés le temps de traiter une éventuelle réclamation.\n\nVous ne recevrez plus notre newsletter.\n\nSi vous n’êtes pas à l’origine de cette suppression, répondez à cet e-mail.',
   array['date'], 'high');

insert into public.email_template_translations (template_id, locale, subject, preheader, body, status)
select t.id, 'en', v.subject, v.preheader, v.body, 'published'
  from (values
    ('account_deleted', 'Your Global Toothgems account is deleted',
     'Your account and the data linked to it have been erased.',
     E'Hello,\n\nAs you asked, your Global Toothgems account was deleted on {{date}}. Your profile, addresses, favourites, reviews, 3D Studio creations and Glowbook, Academy progress and certificates, messages in the lounges and loyalty benefits have been erased.\n\nWe only keep what the law requires us to: your orders, their invoices and credit notes, and those of your 3D Studio subscriptions, for the statutory retention period of accounting records (10 years), no longer linked to an account. Your exchanges with our customer service are kept for as long as needed to handle a possible claim.\n\nYou will no longer receive our newsletter.\n\nIf you did not delete your account, reply to this e-mail.')
  ) as v(key, subject, preheader, body)
  join public.email_templates t on t.key = v.key;

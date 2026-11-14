-- =============================================================================
-- Glowbook bookings (decision 144): the personal data export lists the member's
-- bookings and calendar. Re-creates my_personal_data() from
-- 20261110124815_lounge_moderation with one key added (glowbook_bookings).
-- =============================================================================
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
                     'withdrawals', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(w)) || jsonb_build_object(
                                       'items', (select coalesce(jsonb_agg(to_jsonb(wi) - 'withdrawal_id'), '[]')
                                                   from public.order_withdrawal_items wi where wi.withdrawal_id = w.id))
                                       order by w.declared_at), '[]')
                                       from public.order_withdrawals w where w.order_id = o.id),
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
                      from public.lounge_reactions lr where lr.user_id = v_uid),
      -- Moderation (decision 132): what the member reported, what was decided
      -- about them (with the content concerned), their complaints, whom they hid.
      'reports', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', r.id, 'message_id', r.message_id, 'reason', r.reason, 'illegal_category', r.illegal_category,
                    'details', r.details, 'status', r.status, 'created_at', r.created_at, 'resolved_at', r.resolved_at)
                    order by r.created_at), '[]')
                    from public.lounge_reports r where r.reporter_id = v_uid),
      'moderation_decisions', (select coalesce(jsonb_agg(jsonb_build_object(
                                 'id', d.id, 'action', d.action, 'reason', d.reason, 'illegal_category', d.illegal_category,
                                 'ground', d.ground, 'statement', d.statement, 'ends_at', d.ends_at,
                                 'automated', d.automated, 'created_at', d.created_at, 'message_id', d.message_id,
                                 'content', s.body_text)
                                 order by d.created_at), '[]')
                                 from public.lounge_moderation_decisions d
                                 left join public.lounge_moderation_snapshots s on s.decision_id = d.id
                                where d.target_user_id = v_uid),
      'complaints', (select coalesce(jsonb_agg(jsonb_build_object(
                       'id', a.id, 'decision_id', a.decision_id, 'as', a.appellant_role, 'body', a.body,
                       'status', a.status, 'response', a.response, 'created_at', a.created_at, 'answered_at', a.answered_at)
                       order by a.created_at), '[]')
                       from public.lounge_appeals a where a.appellant_id = v_uid),
      'hidden_members', (select coalesce(jsonb_agg(jsonb_build_object('handle', m.handle, 'since', b.created_at)
                           order by b.created_at), '[]')
                           from public.lounge_blocks b
                           left join public.lounge_members m on m.user_id = b.blocked_id
                          where b.blocker_id = v_uid)),

    -- Glowbook bookings (decision 144): those the member made, and their own calendar
    -- (settings, hours, appointments received without the clients' details, which are the clients' own).
    'glowbook_bookings', jsonb_build_object(
      'made', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(k) - 'artist_id' - 'client_id') || jsonb_build_object(
                     'artist_name', (select s.display_name from public.studio_showcases s where s.user_id = k.artist_id))
                     order by k.starts_at), '[]')
                   from public.glowbook_bookings k where k.client_id = v_uid),
      'calendar_settings', (select private.personal_data_clean(to_jsonb(b)) from public.glowbook_booking_settings b where b.user_id = v_uid),
      'weekly_hours', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(r)) order by r.weekday, r.start_hour), '[]')
                         from public.glowbook_availability_rules r where r.user_id = v_uid),
      'calendar_hours', (select coalesce(jsonb_agg(private.personal_data_clean(to_jsonb(o)) order by o.starts_at), '[]')
                           from public.glowbook_calendar_overrides o where o.user_id = v_uid),
      'received', (select coalesce(jsonb_agg(jsonb_build_object('starts_at', k.starts_at, 'status', k.status,
                       'design_kind', k.design_kind, 'creation_name', k.creation_name, 'created_at', k.created_at)
                       order by k.starts_at), '[]')
                       from public.glowbook_bookings k where k.artist_id = v_uid),
      'blocked_clients', (select count(*) from public.glowbook_client_blocks b where b.artist_id = v_uid)),

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

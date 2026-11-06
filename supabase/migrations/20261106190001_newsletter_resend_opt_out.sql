-- =============================================================================
-- Newsletter: a choice made in Resend comes back to the database
-- =============================================================================
-- Campaigns go out through Resend Broadcasts, whose e-mails carry Resend's own
-- unsubscribe link. Our list stays the source of truth, so what Resend learns
-- is mirrored here by newsletter_resend_opt_out(email, reason), service role only,
-- called by:
--   * resend-webhook: `contact.updated` with unsubscribed = true, and a campaign
--     e-mail (broadcast) that bounced permanently or drew a spam complaint;
--   * sync-newsletter-contacts: a contact found unsubscribed in Resend (safety
--     net for a lost webhook).
--
--   unsubscribed  the subscription is unsubscribed; a member's marketing_email
--                 consent is withdrawn (consent_records, source 'newsletter'),
--                 exactly as the one-click link of newsletter_unsubscribe() does
--   bounced /     the subscription takes that status, which newsletter_subscribe()
--   complained    and the consent sync never re-activate; consents are left
--                 alone, as for transactional e-mails (email_log_apply_event)
--
-- Never the other way: a contact set back to subscribed in Resend changes nothing
-- here (subscribing again goes through our double opt-in). The status change
-- queues the row, so the sync then deletes the contact in Resend.
-- Answers what happened: 'unsubscribed' | 'bounced' | 'complained' | 'unchanged'
-- (already out, or a complaint over a bounce) | 'unknown' (not on the list).
-- =============================================================================

create or replace function public.newsletter_resend_opt_out(p_email text, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_sub   public.newsletter_subscriptions;
begin
  if private.caller_jwt_role() not in ('service_role', '') then
    raise exception 'newsletter_resend_opt_out: server only' using errcode = '42501';
  end if;
  if p_reason not in ('unsubscribed', 'bounced', 'complained') then
    raise exception 'newsletter_resend_opt_out: unknown reason' using errcode = '22023';
  end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(v_email) > 254 then
    raise exception 'newsletter_resend_opt_out: invalid e-mail' using errcode = '22023';
  end if;

  select * into v_sub from public.newsletter_subscriptions where lower(email) = v_email for update;
  if v_sub.id is null then
    return 'unknown';
  end if;

  if p_reason = 'unsubscribed' then
    if v_sub.status not in ('subscribed', 'pending') then
      return 'unchanged';
    end if;
    update public.newsletter_subscriptions
       set status = 'unsubscribed', unsubscribed_at = now(), confirm_token_hash = null, confirm_expires_at = null
     where id = v_sub.id;
    if v_sub.user_id is not null then
      insert into public.consent_records (user_id, purpose, granted, policy_version, source)
      values (v_sub.user_id, 'marketing_email', false, coalesce(v_sub.policy_version, 'newsletter'), 'newsletter');
    end if;
    return 'unsubscribed';
  end if;

  -- bounced / complained: same rule as email_log_apply_event (a complaint wins over anything)
  if v_sub.status = 'complained' or (p_reason = 'bounced' and v_sub.status not in ('pending', 'subscribed')) then
    return 'unchanged';
  end if;
  update public.newsletter_subscriptions
     set status = p_reason, confirm_token_hash = null, confirm_expires_at = null
   where id = v_sub.id;
  return p_reason;
end;
$$;

comment on function public.newsletter_resend_opt_out(text, text) is
  'Mirrors a Resend unsubscribe, permanent bounce or complaint onto the newsletter list (service role only).';

revoke all on function public.newsletter_resend_opt_out(text, text) from public, anon, authenticated;
grant execute on function public.newsletter_resend_opt_out(text, text) to service_role;

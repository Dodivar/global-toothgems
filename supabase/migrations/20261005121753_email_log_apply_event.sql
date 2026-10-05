-- E-mail delivery events (decision 79): what the Resend webhook records.
--
--   * email_log_apply_event(provider_id, status): moves an email_log row forward to
--     delivered / opened / bounced / complained, never backwards (sent < delivered
--     < opened < bounced < complained). A replayed or out-of-order event therefore
--     changes nothing, which is what makes the webhook idempotent; `applied` tells
--     the caller whether the status really moved. An unknown provider id (Auth
--     e-mails also leave through Resend) answers matched = false.
--   * For newsletter e-mails a bounce or a complaint also marks the subscriber
--     (newsletter_subscriptions.status), in the same transaction. email_log only
--     holds sha256(lower(address)), so the subscriber is found through a matching
--     expression index instead of a new column. A bounce only affects a pending or
--     subscribed address; a complaint affects any status except complained.
--     Members' consent records are not touched (their history stays their own); a
--     bounced or complaining address is never re-activated by a consent
--     (sync_newsletter_from_consent).
-- Service role only.

create index newsletter_subscriptions_email_hash_idx
  on public.newsletter_subscriptions (encode(extensions.digest(lower(email), 'sha256'), 'hex'));

create or replace function public.email_log_apply_event(p_provider_id text, p_status text)
returns table (matched boolean, applied boolean, template text, gift_card uuid, new_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row  public.email_log;
  v_old  integer;
  v_new  integer;
begin
  if p_status not in ('delivered', 'opened', 'bounced', 'complained') then
    raise exception 'email_log_apply_event: status must be delivered, opened, bounced or complained' using errcode = '22023';
  end if;

  select * into v_row from public.email_log l where l.provider_id = p_provider_id for update;
  if not found then
    return query select false, false, null::text, null::uuid, null::text;
    return;
  end if;

  v_old := case v_row.status when 'sent' then 1 when 'delivered' then 2 when 'opened' then 3
                             when 'bounced' then 4 when 'complained' then 5 else 0 end;
  v_new := case p_status when 'delivered' then 2 when 'opened' then 3 when 'bounced' then 4 else 5 end;
  if v_new <= v_old then
    return query select true, false, v_row.template_key, v_row.gift_card_id, v_row.status;
    return;
  end if;

  update public.email_log set status = p_status, updated_at = now() where id = v_row.id;

  if v_row.template_key like 'newsletter%' and p_status in ('bounced', 'complained') then
    update public.newsletter_subscriptions s
       set status = p_status, confirm_token_hash = null, confirm_expires_at = null
     where encode(extensions.digest(lower(s.email), 'sha256'), 'hex') = v_row.recipient_hash
       and s.status <> 'complained'
       and (p_status = 'complained' or s.status in ('pending', 'subscribed'));
  end if;

  return query select true, true, v_row.template_key, v_row.gift_card_id, p_status;
end;
$$;

revoke all on function public.email_log_apply_event(text, text) from public, anon, authenticated;
grant execute on function public.email_log_apply_event(text, text) to service_role;

-- E-mail follow-up to 20261005092414_email_log (not yet used by any sender):
--
--   * email_log_claim() gains p_max_attempts (default 5): a failing event is
--     retried by the cron until then, then left as `failed` for the team instead of
--     being retried every five minutes forever (a bad address, an unverified domain).
--     The attempt count is returned in the refused case too, status stays 'failed'.
--   * Gift card e-mail: a card without an expiry date has no date to print, so the
--     sentence "Valable jusqu'au {{expires_on}}" becomes a labelled line,
--     "Date d'expiration : {{expires_on}}" ("aucune" / "none" when there is none).

drop function public.email_log_claim(text, text, text, text, uuid, uuid);

create or replace function public.email_log_claim(
  p_event_key      text,
  p_template_key   text,
  p_locale         text,
  p_recipient_hash text,
  p_order_id       uuid default null,
  p_gift_card_id   uuid default null,
  p_max_attempts   integer default 5
)
returns table (claimed boolean, attempt integer, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt integer;
  v_status  text;
begin
  insert into public.email_log as l (event_key, template_key, locale, recipient_hash, order_id, gift_card_id)
  values (p_event_key, p_template_key, p_locale, p_recipient_hash, p_order_id, p_gift_card_id)
  on conflict (event_key) do update
    set status = 'pending', attempt = l.attempt + 1, error = null, updated_at = now()
    where (l.status = 'failed' and l.attempt < p_max_attempts)
       or (l.status = 'pending' and l.updated_at < now() - interval '10 minutes' and l.attempt < p_max_attempts)
  returning l.attempt into v_attempt;

  if v_attempt is not null then
    return query select true, v_attempt, 'pending'::text;
    return;
  end if;

  select l.status into v_status from public.email_log l where l.event_key = p_event_key;
  return query select false, 0, v_status;
end;
$$;

revoke all on function public.email_log_claim(text, text, text, text, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.email_log_claim(text, text, text, text, uuid, uuid, integer) to service_role;

update public.email_templates
   set body = E'Bonjour,\n\n{{sender_name}} vous offre une carte cadeau Global Toothgems d''une valeur de {{amount}}.\n\n{{message}}\n\nVotre code : {{code}}\nDate d''expiration : {{expires_on}}\n\nUtilisez-le au moment du paiement : {{shop_url}}'
 where key = 'gift_card_delivery';

update public.email_template_translations tr
   set body = E'Hello,\n\n{{sender_name}} sent you a Global Toothgems gift card worth {{amount}}.\n\n{{message}}\n\nYour code: {{code}}\nExpiry date: {{expires_on}}\n\nEnter it at checkout: {{shop_url}}',
       source_updated_at = t.content_updated_at
  from public.email_templates t
 where t.id = tr.template_id and t.key = 'gift_card_delivery' and tr.locale = 'en';

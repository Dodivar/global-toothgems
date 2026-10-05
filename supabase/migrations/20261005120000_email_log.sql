-- E-mail sending (decision 79): the log that makes each business e-mail go out
-- once, and the two templates the backend still lacked.
--
--   * email_log: one row per business event ("order_confirmation:<order id>",
--     "gift_card:<card id>"). The unique event key plus the atomic claim below
--     mean a retried Stripe webhook, an overlapping cron run or a double click
--     sends one e-mail. No e-mail address is stored, only its sha256.
--   * email_log_claim / email_log_finish: service-role functions used by the
--     Edge Functions (_shared/email). A failed attempt (or a claim abandoned for
--     more than 10 minutes) can be claimed again; a sent one never.
--   * Templates gift_card_delivery and order_refunded (French base, English published).
--
-- Backend-only table: RLS on, no policy, nothing granted to the API roles. The
-- provider statuses (delivered, opened, bounced, complained) are written by the
-- resend-webhook function in a later step.

create table public.email_log (
  id             uuid primary key default gen_random_uuid(),
  event_key      text not null unique check (char_length(event_key) between 1 and 200),
  template_key   text not null check (template_key ~ '^[a-z][a-z0-9_]*$'),
  locale         text not null,
  recipient_hash text not null check (recipient_hash ~ '^[0-9a-f]{64}$'),
  status         text not null default 'pending'
                   check (status in ('pending', 'sent', 'delivered', 'opened', 'bounced', 'complained', 'failed')),
  attempt        integer not null default 1 check (attempt >= 1),
  provider_id    text unique,                       -- Resend's e-mail id, for the webhook
  error          text check (char_length(error) <= 500),
  order_id       uuid references public.orders (id) on delete set null,
  gift_card_id   uuid references public.gift_cards (id) on delete set null,
  created_at     timestamptz not null default now(),
  sent_at        timestamptz,
  updated_at     timestamptz not null default now()
);

comment on table public.email_log is
  'One row per business e-mail event (unique event_key). Backend only; stores a hash of the recipient, never the address.';

create index email_log_order_idx on public.email_log (order_id) where order_id is not null;
create index email_log_gift_card_idx on public.email_log (gift_card_id) where gift_card_id is not null;

alter table public.email_log enable row level security;
revoke all on public.email_log from public, anon, authenticated;

-- Claims the right to send for an event. claimed = true: the caller sends now
-- (attempt N). claimed = false: already sent, or being sent by someone else
-- (status says which).
create or replace function public.email_log_claim(
  p_event_key      text,
  p_template_key   text,
  p_locale         text,
  p_recipient_hash text,
  p_order_id       uuid default null,
  p_gift_card_id   uuid default null
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
    where l.status = 'failed'
       or (l.status = 'pending' and l.updated_at < now() - interval '10 minutes')
  returning l.attempt into v_attempt;

  if v_attempt is not null then
    return query select true, v_attempt, 'pending'::text;
    return;
  end if;

  select l.status into v_status from public.email_log l where l.event_key = p_event_key;
  return query select false, 0, v_status;
end;
$$;

-- Records the outcome of the attempt claimed above.
create or replace function public.email_log_finish(
  p_event_key   text,
  p_status      text,
  p_provider_id text default null,
  p_error       text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('sent', 'failed') then
    raise exception 'email_log_finish: status must be sent or failed' using errcode = '22023';
  end if;
  update public.email_log
     set status = p_status,
         provider_id = coalesce(p_provider_id, provider_id),
         error = left(p_error, 500),
         sent_at = case when p_status = 'sent' then now() else sent_at end,
         updated_at = now()
   where event_key = p_event_key and status = 'pending';
  if not found then
    raise exception 'email_log_finish: no pending attempt for this event' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.email_log_claim(text, text, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.email_log_finish(text, text, text, text) from public, anon, authenticated;
grant execute on function public.email_log_claim(text, text, text, text, uuid, uuid) to service_role;
grant execute on function public.email_log_finish(text, text, text, text) to service_role;
grant select, insert, update on public.email_log to service_role;

-- Templates. Variables are what the sending code provides; `message` and
-- `sender_name` may be empty strings (the renderer drops an empty paragraph).
insert into public.email_templates (key, name, description, subject, preheader, body, variables, translation_priority) values
  ('gift_card_delivery', 'Gift card delivery', 'Sent to the recipient when a gift card is delivered',
   'Une carte cadeau Global Toothgems vous attend', '{{amount}} à dépenser sur la boutique.',
   E'Bonjour,\n\n{{sender_name}} vous offre une carte cadeau Global Toothgems d''une valeur de {{amount}}.\n\n{{message}}\n\nVotre code : {{code}}\n\nValable jusqu''au {{expires_on}}. Utilisez-le au moment du paiement : {{shop_url}}',
   array['sender_name', 'amount', 'message', 'code', 'expires_on', 'shop_url'], 'high'),
  ('order_refunded', 'Order refunded', 'Sent when an order is refunded',
   'Votre remboursement {{order_number}}', 'Nous avons remboursé votre commande.',
   E'Bonjour {{first_name}},\n\nNous avons remboursé {{amount}} pour votre commande {{order_number}}. Selon votre banque, le montant apparaît sous quelques jours ouvrés.',
   array['first_name', 'order_number', 'amount'], 'normal');

insert into public.email_template_translations (template_id, locale, subject, preheader, body, status)
select t.id, 'en', v.subject, v.preheader, v.body, 'published'
  from (values
    ('gift_card_delivery', 'A Global Toothgems gift card is waiting for you', '{{amount}} to spend in the shop.',
     E'Hello,\n\n{{sender_name}} sent you a Global Toothgems gift card worth {{amount}}.\n\n{{message}}\n\nYour code: {{code}}\n\nValid until {{expires_on}}. Enter it at checkout: {{shop_url}}'),
    ('order_refunded', 'Your refund for {{order_number}}', 'We have refunded your order.',
     E'Hello {{first_name}},\n\nWe have refunded {{amount}} for your order {{order_number}}. Depending on your bank, it appears within a few business days.')
  ) as v(key, subject, preheader, body)
  join public.email_templates t on t.key = v.key;

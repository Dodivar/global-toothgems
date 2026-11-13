-- Automatic reminder e-mails (decision 141): abandoned cart, review request
-- after delivery, unused loyalty reward. Three new e-mails on the existing
-- pipeline (email_log claim, pending_* functions, send-pending-emails swept by
-- pg_cron every 5 minutes, templates in email_templates).
--
--   abandoned_cart:<order id>         one order whose payment was abandoned
--                                     (Stripe session expired or payment step
--                                     left), 3 hours after it was cancelled,
--                                     only with marketing consent (see below)
--   review_request:<order id>         a member's order whose parcels are all
--                                     delivered, 5 days after the last one,
--                                     with products not reviewed yet
--   loyalty_reward:<card id>          a member's full loyalty card whose reward
--                                     has waited 7 days unused
--
-- Every reminder carries a one-click "stop these reminders" link
-- (/rappels/desinscription?token=…, List-Unsubscribe header): one switch per
-- address, for all three kinds, stored as the sha256 of the address only
-- (email_reminder_preferences). Never twice: the email_log event key, plus a
-- per-address cap (30 days for carts and reviews, 60 for the loyalty reward).
--
-- Consent (decision 141 (a), to confirm with a lawyer — supabase/README.md,
-- "Review of 2026-11-11"): the abandoned cart reminder is treated as
-- commercial prospection, so it goes only to an address that gave marketing
-- consent — a member with profiles.marketing_opt_in, or an address subscribed
-- to the newsletter. A guest who only typed an address at checkout gets
-- nothing. The review request and the loyalty reminder are sent to members as
-- part of the customer relationship, with the opt-out link.
--
-- Every kind is OFF until the owner (or the next agent) switches it on in
-- private.email_reminder_settings: the opt-out page is a Next.js page, live
-- only once Vercel production is built from a commit that has it.

-- ---------------------------------------------------------------------------
-- 1. Switches and delays (one row; changed by SQL, no back-office screen yet)
-- ---------------------------------------------------------------------------
create table private.email_reminder_settings (
  id                         boolean primary key default true check (id),
  abandoned_cart_enabled     boolean not null default false,
  abandoned_cart_delay_hours integer not null default 3 check (abandoned_cart_delay_hours between 1 and 47),
  review_request_enabled     boolean not null default false,
  review_request_delay_days  integer not null default 5 check (review_request_delay_days between 1 and 29),
  loyalty_reward_enabled     boolean not null default false,
  loyalty_reward_delay_days  integer not null default 7 check (loyalty_reward_delay_days between 1 and 59),
  updated_at                 timestamptz not null default now()
);

comment on table private.email_reminder_settings is
  'Decision 140: on/off and delay of each automatic reminder e-mail (abandoned cart, review request, loyalty reward). One row.';

insert into private.email_reminder_settings (id) values (true);

alter table private.email_reminder_settings enable row level security;
revoke all on private.email_reminder_settings from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The opt-out: one row per address that was ever sent a reminder
-- ---------------------------------------------------------------------------
create table public.email_reminder_preferences (
  -- sha256 of lower(btrim(address)), exactly email_log.recipient_hash (_shared/email/send.ts hashAddress).
  recipient_hash    text primary key check (recipient_hash ~ '^[0-9a-f]{64}$'),
  unsubscribe_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex')
                      check (unsubscribe_token ~ '^[0-9a-f]{48}$'),
  opted_out_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.email_reminder_preferences is
  'Decision 140: per address (sha256 only) the token of the "stop these reminders" link and the opt-out date. Backend only.';

alter table public.email_reminder_preferences enable row level security;
revoke all on public.email_reminder_preferences from public, anon, authenticated;
grant select, insert, update on public.email_reminder_preferences to service_role;

create or replace function private.email_address_hash(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(lower(btrim(coalesce(p_email, ''))), 'sha256'), 'hex');
$$;

revoke all on function private.email_address_hash(text) from public, anon, authenticated;

-- True unless the address stopped the reminders.
create or replace function private.email_reminders_allowed(p_email text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not exists (select 1 from public.email_reminder_preferences p
                      where p.recipient_hash = private.email_address_hash(p_email) and p.opted_out_at is not null);
$$;

revoke all on function private.email_reminders_allowed(text) from public, anon, authenticated;

-- True when no e-mail of this template went (or is going) to the address within the period.
create or replace function private.email_recently_sent(p_template text, p_email text, p_within interval)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.email_log e
                  where e.template_key = p_template
                    and e.recipient_hash = private.email_address_hash(p_email)
                    and e.status <> 'failed'
                    and e.created_at > now() - p_within);
$$;

revoke all on function private.email_recently_sent(text, text, interval) from public, anon, authenticated;

-- The token of the address's opt-out link, created on first use (service role, before sending).
create or replace function public.email_reminder_token(p_email text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hash  text := private.email_address_hash(p_email);
  v_token text;
begin
  if btrim(coalesce(p_email, '')) = '' then
    raise exception 'email_reminder_token: address required' using errcode = '22023';
  end if;
  insert into public.email_reminder_preferences (recipient_hash) values (v_hash)
  on conflict (recipient_hash) do nothing;
  select p.unsubscribe_token into v_token from public.email_reminder_preferences p where p.recipient_hash = v_hash;
  return v_token;
end;
$$;

revoke all on function public.email_reminder_token(text) from public, anon, authenticated;
grant execute on function public.email_reminder_token(text) to service_role;

-- The link's page calls this once the visitor clicked (never on a bare GET: mail
-- scanners open links). true = stopped (also when it already was); false = unknown token.
create or replace function public.unsubscribe_email_reminders(p_token text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then
    return false;
  end if;
  update public.email_reminder_preferences
     set opted_out_at = coalesce(opted_out_at, now()), updated_at = now()
   where unsubscribe_token = p_token;
  return found;
end;
$$;

revoke all on function public.unsubscribe_email_reminders(text) from public;
grant execute on function public.unsubscribe_email_reminders(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Abandoned cart
-- ---------------------------------------------------------------------------
-- The cart lives in the browser; what the database sees is the unpaid order
-- create_order() made before the payment step. It is a candidate when:
--   * it was cancelled because the payment was abandoned: `expired` (Stripe
--     session or reservation ran out) or `payment_step_left` — never
--     `checkout_failed` (our failure), `free_order`, `payment_failed`
--     (a declined payment: decision 141 (c)) or a staff cancellation;
--   * between abandoned_cart_delay_hours and 48 hours ago (no backlog);
--   * it is the customer's latest order: no later order of any status for the
--     same address or account (a later paid order, or one being paid, means
--     they came back; a later abandoned one gets its own turn);
--   * marketing consent (above), the address has not stopped reminders, and no
--     abandoned cart e-mail reached it in the last 30 days;
--   * at least one line is a product still on sale (gift cards and courses are
--     not shown: a gift card line holds a third party's details).
-- Lines: name, option, product address key and picture — never a price (the
-- snapshot may be stale, decision 129).
create or replace function public.pending_abandoned_cart_emails(p_limit integer default 25)
returns table (
  order_id     uuid,
  order_number text,
  email        text,
  locale       text,
  first_name   text,
  items        jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with s as (select * from private.email_reminder_settings where id)
  select o.id, o.order_number, lower(btrim(o.customer_email)), o.locale,
         coalesce(o.billing_address ->> 'first_name', ''),
         (select jsonb_agg(jsonb_build_object(
                   'name', coalesce((select pt.name from public.product_translations pt
                                      where pt.product_id = p.id and pt.locale = o.locale and pt.status = 'published'), p.name),
                   'variant', i.variant_name,
                   'slug', case when o.locale = 'fr' then p.slug
                                else coalesce((select pt.slug from public.product_translations pt
                                                where pt.product_id = p.id and pt.locale = o.locale and pt.status = 'published'), p.slug) end,
                   'image_path', (select m.storage_path from public.product_media m
                                   where m.product_id = p.id and m.media_type = 'image'
                                   order by (i.variant_id is not null and m.variant_id = i.variant_id) desc, m.is_primary desc, m.position
                                   limit 1))
                 order by i.created_at)
            from public.order_items i
            join public.products p on p.id = i.product_id and p.status = 'active' and p.product_type <> 'gift_card'
           where i.order_id = o.id and i.course_id is null)
    from public.orders o
    cross join s
   where s.abandoned_cart_enabled
     and o.status = 'cancelled'
     and o.paid_at is null
     and o.cancellation_reason in ('expired', 'payment_step_left')
     and o.cancelled_at <= now() - make_interval(hours => s.abandoned_cart_delay_hours)
     and o.cancelled_at > now() - interval '48 hours'
     and not exists (select 1 from public.orders later
                      where later.id <> o.id
                        and later.created_at > o.created_at
                        and (lower(btrim(later.customer_email)) = lower(btrim(o.customer_email))
                             or (o.user_id is not null and later.user_id = o.user_id)))
     and (exists (select 1 from public.profiles pr
                   where pr.id = o.user_id and pr.status = 'active' and pr.marketing_opt_in)
          or exists (select 1 from public.newsletter_subscriptions ns
                      where ns.email = lower(btrim(o.customer_email)) and ns.status = 'subscribed'))
     and private.email_reminders_allowed(o.customer_email)
     and not private.email_recently_sent('abandoned_cart', o.customer_email, interval '30 days')
     and exists (select 1 from public.order_items i
                   join public.products p on p.id = i.product_id and p.status = 'active' and p.product_type <> 'gift_card'
                  where i.order_id = o.id and i.course_id is null)
     and private.email_event_open('abandoned_cart:' || o.id::text)
   order by o.cancelled_at
   limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.pending_abandoned_cart_emails(integer) from public, anon, authenticated;
grant execute on function public.pending_abandoned_cart_emails(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Review request
-- ---------------------------------------------------------------------------
-- A member's paid order (not refunded, even in part, not cancelled) whose
-- parcels — every one that is not cancelled, at least one — are delivered, the
-- last one between review_request_delay_days and 30 days ago; no withdrawal
-- declared on it; the member's account active, address not opted out, no review
-- request in the last 30 days. Listed: the products (physical, on sale) that
-- came in those delivered parcels (shipment_items) and that the member has not
-- reviewed yet; none left = no e-mail. The parcels decide, not the order's
-- derived status (a cancelled parcel can leave it `processing`). Verified
-- reviews need a shipped or delivered order of theirs (reviews rules).
-- A parcel's delivery is set by staff (`set_shipment_status`): an order whose
-- parcels stay `shipped` never gets this e-mail.
create or replace function public.pending_review_request_emails(p_limit integer default 25)
returns table (
  order_id     uuid,
  order_number text,
  email        text,
  locale       text,
  first_name   text,
  items        jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with s as (select * from private.email_reminder_settings where id),
  delivered as (
    select sh.order_id, max(coalesce(sh.delivered_at, sh.updated_at)) as last_delivered_at
      from public.shipments sh
     where sh.status <> 'cancelled'
     group by sh.order_id
    having bool_and(sh.status = 'delivered')
  ),
  to_review as (
    select o.id as order_id, p.id as product_id, p.name, p.slug, min(i.created_at) as first_line
      from public.orders o
      join public.order_items i on i.order_id = o.id
      join public.shipment_items si on si.order_item_id = i.id and si.quantity > 0
      join public.shipments sh on sh.id = si.shipment_id and sh.status = 'delivered'
      join public.products p on p.id = i.product_id and p.status = 'active' and p.product_type = 'physical'
     where o.user_id is not null
       and not exists (select 1 from public.reviews r where r.user_id = o.user_id and r.product_id = p.id)
     group by o.id, p.id, p.name, p.slug
  )
  select o.id, o.order_number, lower(btrim(pr.email)), o.locale,
         coalesce(nullif(btrim(pr.first_name), ''), o.billing_address ->> 'first_name', ''),
         (select jsonb_agg(jsonb_build_object(
                   'name', coalesce((select pt.name from public.product_translations pt
                                      where pt.product_id = t.product_id and pt.locale = o.locale and pt.status = 'published'), t.name),
                   'slug', case when o.locale = 'fr' then t.slug
                                else coalesce((select pt.slug from public.product_translations pt
                                                where pt.product_id = t.product_id and pt.locale = o.locale and pt.status = 'published'), t.slug) end,
                   'image_path', (select m.storage_path from public.product_media m
                                   where m.product_id = t.product_id and m.media_type = 'image'
                                   order by m.is_primary desc, m.position limit 1))
                 order by t.first_line)
            from to_review t where t.order_id = o.id)
    from public.orders o
    cross join s
    join delivered d on d.order_id = o.id
    join public.profiles pr on pr.id = o.user_id and pr.status = 'active'
   where s.review_request_enabled
     and o.status not in ('cancelled', 'refunded')
     and o.payment_status = 'paid'
     and d.last_delivered_at <= now() - make_interval(days => s.review_request_delay_days)
     and d.last_delivered_at > now() - interval '30 days'
     and not exists (select 1 from public.order_withdrawals w where w.order_id = o.id)
     and exists (select 1 from to_review t where t.order_id = o.id)
     and private.email_reminders_allowed(pr.email)
     and not private.email_recently_sent('review_request', pr.email, interval '30 days')
     and private.email_event_open('review_request:' || o.id::text)
   order by d.last_delivered_at
   limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.pending_review_request_emails(integer) from public, anon, authenticated;
grant execute on function public.pending_review_request_emails(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Loyalty reward waiting
-- ---------------------------------------------------------------------------
-- A full card (`completed`: the reward waits for the next order) completed
-- between loyalty_reward_delay_days and 60 days ago, the programme active, the
-- account active. A card whose reward an unpaid order is holding is
-- `redeemed` (create_order() takes it at once, cancel_order() gives it back),
-- so it does not count. One e-mail per member: their oldest waiting card, and
-- none if a loyalty reminder reached the address in the last 60 days.
create or replace function public.pending_loyalty_reward_emails(p_limit integer default 25)
returns table (
  card_id        uuid,
  user_id        uuid,
  email          text,
  locale         text,
  first_name     text,
  reward_percent smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  with s as (select * from private.email_reminder_settings where id),
  waiting as (
    select distinct on (c.user_id) c.id, c.user_id, c.reward_percent, c.completed_at
      from public.loyalty_cards c
     where c.status = 'completed'
     order by c.user_id, c.completed_at
  )
  select w.id, w.user_id, lower(btrim(pr.email)), pr.preferred_locale, coalesce(btrim(pr.first_name), ''), w.reward_percent
    from waiting w
    cross join s
    join public.profiles pr on pr.id = w.user_id and pr.status = 'active'
   where s.loyalty_reward_enabled
     and exists (select 1 from public.loyalty_settings ls where ls.is_active)
     and w.completed_at <= now() - make_interval(days => s.loyalty_reward_delay_days)
     and w.completed_at > now() - interval '60 days'
     and private.email_reminders_allowed(pr.email)
     and not private.email_recently_sent('loyalty_reward', pr.email, interval '60 days')
     and private.email_event_open('loyalty_reward:' || w.id::text)
   order by w.completed_at
   limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.pending_loyalty_reward_emails(integer) from public, anon, authenticated;
grant execute on function public.pending_loyalty_reward_emails(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Templates (French base, English published). Buttons, product cards and
--    the opt-out link are added by the sending code, never substituted URLs.
-- ---------------------------------------------------------------------------
insert into public.email_templates (key, name, description, subject, preheader, body, variables, translation_priority) values
  ('abandoned_cart', 'Abandoned cart reminder',
   'Sent once, 3 hours after a payment was abandoned, to a customer who gave marketing consent (decision 141)',
   'Votre sélection vous attend', 'Les articles de votre panier sont toujours sur la boutique.',
   E'Bonjour {{first_name}},\n\nVous avez commencé une commande sur Global Toothgems sans la finaliser : aucun paiement n''a été pris et rien ne vous sera facturé.\n\nVos articles sont toujours sur la boutique, mais nous ne pouvons pas les réserver. Si vous le souhaitez, retrouvez-les ci-dessous.\n\nUne question sur un produit ou sur le paiement ? Répondez simplement à cet e-mail.',
   array['first_name'], 'normal'),
  ('review_request', 'Review request after delivery',
   'Sent once per delivered order, a few days after the last parcel arrived, for the products not reviewed yet (decision 141)',
   'Votre avis sur votre commande {{order_number}}', 'Quelques mots suffisent et aident les autres clientes.',
   E'Bonjour {{first_name}},\n\nVotre commande {{order_number}} vous est parvenue il y a quelques jours : nous espérons qu''elle vous plaît.\n\nVotre avis compte beaucoup, pour nous comme pour les autres clientes et artistes. Quelques mots et une note suffisent ; vous pouvez aussi ajouter des photos.\n\nLes avis sont publiés après une vérification de notre équipe. Ils reflètent l''expérience de clientes ayant réellement acheté le produit.',
   array['first_name', 'order_number'], 'normal'),
  ('loyalty_reward', 'Loyalty reward waiting',
   'Sent once when a member''s full loyalty card has waited a week without its reward being used (decision 141)',
   'Votre récompense de -{{reward_percent}} % vous attend', 'Votre carte de fidélité est complète.',
   E'Bonjour {{first_name}},\n\nVotre carte de fidélité Global Toothgems est complète depuis quelques jours : une réduction de {{reward_percent}} % vous attend sur votre prochaine commande.\n\nPour l''utiliser, connectez-vous et cochez la récompense dans votre panier, avant le paiement. Elle s''applique aux articles de la boutique.\n\nMerci pour votre fidélité !',
   array['first_name', 'reward_percent'], 'normal');

insert into public.email_template_translations (template_id, locale, subject, preheader, body, status)
select t.id, 'en', v.subject, v.preheader, v.body, 'published'
  from (values
    ('abandoned_cart', 'Your selection is waiting', 'The items in your cart are still in the shop.',
     E'Hello {{first_name}},\n\nYou started an order on Global Toothgems without finishing it: no payment was taken and you will not be charged.\n\nYour items are still in the shop, but we cannot hold them for you. If you would like, you will find them below.\n\nA question about a product or the payment? Just reply to this e-mail.'),
    ('review_request', 'Your review of order {{order_number}}', 'A few words are enough and help other customers.',
     E'Hello {{first_name}},\n\nYour order {{order_number}} reached you a few days ago: we hope you love it.\n\nYour review matters a lot, to us and to other customers and artists. A few words and a rating are enough; you can add photos too.\n\nReviews are published after a check by our team. They reflect the experience of customers who actually bought the product.'),
    ('loyalty_reward', 'Your {{reward_percent}}% reward is waiting', 'Your loyalty card is full.',
     E'Hello {{first_name}},\n\nYour Global Toothgems loyalty card has been full for a few days: a {{reward_percent}}% discount is waiting for your next order.\n\nTo use it, sign in and tick the reward in your cart, before paying. It applies to the shop''s items.\n\nThank you for your loyalty!')
  ) as v(key, subject, preheader, body)
  join public.email_templates t on t.key = v.key;

-- Daily low-stock digest for the support inbox (decision 106): one e-mail a day,
-- listing what is out of stock and what is low, so the team restocks without
-- watching the back office and without one e-mail per sale.
--
--   sweep    pending_stock_digest()   (service role, send-pending-emails, pg_cron
--              every 5 minutes): the products / options to report, but only from
--              08:00 Paris time and only while today's digest is not sent
--   e-mail   template `stock_digest`, event key stock_digest:<Paris date>:
--              email_log makes it exactly-once per day; nothing to report = no
--              e-mail at all (the function returns no row)
--   to       the store's support e-mail (store_settings.support_email), else the
--              EMAIL_REPLY_TO secret, like the contact form (send-pending-emails)
--
-- What is reported: active physical products (never gift cards or digital goods)
-- whose sellable stock (on hand - reserved) is at or under their own
-- `low_stock_threshold` ('low_stock') or zero ('out_of_stock', also a manual
-- "out of stock" on an untracked item). A product that sells options is reported
-- option by option (its active options); a product without options by itself.
-- The list is the state at send time, not a diff: an item stays in the digest
-- until it is restocked.

create or replace function public.pending_stock_digest()
returns table (
  digest_date  date,
  product_id   uuid,
  product_name text,
  variant_name text,
  sku          text,
  stock_status text,
  available    integer,
  threshold    integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with today as (
    select (now() at time zone 'Europe/Paris')::date as d,
           extract(hour from now() at time zone 'Europe/Paris') >= 8 as after_eight
  ),
  due as (
    select t.d from today t
     where t.after_eight and private.email_event_open('stock_digest:' || t.d::text)
  )
  select due.d, p.id, p.name, v.name, coalesce(v.sku, p.sku), i.stock_status,
         greatest(i.quantity_on_hand - i.quantity_reserved, 0), i.low_stock_threshold
    from due
    cross join public.products p
    left join public.product_variants v on v.product_id = p.id and v.is_active
    join public.inventory_items i
      on (v.id is not null and i.variant_id = v.id)
      or (v.id is null and i.product_id = p.id)
   where p.status = 'active'
     and p.product_type = 'physical'
     and i.stock_status in ('low_stock', 'out_of_stock')
   order by (i.stock_status = 'out_of_stock') desc, p.name, v.position, v.name
   limit 500;
$$;

revoke all on function public.pending_stock_digest() from public, anon, authenticated;
grant execute on function public.pending_stock_digest() to service_role;

comment on function public.pending_stock_digest() is
  'Rows of today''s low-stock digest (out of stock first), from 08:00 Paris time, while today''s e-mail (stock_digest:<date>) is not sent. Empty = nothing to send. Service role only.';

-- The template: the staff-written text; the lists and the button are added by the sending code.
insert into public.email_templates (key, name, description, subject, preheader, body, variables, translation_priority) values
  ('stock_digest', 'Daily stock digest', 'Sent to the support inbox once a day when products are out of stock or low',
   'Stock du {{date}} : {{out_count}} en rupture, {{low_count}} en stock bas', 'Les articles à réapprovisionner.',
   E'Bonjour,\n\nVoici les articles à réapprovisionner au {{date}} : {{out_count}} en rupture et {{low_count}} en stock bas (au seuil défini pour chacun).\n\nLe stock indiqué est la quantité vendable, réservations des commandes en attente de paiement déduites. Cet e-mail est envoyé au plus une fois par jour, et seulement s''il y a quelque chose à signaler.',
   array['date', 'out_count', 'low_count'], 'normal');

insert into public.email_template_translations (template_id, locale, subject, preheader, body, status)
select t.id, 'en', v.subject, v.preheader, v.body, 'published'
  from (values
    ('stock_digest', 'Stock on {{date}}: {{out_count}} out, {{low_count}} low', 'Items to restock.',
     E'Hello,\n\nHere is what needs restocking on {{date}}: {{out_count}} out of stock and {{low_count}} low (at or under the threshold set for each).\n\nThe stock shown is the sellable quantity, with reservations from orders awaiting payment deducted. This e-mail is sent at most once a day, and only when there is something to report.')
  ) as v(key, subject, preheader, body)
  join public.email_templates t on t.key = v.key;

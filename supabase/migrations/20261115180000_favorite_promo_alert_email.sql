-- =============================================================================
-- Promotion alert for favourites (decision 148, on decision 142's pipeline)
-- =============================================================================
-- A fifth automatic e-mail beside the abandoned cart, the product review
-- request, the loyalty reward and the course review request. The dashboard's
-- first-steps card says "add a favourite: we tell you about promotions"; until
-- now nothing did. This is that promise, with the narrowest reading of the law:
--
--   favorite_promo:<user id>:<hash of the series listed>
--       a member with a favourite product whose price has just been cut by the
--       database's own engine (a running unit cut, `price_cut_history`), for
--       members who gave MARKETING CONSENT only (profiles.marketing_opt_in, or a
--       newsletter subscription on their address) — it is commercial
--       prospection, like the abandoned cart (decision 142 (a)).
--
-- What is announced is exactly what the shop window shows (decision 129): a
-- product is listed only when `storefront_price_references()` says state =
-- 'reduced', and the e-mail quotes that reference price ("lowest price of the
-- 30 days before the reduction") next to the current price and the percentage
-- the database computed — never a price typed anywhere else. Conditional
-- offers, codes and loyalty rewards are not announced (decision 129 (i)).
--
-- Rules, all reversible (one row of settings, functions replaceable):
--   * only favourites added BEFORE the reduction started (afterwards the member
--     saw the promotion on the product page already);
--   * only a reduction that started within favorite_promo_window_days (7 by
--     default) — so switching on never mails a backlog, and a promotion that
--     runs for months is announced once, when it starts;
--   * once per (member, product, reduction start): favorite_promo_alerts;
--   * only products that can be bought now (stock in_stock / low_stock);
--   * one e-mail per member and week, grouping up to 6 products (the highest
--     percentages first, the others wait for the next e-mail while their
--     reduction is still recent);
--   * the address has not stopped reminders (email_reminder_preferences, the
--     same link and switch as the other reminders).
--
-- OFF until switched on in private.email_reminder_settings, like the others
-- (the opt-out page must be live in production first).
-- =============================================================================

alter table private.email_reminder_settings
  add column favorite_promo_enabled     boolean not null default false,
  add column favorite_promo_window_days integer not null default 7
    check (favorite_promo_window_days between 1 and 29);

comment on column private.email_reminder_settings.favorite_promo_enabled is
  'Promotion alert for a member''s favourites (decision 148). Off by default; marketing consent required.';
comment on column private.email_reminder_settings.favorite_promo_window_days is
  'A reduction is announced only within this many days of starting (decision 148).';

-- What was already announced, so a series is told once per member and product.
create table public.favorite_promo_alerts (
  user_id              uuid not null references public.profiles (id) on delete cascade,
  product_id           uuid not null references public.products (id) on delete cascade,
  reduction_started_at timestamptz not null,
  notified_at          timestamptz not null default now(),
  primary key (user_id, product_id, reduction_started_at)
);

comment on table public.favorite_promo_alerts is
  'Decision 148: favourite products whose reduction was announced to the member by e-mail. Backend only; erased with the account.';

alter table public.favorite_promo_alerts enable row level security;
revoke all on public.favorite_promo_alerts from public, anon, authenticated;
grant select, insert on public.favorite_promo_alerts to service_role;

-- The members to write to, with the products to list (up to 6 each).
create or replace function public.pending_favorite_promo_emails(p_limit integer default 25)
returns table (
  user_id    uuid,
  email      text,
  locale     text,
  first_name text,
  items      jsonb,
  event_key  text
)
language sql
stable
security definer
set search_path = ''
as $$
  with s as (select * from private.email_reminder_settings where id),
  refs as (
    select r.*
      from public.storefront_price_references() r
      cross join s
     where s.favorite_promo_enabled
       and r.course_id is null
       and r.product_id is not null
       and r.state = 'reduced'
       and r.reduction_started_at > now() - make_interval(days => s.favorite_promo_window_days)
       and exists (select 1 from public.inventory_items i
                    where i.stock_status in ('in_stock', 'low_stock')
                      and ((r.variant_id is not null and i.variant_id = r.variant_id)
                           or (r.variant_id is null
                               and (i.product_id = r.product_id
                                    or i.variant_id in (select v.id from public.product_variants v
                                                         where v.product_id = r.product_id and v.is_active)))))
  ),
  best as (
    -- One line per product: its deepest reduction (a variant's, when it is deeper).
    select distinct on (r.product_id)
           r.product_id, r.variant_id, r.currency, r.price, r.reference_price, r.discount_percent, r.reduction_started_at
      from refs r
     order by r.product_id, r.discount_percent desc, r.price
  ),
  cand as (
    select w.user_id, b.*,
           row_number() over (partition by w.user_id order by b.discount_percent desc, b.product_id) as rn
      from public.wishlist_items w
      join best b on b.product_id = w.product_id
     where w.created_at < b.reduction_started_at
       and not exists (select 1 from public.favorite_promo_alerts a
                        where a.user_id = w.user_id and a.product_id = w.product_id
                          and a.reduction_started_at = b.reduction_started_at)
  ),
  members as (
    select c.user_id,
           md5(string_agg(c.product_id::text || '@' || c.reduction_started_at::text, ',' order by c.product_id)) as series_hash,
           jsonb_agg(jsonb_build_object(
                       'product_id', c.product_id,
                       'reduction_started_at', c.reduction_started_at,
                       'currency', c.currency,
                       'price', c.price,
                       'reference_price', c.reference_price,
                       'discount_percent', c.discount_percent,
                       'variant', (select v.name from public.product_variants v where v.id = c.variant_id),
                       'name', coalesce((select pt.name from public.product_translations pt
                                          where pt.product_id = c.product_id and pt.locale = loc.locale and pt.status = 'published'), p.name),
                       'slug', case when loc.locale = 'fr' then p.slug
                                    else coalesce((select pt.slug from public.product_translations pt
                                                    where pt.product_id = c.product_id and pt.locale = loc.locale and pt.status = 'published'), p.slug) end,
                       'image_path', (select m.storage_path from public.product_media m
                                       where m.product_id = c.product_id and m.media_type = 'image'
                                       order by (c.variant_id is not null and m.variant_id = c.variant_id) desc, m.is_primary desc, m.position
                                       limit 1))
                     order by c.rn) as items,
           max(loc.locale) as locale
      from cand c
      join public.profiles pr on pr.id = c.user_id
      cross join lateral (select case when pr.preferred_locale = 'en' then 'en' else 'fr' end as locale) loc
      join public.products p on p.id = c.product_id
     where c.rn <= 6
     group by c.user_id
  )
  select m.user_id, lower(btrim(pr.email)), m.locale, coalesce(btrim(pr.first_name), ''), m.items,
         'favorite_promo:' || m.user_id::text || ':' || m.series_hash
    from members m
    join public.profiles pr on pr.id = m.user_id and pr.status = 'active'
   where (pr.marketing_opt_in
          or exists (select 1 from public.newsletter_subscriptions ns
                      where ns.email = lower(btrim(pr.email)) and ns.status = 'subscribed'))
     and private.email_reminders_allowed(pr.email)
     and not private.email_recently_sent('favorite_promo', pr.email, interval '7 days')
     and private.email_event_open('favorite_promo:' || m.user_id::text || ':' || m.series_hash)
   order by m.user_id
   limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.pending_favorite_promo_emails(integer) from public, anon, authenticated;
grant execute on function public.pending_favorite_promo_emails(integer) to service_role;

-- Called by the sending code once the e-mail went out: the listed series are
-- never announced to this member again. `p_items` is the `items` array that
-- pending_favorite_promo_emails() returned (only product_id and
-- reduction_started_at are read).
create or replace function public.record_favorite_promo_alerts(p_user_id uuid, p_items jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_user_id is null or p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'record_favorite_promo_alerts: user and items required' using errcode = '22023';
  end if;
  insert into public.favorite_promo_alerts (user_id, product_id, reduction_started_at)
  select p_user_id, (i ->> 'product_id')::uuid, (i ->> 'reduction_started_at')::timestamptz
    from jsonb_array_elements(p_items) i
   where i ? 'product_id' and i ? 'reduction_started_at'
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.record_favorite_promo_alerts(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_favorite_promo_alerts(uuid, jsonb) to service_role;

-- Template (French base, English published). The product cards, the prices and
-- the opt-out link are added by the sending code.
insert into public.email_templates (key, name, description, subject, preheader, body, variables, translation_priority) values
  ('favorite_promo', 'Promotion on a favourite',
   'Sent when a favourite product goes on sale, to members who gave marketing consent, at most once a week (decision 148)',
   'Un de vos favoris est en promotion', 'Les prix ont baissé sur des produits que vous avez gardés de côté.',
   E'Bonjour {{first_name}},\n\nBonne nouvelle : le prix d''un ou plusieurs produits que vous avez mis en favoris vient de baisser sur Global Toothgems.\n\nLes réductions sont limitées dans le temps et le stock n''est pas illimité : retrouvez vos favoris ci-dessous.',
   array['first_name'], 'normal');

insert into public.email_template_translations (template_id, locale, subject, preheader, body, status)
select t.id, 'en', 'A favourite of yours is on sale', 'Prices have dropped on products you saved.',
       E'Hello {{first_name}},\n\nGood news: the price of one or more products you saved as favourites has just dropped on Global Toothgems.\n\nReductions are limited in time and stock is not unlimited: you will find your favourites below.',
       'published'
  from public.email_templates t
 where t.key = 'favorite_promo';

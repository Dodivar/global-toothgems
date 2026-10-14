-- Back-in-stock alerts (decision 90): a customer asks, on the page of a product
-- (or of one of its options) that is out of stock, to be e-mailed once it can be
-- bought again. One request = one e-mail, ever.
--
--   browser  request_back_in_stock_alert(product, variant, email, locale)
--              anon or member; the target must be out of stock NOW (checked here,
--              the page may be stale); a member's address is the account's
--   sweep    pending_back_in_stock_emails()   (service role, send-pending-emails,
--              pg_cron every 5 minutes): the waiting requests whose target is
--              sellable again, oldest first
--   e-mail   template `back_in_stock`, event key back_in_stock:<request id>:
--              email_log makes it exactly-once; a trigger on email_log then
--              stamps the request `notified_at`, which closes it for good
--
-- No time window, unlike the other pending_* sweeps: a request made months ago
-- still deserves its e-mail. What triggers it is the stock at sweep time. A
-- product that comes back and sells out again before the sweep simply waits for
-- the next restock. Once a request is notified a new one can be made (e.g. the
-- next time the product runs out), but the notified one never sends again.
--
-- Nobody reads the table through the API (no grant to anon / authenticated):
-- the browser only ever sees the answer of the request function, which says the
-- same thing whether or not the address had already asked.

create table public.back_in_stock_requests (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  variant_id  uuid references public.product_variants (id) on delete cascade,
  email       text not null check (char_length(email) between 3 and 254 and email = lower(email)),
  user_id     uuid references public.profiles (id) on delete cascade,
  locale      text not null default 'fr' references public.languages (code) on update cascade,
  -- sha256 of who asked (account or network address), for the throttle only.
  actor_hash  text not null check (actor_hash ~ '^[0-9a-f]{64}$'),
  notified_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.back_in_stock_requests is
  'Back-in-stock e-mail requests: one e-mail per request (email_log back_in_stock:<id>), then notified_at closes it. Backend only.';

-- One waiting request per address and target; a notified one does not block a new one.
create unique index back_in_stock_requests_waiting_uidx
  on public.back_in_stock_requests (email, product_id, variant_id) nulls not distinct
  where notified_at is null;
create index back_in_stock_requests_waiting_idx
  on public.back_in_stock_requests (created_at) where notified_at is null;
create index back_in_stock_requests_product_idx on public.back_in_stock_requests (product_id);
create index back_in_stock_requests_variant_idx on public.back_in_stock_requests (variant_id) where variant_id is not null;
create index back_in_stock_requests_user_idx on public.back_in_stock_requests (user_id) where user_id is not null;
create index back_in_stock_requests_actor_idx on public.back_in_stock_requests (actor_hash, created_at);

alter table public.back_in_stock_requests enable row level security;
revoke all on public.back_in_stock_requests from public, anon, authenticated;
grant select, update on public.back_in_stock_requests to service_role;

-- ---------------------------------------------------------------------------
-- Asking. Answers {ok: true} or {ok: false, error}:
--   invalid_email      the visitor's address is not an address
--   unavailable        no such product / option on sale, or a gift card
--   variant_required   the product sells options: say which one
--   in_stock           the target can be bought right now
--   too_many_requests  more than 10 new requests in an hour from the same
--                      account or network address, or 30 waiting for one address
-- {ok: true} whether the address had already asked or not.
-- ---------------------------------------------------------------------------
create or replace function public.request_back_in_stock_alert(
  p_product_id uuid,
  p_variant_id uuid default null,
  p_email      text default null,
  p_locale     text default 'fr'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_email   text;
  v_actor   text;
  v_headers text;
  v_hash    text;
  v_status  text;
  v_has_variants boolean;
begin
  -- The address: the account's for a member (never another one), else the typed one.
  if v_user is not null then
    select lower(btrim(p.email)) into v_email from public.profiles p where p.id = v_user and p.status = 'active';
    if v_email is null then
      return jsonb_build_object('ok', false, 'error', 'unavailable');
    end if;
    v_actor := 'user:' || v_user;
  else
    v_email := lower(btrim(coalesce(p_email, '')));
    -- The address shape the sender accepts (_shared/email/send.ts).
    if char_length(v_email) > 254 or v_email !~ '^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$' then
      return jsonb_build_object('ok', false, 'error', 'invalid_email');
    end if;
    -- The address the platform saw (`sb-forwarded-for` / `cf-connecting-ip`); the
    -- first entry of `x-forwarded-for` is whatever the caller sent, so never used.
    begin
      v_headers := current_setting('request.headers', true);
      v_actor := 'ip:' || coalesce(nullif(btrim((v_headers::jsonb) ->> 'sb-forwarded-for'), ''),
                                   nullif(btrim((v_headers::jsonb) ->> 'cf-connecting-ip'), ''), 'unknown');
    exception when others then
      v_actor := 'ip:unknown';
    end;
  end if;
  if not exists (select 1 from public.languages l where l.code = coalesce(p_locale, 'fr') and l.is_enabled) then
    p_locale := 'fr';
  end if;

  -- The target: a product on sale (not a gift card), and its option when it sells options.
  if not exists (select 1 from public.products p
                  where p.id = p_product_id and p.status = 'active' and p.product_type <> 'gift_card') then
    return jsonb_build_object('ok', false, 'error', 'unavailable');
  end if;
  v_has_variants := exists (select 1 from public.product_variants v where v.product_id = p_product_id and v.is_active);
  if v_has_variants then
    if p_variant_id is null then
      return jsonb_build_object('ok', false, 'error', 'variant_required');
    end if;
    if not exists (select 1 from public.product_variants v
                    where v.id = p_variant_id and v.product_id = p_product_id and v.is_active) then
      return jsonb_build_object('ok', false, 'error', 'unavailable');
    end if;
    select i.stock_status into v_status from public.inventory_items i where i.variant_id = p_variant_id;
  else
    p_variant_id := null;                     -- stock is the product's own
    select i.stock_status into v_status from public.inventory_items i where i.product_id = p_product_id;
  end if;
  -- No stock row = always sellable (as the storefront shows it).
  if v_status is distinct from 'out_of_stock' then
    return jsonb_build_object('ok', false, 'error', 'in_stock');
  end if;

  -- Already waiting for this target: nothing to add, same answer.
  if exists (select 1 from public.back_in_stock_requests r
              where r.email = v_email and r.product_id = p_product_id
                and r.variant_id is not distinct from p_variant_id and r.notified_at is null) then
    return jsonb_build_object('ok', true);
  end if;

  v_hash := encode(extensions.digest(v_actor, 'sha256'), 'hex');
  if (select count(*) from public.back_in_stock_requests r
       where r.actor_hash = v_hash and r.created_at > now() - interval '1 hour') >= 10
     or (select count(*) from public.back_in_stock_requests r
          where r.email = v_email and r.notified_at is null) >= 30 then
    return jsonb_build_object('ok', false, 'error', 'too_many_requests');
  end if;

  insert into public.back_in_stock_requests (product_id, variant_id, email, user_id, locale, actor_hash)
  values (p_product_id, p_variant_id, v_email, v_user, p_locale, v_hash)
  on conflict (email, product_id, variant_id) where notified_at is null do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.request_back_in_stock_alert(uuid, uuid, text, text) from public;
grant execute on function public.request_back_in_stock_alert(uuid, uuid, text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- What the sweep sends: waiting requests whose target is sellable again (stock
-- row not `out_of_stock`, or no stock row), product and option still on sale,
-- and whose e-mail is still open in email_log. Names, address key and picture
-- in the request's language (published translation, else French).
-- ---------------------------------------------------------------------------
create or replace function public.pending_back_in_stock_emails(p_limit integer default 25)
returns table (
  request_id   uuid,
  email        text,
  locale       text,
  product_name text,
  variant_name text,
  product_slug text,
  image_path   text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.email, r.locale,
         coalesce((select pt.name from public.product_translations pt
                    where pt.product_id = p.id and pt.locale = r.locale and pt.status = 'published'), p.name),
         case when v.id is null then null
              else coalesce((select vt.name from public.product_variant_translations vt
                              where vt.variant_id = v.id and vt.locale = r.locale and vt.status = 'published'), v.name) end,
         case when r.locale = 'fr' then p.slug
              else coalesce((select pt.slug from public.product_translations pt
                              where pt.product_id = p.id and pt.locale = r.locale and pt.status = 'published'), p.slug) end,
         (select m.storage_path from public.product_media m
           where m.product_id = p.id and m.media_type = 'image'
           order by (r.variant_id is not null and m.variant_id = r.variant_id) desc, m.is_primary desc, m.position
           limit 1)
    from public.back_in_stock_requests r
    join public.products p on p.id = r.product_id and p.status = 'active'
    left join public.product_variants v on v.id = r.variant_id
   where r.notified_at is null
     and (r.variant_id is null or v.is_active)
     and coalesce((select i.stock_status from public.inventory_items i
                    where (r.variant_id is not null and i.variant_id = r.variant_id)
                       or (r.variant_id is null and i.product_id = r.product_id)), 'in_stock') <> 'out_of_stock'
     and private.email_event_open('back_in_stock:' || r.id::text)
   order by r.created_at
   limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.pending_back_in_stock_emails(integer) from public, anon, authenticated;
grant execute on function public.pending_back_in_stock_emails(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Closing a request: once its e-mail has gone out (or was handed to the
-- provider and came back bounced / complained), the request is notified.
-- ---------------------------------------------------------------------------
create or replace function private.close_back_in_stock_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.event_key like 'back_in_stock:%'
     and new.status in ('sent', 'delivered', 'opened', 'bounced', 'complained') then
    update public.back_in_stock_requests
       set notified_at = coalesce(new.sent_at, now()), updated_at = now()
     where id = substring(new.event_key from 15)::uuid and notified_at is null;
  end if;
  return null;
end;
$$;

revoke all on function private.close_back_in_stock_request() from public, anon, authenticated;

create trigger email_log_close_back_in_stock
  after insert or update of status on public.email_log
  for each row
  when (new.event_key like 'back_in_stock:%')
  execute function private.close_back_in_stock_request();

-- ---------------------------------------------------------------------------
-- The template. No first name (a visitor gives only an address); the product
-- link is a button added by the sending code, never a substituted URL.
-- ---------------------------------------------------------------------------
insert into public.email_templates (key, name, description, subject, preheader, body, variables, translation_priority) values
  ('back_in_stock', 'Back in stock', 'Sent once to a customer who asked to be told when a product is available again',
   '{{product_name}} est de retour', 'Vous nous aviez demandé de vous prévenir.',
   E'Bonjour,\n\nBonne nouvelle : {{product_name}} est de nouveau disponible sur la boutique Global Toothgems.\n\nLes quantités sont limitées : nous ne pouvons pas vous le réserver, alors ne tardez pas.\n\nVous recevez ce message unique parce que vous avez demandé à être prévenu(e) du retour de cet article. Nous ne vous écrirons plus à ce sujet.',
   array['product_name'], 'normal');

insert into public.email_template_translations (template_id, locale, subject, preheader, body, status)
select t.id, 'en', v.subject, v.preheader, v.body, 'published'
  from (values
    ('back_in_stock', '{{product_name}} is back', 'You asked us to let you know.',
     E'Hello,\n\nGood news: {{product_name}} is available again in the Global Toothgems shop.\n\nQuantities are limited and we cannot hold it for you, so do not wait too long.\n\nYou are receiving this one-off message because you asked to be told when this item came back. We will not write to you about it again.')
  ) as v(key, subject, preheader, body)
  join public.email_templates t on t.key = v.key;

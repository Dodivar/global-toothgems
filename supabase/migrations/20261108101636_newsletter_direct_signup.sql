-- =============================================================================
-- Newsletter: sign-up without a confirmation e-mail (owner's choice, 2026-11-08)
-- =============================================================================
-- The double opt-in e-mail was felt as too much friction. A subscription now
-- starts at once when the form brings another proof that a person asked:
--
--   member_session  the signed-in member subscribes the address of their own
--                   account (verified when the account was created)
--   captcha         a visitor whose request passed the captcha (Cloudflare
--                   Turnstile, checked by the Edge Function newsletter-subscribe)
--
-- Without either (captcha not configured yet), the Edge Function keeps the
-- double opt-in of newsletter_subscribe() / newsletter_confirm().
--
-- newsletter_subscribe_direct(email, locale, source, policy_version, method),
-- service role only, same validation and per-e-mail throttle as
-- newsletter_subscribe(). It never re-activates a bounced or complaining
-- address. When the address belongs to a member account, the subscription is
-- that member's marketing_email consent (consent_records, source 'newsletter'),
-- as when they confirm a link: the consent sync then creates or updates their
-- list entry. It answers {"status": "subscribed"} whether the address was new or
-- already on the list, or the bounced / complained status (the Edge Function
-- answers the visitor the same way in every case).
--
-- newsletter_subscriptions.opt_in_method keeps how each subscription was
-- obtained (proof of consent): double_opt_in | member_session | captcha |
-- account (a member's own choice in their profile, registration or checkout).
-- =============================================================================

alter table public.newsletter_subscriptions
  add column opt_in_method text
    check (opt_in_method in ('double_opt_in', 'member_session', 'captcha', 'account'));

comment on column public.newsletter_subscriptions.opt_in_method is
  'How the subscription was obtained: double_opt_in (e-mailed link), member_session, captcha, account (member''s own consent record).';

-- Subscriptions already confirmed: by link for visitors, by their own consent for members.
update public.newsletter_subscriptions
   set opt_in_method = case when source in ('account', 'checkout') then 'account' else 'double_opt_in' end
 where confirmed_at is not null;

create or replace function public.newsletter_subscribe_direct(
  p_email          text,
  p_locale         text,
  p_source         text,
  p_policy_version text,
  p_method         text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_sub   public.newsletter_subscriptions;
  v_user  uuid;
begin
  if private.caller_jwt_role() not in ('service_role', '') then
    raise exception 'newsletter_subscribe_direct: server only' using errcode = '42501';
  end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(v_email) > 254 then
    raise exception 'newsletter_subscribe_direct: invalid e-mail' using errcode = '22023';
  end if;
  if nullif(btrim(p_policy_version), '') is null then
    raise exception 'newsletter_subscribe_direct: the privacy policy version shown on the form is required' using errcode = '22023';
  end if;
  if p_source not in ('footer', 'home', 'checkout') then
    raise exception 'newsletter_subscribe_direct: unknown source' using errcode = '22023';
  end if;
  if p_method not in ('member_session', 'captcha') then
    raise exception 'newsletter_subscribe_direct: unknown method' using errcode = '22023';
  end if;
  if not exists (select 1 from public.languages where code = p_locale and is_enabled) then
    p_locale := 'fr';
  end if;
  if not private.hit_rate_limit('newsletter', v_email, 3, interval '1 hour') then
    raise exception 'newsletter_subscribe_direct: too many requests' using errcode = 'PT429';
  end if;

  select * into v_sub from public.newsletter_subscriptions where lower(email) = v_email for update;
  if v_sub.status in ('bounced', 'complained') then
    return jsonb_build_object('status', v_sub.status);      -- never re-mail a complaint or a dead address
  end if;
  if v_sub.status = 'subscribed' then
    return jsonb_build_object('status', 'subscribed');
  end if;

  v_user := coalesce(v_sub.user_id, (select p.id from public.profiles p where lower(p.email) = v_email limit 1));
  if v_user is not null then
    -- A member's address: their consent history records it, and the consent sync
    -- (sync_newsletter_from_consent) creates or re-activates their list entry.
    insert into public.consent_records (user_id, purpose, granted, policy_version, source)
    values (v_user, 'marketing_email', true, btrim(p_policy_version), 'newsletter');
    update public.newsletter_subscriptions
       set source = p_source, opt_in_method = p_method
     where user_id = v_user and status = 'subscribed';
  elsif v_sub.id is null then
    insert into public.newsletter_subscriptions
      (email, locale, status, source, policy_version, confirmed_at, opt_in_method)
    values
      (v_email, p_locale, 'subscribed', p_source, btrim(p_policy_version), now(), p_method);
  else
    update public.newsletter_subscriptions
       set status = 'subscribed', locale = p_locale, source = p_source, policy_version = btrim(p_policy_version),
           confirmed_at = now(), unsubscribed_at = null, confirm_token_hash = null, confirm_expires_at = null,
           opt_in_method = p_method
     where id = v_sub.id;
  end if;
  return jsonb_build_object('status', 'subscribed');
end;
$$;

comment on function public.newsletter_subscribe_direct(text, text, text, text, text) is
  'Subscribes at once on a member session or a passed captcha (service role only); never re-activates a bounce or complaint.';

revoke all on function public.newsletter_subscribe_direct(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.newsletter_subscribe_direct(text, text, text, text, text) to service_role;

-- How a subscription started when no function says it: the confirmation link
-- (a pending row whose token is used) is double_opt_in; a member's own consent
-- record (profile, registration, checkout, through the consent sync) is account.
-- newsletter_subscribe_direct() sets its method itself, after the sync.
create or replace function private.newsletter_mark_opt_in_method()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'subscribed' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.opt_in_method is null and new.user_id is not null then
      new.opt_in_method := 'account';
    end if;
    return new;
  end if;
  if old.status <> 'subscribed' and new.opt_in_method is not distinct from old.opt_in_method then
    new.opt_in_method := case
      when old.status = 'pending' and old.confirm_token_hash is not null and new.confirm_token_hash is null
        then 'double_opt_in'
      when new.user_id is not null then 'account'
      else coalesce(new.opt_in_method, 'double_opt_in')
    end;
  end if;
  return new;
end;
$$;

revoke all on function private.newsletter_mark_opt_in_method() from public;

create trigger newsletter_subscriptions_mark_opt_in_method
  before insert or update on public.newsletter_subscriptions
  for each row execute function private.newsletter_mark_opt_in_method();

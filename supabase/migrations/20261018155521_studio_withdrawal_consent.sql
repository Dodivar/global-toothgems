-- =============================================================================
-- 3D Studio: express request for immediate access (decision 94 (a), 2026-10-18)
--
-- The Studio is an online service that starts at once. Under French consumer law
-- (Code de la consommation L221-25), a member who wants it to start within the
-- 14-day withdrawal period must ask for it expressly, and acknowledge that a
-- withdrawal then costs the share of the subscription already used. The
-- checkbox on the plans page carries that request; `create-studio-subscription`
-- refuses a checkout without it and records it here before creating the Stripe
-- session. The wording accepted is identified by `policy_version`
-- (`studio-withdrawal-2026-10`, text in `_shared/studioBilling.ts`).
--
--   consent_records    new purpose `studio_immediate_access` (source `checkout`)
--   e-mail             `studio_subscription_confirmation`, sent once per new
--                      subscription by the `send-pending-emails` sweep
--                      (event key studio_subscription:<subscription id>): the
--                      durable confirmation, restating the request accepted
-- =============================================================================

alter table public.consent_records drop constraint consent_records_purpose_check;
alter table public.consent_records add constraint consent_records_purpose_check
  check (purpose in ('terms', 'privacy', 'marketing_email',
                     'cookies_preferences', 'cookies_analytics', 'cookies_marketing',
                     'studio_immediate_access'));

-- ---------------------------------------------------------------------------
-- What the sweep sends: subscriptions whose first invoice was paid in the last
-- 7 days, with the member's latest immediate-access request made before the
-- subscription existed (a subscription without one — created before this
-- migration — sends nothing), and whose e-mail is still open in email_log.
-- ---------------------------------------------------------------------------
create or replace function public.pending_studio_subscription_emails(p_limit integer default 25)
returns table (
  subscription_id  uuid,
  email            text,
  locale           text,
  plan             text,
  billing_interval text,
  amount           numeric,
  currency         text,
  consent_version  text,
  consented_at     timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, p.email, p.preferred_locale,
         s.plan, coalesce(s.billing_interval, 'month'), i.amount, i.currency,
         c.policy_version, c.created_at
    from public.studio_subscriptions s
    join public.profiles p on p.id = s.user_id
    join lateral (
      select inv.amount, inv.currency
        from public.studio_subscription_invoices inv
       where inv.subscription_id = s.id
         and inv.status = 'paid'
         and inv.billing_reason = 'subscription_create'
       order by inv.occurred_at
       limit 1
    ) i on true
    join lateral (
      select cr.policy_version, cr.created_at
        from public.consent_records cr
       where cr.user_id = s.user_id
         and cr.purpose = 'studio_immediate_access'
         and cr.granted
         and cr.created_at <= s.created_at
       order by cr.created_at desc
       limit 1
    ) c on true
   where s.created_at >= now() - interval '7 days'
     and p.email is not null
     and private.email_event_open('studio_subscription:' || s.id::text)
   order by s.created_at
   limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.pending_studio_subscription_emails(integer) from public, anon, authenticated;
grant execute on function public.pending_studio_subscription_emails(integer) to service_role;

-- ---------------------------------------------------------------------------
-- The template. The request the member accepted, the plan and the amount are
-- blocks added by the sending code (exact wording of the accepted version),
-- never staff-editable text.
-- ---------------------------------------------------------------------------
insert into public.email_templates (key, name, description, subject, preheader, body, variables, translation_priority) values
  ('studio_subscription_confirmation', '3D Studio subscription confirmed',
   'Sent once when a 3D Studio subscription is paid for the first time; restates the immediate-access request the member accepted',
   'Votre abonnement au Studio 3D est actif', 'Le récapitulatif de votre abonnement et de votre demande d''accès immédiat.',
   E'Bonjour,\n\nMerci pour votre abonnement {{plan_name}} au Studio 3D : votre accès est ouvert.\n\nVous trouverez ci-dessous le récapitulatif de votre abonnement et la demande d''accès immédiat que vous avez acceptée avant le paiement.\n\nVous pouvez résilier à tout moment depuis votre compte : l''abonnement prend fin à la fin de la période payée. Pour exercer votre droit de rétractation dans les 14 jours suivant la souscription, contactez-nous.',
   array['plan_name'], 'high');

insert into public.email_template_translations (template_id, locale, subject, preheader, body, status)
select t.id, 'en', v.subject, v.preheader, v.body, 'published'
  from (values
    ('studio_subscription_confirmation', 'Your 3D Studio subscription is active',
     'A summary of your subscription and of your request for immediate access.',
     E'Hello,\n\nThank you for your {{plan_name}} subscription to the 3D Studio: your access is open.\n\nBelow is a summary of your subscription and of the request for immediate access you accepted before paying.\n\nYou can cancel at any time from your account: the subscription ends at the close of the paid period. To exercise your right of withdrawal within 14 days of subscribing, contact us.')
  ) as v(key, subject, preheader, body)
  join public.email_templates t on t.key = v.key;

-- 3D Studio withdrawal credit note e-mail, always on its own (decision 115, follow-up of 20261026211240_studio_invoices).
--
-- The withdrawal acknowledgement is sent right after the refund is created,
-- exactly when Stripe confirms it: the credit note could be issued between the
-- acknowledgement's lookup and its claim, and then neither e-mail carried it.
-- Now the acknowledgement never carries the credit note; `studio_credit_note`
-- sends it once it is issued and the acknowledgement has gone out.

create or replace function public.pending_studio_credit_note_emails(p_limit integer default 25)
returns table (
  withdrawal_id  uuid,
  email          text,
  locale         text,
  plan           text,
  refund_amount  numeric,
  currency       text,
  invoice_number text
)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, p.email, p.preferred_locale, s.plan, w.refund_amount, w.currency, d.invoice_number
    from public.invoices d
    join public.studio_withdrawals w on w.id = d.studio_withdrawal_id
    join public.studio_subscriptions s on s.id = w.subscription_id
    join public.profiles p on p.id = w.user_id
   where d.kind = 'credit_note'
     and d.issued_at >= now() - interval '7 days'
     and p.email is not null
     and exists (select 1 from public.email_log e
                  where e.event_key = 'studio_withdrawal:' || w.id::text
                    and e.status in ('sent', 'delivered', 'opened', 'bounced', 'complained'))
     and private.email_event_open('studio_credit_note:' || w.id::text)
   order by d.issued_at
   limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.pending_studio_credit_note_emails(integer) from public, anon, authenticated;
grant execute on function public.pending_studio_credit_note_emails(integer) to service_role;

update public.email_templates
   set description = 'Sent once a 3D Studio withdrawal refund is confirmed (after the acknowledgement), with the credit note as a PDF'
 where key = 'studio_credit_note';

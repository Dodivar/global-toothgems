-- =============================================================================
-- Course review request e-mail (decision 141 addendum, on decision 142's pipeline)
-- =============================================================================
-- A fourth automatic reminder, beside the abandoned cart, the product review
-- request and the loyalty reward (migration 20261113111250_email_reminders):
--
--   course_review_request:<course_completions id>
--       a learner who completed a course, course_review_request_delay_days
--       (3 by default) after the completion, while they may review it and have
--       not: the course is published, their account active, their entitlement
--       active (private.course_review_refusal() answers null — the same rule as
--       the review insert), no review of theirs for the course.
--
-- Same guarantees as the other reminders: the email_log event key (once per
-- completion), the address's "stop these reminders" switch
-- (email_reminder_preferences, link added by the sending code), and a
-- per-address cap (no other course review request within 7 days, so two
-- courses finished the same week get one e-mail each, a week apart). Sent to
-- members as part of the customer relationship, like the product review
-- request. Completions older than 30 days are never asked (no backlog when the
-- switch is turned on).
--
-- OFF until switched on in private.email_reminder_settings, like the others
-- (the opt-out page must be live in production first).
-- =============================================================================

alter table private.email_reminder_settings
  add column course_review_request_enabled    boolean not null default false,
  add column course_review_request_delay_days integer not null default 3
    check (course_review_request_delay_days between 1 and 29);

comment on column private.email_reminder_settings.course_review_request_enabled is
  'Course review request e-mail after a completed course (decision 141 addendum). Off by default.';

-- The learners to ask. Course title and slug in the learner's language
-- (published English translation, else the French base), cover media for the
-- picture (served by the site's /media/formations/<id> route).
create or replace function public.pending_course_review_request_emails(p_limit integer default 25)
returns table (
  completion_id    uuid,
  course_id        uuid,
  email            text,
  locale           text,
  first_name       text,
  course_title     text,
  course_slug      text,
  cover_media_id   uuid,
  cover_updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with s as (select * from private.email_reminder_settings where id)
  select cc.id, c.id, lower(btrim(pr.email)), loc.locale, coalesce(btrim(pr.first_name), ''),
         case when loc.locale = 'en' then coalesce(nullif(btrim(ct.title), ''), c.title) else c.title end,
         case when loc.locale = 'en' then coalesce(nullif(btrim(ct.slug), ''), c.slug) else c.slug end,
         m.id, m.updated_at
    from public.course_completions cc
    cross join s
    join public.courses c on c.id = cc.course_id
    join public.profiles pr on pr.id = cc.user_id and pr.status = 'active'
    cross join lateral (select case when pr.preferred_locale = 'en' then 'en' else 'fr' end as locale) loc
    left join public.course_translations ct on ct.course_id = c.id and ct.locale = 'en' and ct.status = 'published'
    left join public.training_media m on m.id = c.cover_media_id
   where s.course_review_request_enabled
     and cc.completed_at <= now() - make_interval(days => s.course_review_request_delay_days)
     and cc.completed_at > now() - interval '30 days'
     and private.course_review_refusal(cc.user_id, cc.course_id) is null
     and not exists (select 1 from public.reviews r where r.user_id = cc.user_id and r.course_id = cc.course_id)
     and private.email_reminders_allowed(pr.email)
     and not private.email_recently_sent('course_review_request', pr.email, interval '7 days')
     and private.email_event_open('course_review_request:' || cc.id::text)
   order by cc.completed_at
   limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.pending_course_review_request_emails(integer) from public, anon, authenticated;
grant execute on function public.pending_course_review_request_emails(integer) to service_role;

-- Template (French base, English published). The course card, the button to
-- the course's reviews and the opt-out link are added by the sending code.
insert into public.email_templates (key, name, description, subject, preheader, body, variables, translation_priority) values
  ('course_review_request', 'Course review request',
   'Sent once, a few days after a learner completed a course they have not reviewed yet (decision 141 addendum)',
   'Votre avis sur la formation {{course_name}}', 'Votre expérience peut guider la prochaine artiste.',
   E'Bonjour {{first_name}},\n\nBravo, vous avez terminé la formation {{course_name}} il y a quelques jours !\n\nVotre avis compte beaucoup : il aide les artistes qui hésitent encore à se lancer, et il nous aide à améliorer nos formations. Une note et quelques mots suffisent.\n\nLes avis sont publiés après une vérification de notre équipe. Seules les élèves ayant terminé la formation peuvent en laisser un.',
   array['first_name', 'course_name'], 'normal');

insert into public.email_template_translations (template_id, locale, subject, preheader, body, status)
select t.id, 'en', 'Your review of the {{course_name}} training', 'Your experience can guide the next artist.',
       E'Hello {{first_name}},\n\nWell done, you finished the {{course_name}} training a few days ago!\n\nYour review matters a lot: it helps artists who are still hesitating to take the step, and it helps us improve our trainings. A rating and a few words are enough.\n\nReviews are published after a check by our team. Only students who finished the training can leave one.',
       'published'
  from public.email_templates t where t.key = 'course_review_request';
